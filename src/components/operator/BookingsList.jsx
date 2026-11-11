"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

// Delays filtering until the user stops typing, avoiding expensive re-renders on each keystroke
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
import StatusActionMenu from "@/components/operator/StatusActionMenu";
import { useBookingDrawer } from "@/components/operator/useBookingDrawer";
import { useOperator } from "@/components/operator/OperatorContext";
import {
  Search, X, AlertTriangle, Loader2, Check, Plane, Phone, ChevronRight,
} from "lucide-react";
import { useOperatorToast } from "@/components/operator/Toast";
import { useBookings, ukDateDaysAgo, OPERATIONAL_DAYS_BACK } from "@/hooks/operator/useBookings";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { bookingStatusColor } from "@/lib/operator/statusColor";
import { LIST_VIEWS, isReturnLeg } from "@/lib/operator/bookingBuckets";
import { fmtDate, fmtDayDate, ukDateOf } from "@/lib/dates";

// A return leg has no price of its own: the whole fare is on its outbound booking.
const priceLabel = (b) => (isReturnLeg(b) ? "With outbound" : b.price === "TBC" ? "Price TBC" : b.price);

// Builds a tel: href for a stored customer phone, or null if it doesn't look
// like a usable number (same validation the detail drawer uses).
function telHref(phone) {
  const raw = phone?.trim() ?? "";
  return raw && /^[+\d][\d\s\-().]{4,}$/.test(raw) ? `tel:${raw.replace(/\s/g, "")}` : null;
}

function driverDot(status) {
  if (status === "Available") return "bg-emerald-400";
  if (status === "On Trip") return "bg-amber-400";
  return "bg-slate-600";
}

// Renders in a portal so the dropdown escapes the overflow-x-auto table wrapper
function InlineDriverCell({ bookingId, currentDriverId, drivers, onAssign }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const current = drivers.find((d) => d.id === currentDriverId);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (!btnRef.current?.contains(e.target) && !dropRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);

  const handleOpen = () => {
    if (pending) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  const handleAssign = async (dId) => {
    setOpen(false);
    setPending(true);
    try { await onAssign(bookingId, dId); } finally { setPending(false); }
  };

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={pending}
        className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs transition hover:bg-slate-100 disabled:opacity-50 ${
          current ? "text-slate-600" : "font-medium text-amber-600 hover:text-amber-600"
        }`}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : current ? (
          <>
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${driverDot(current.status)}`} />
            {current.name}
          </>
        ) : (
          <span className="rounded-full border border-dashed border-amber-400/40 px-2 py-0.5">
            + Assign
          </span>
        )}
      </button>
      {open &&
        !pending &&
        createPortal(
          <div
            ref={dropRef}
            className="fixed z-[200] w-56 rounded-2xl border border-slate-200 bg-white py-1 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              onClick={() => handleAssign(null)}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-xs transition hover:bg-slate-100 ${
                !currentDriverId ? "text-amber-600" : "text-slate-500"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-slate-700" />
              Unassigned
            </button>
            {drivers.length > 0 && <div className="mx-4 my-1 border-t border-slate-100" />}
            {drivers.map((d) => (
              <button
                key={d.id}
                onClick={() => handleAssign(d.id)}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-xs transition hover:bg-slate-100 ${
                  d.id === currentDriverId ? "text-amber-600" : "text-slate-600"
                }`}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${driverDot(d.status)}`} />
                <span className="flex-1 text-left">{d.name}{d.kind === "partner" && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">Partner</span>}</span>
                <span className="text-slate-600">{d.vehicle || d.status}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

const LIST_VIEW_TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "action", label: "Needs action", short: "To do" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

const EMPTY_TEXT = {
  upcoming: "Nothing coming up. New bookings will appear here.",
  action: "All clear: nothing to reply to, no jobs without a driver, nothing unpaid.",
  past: "No past bookings in this period.",
  all: "No bookings yet.",
};

// ── Schedule view row ─────────────────────────────────────────────────────────
function dateKeyOf(b) {
  return b.travelDate || ukDateOf(b.pickupTime);
}
// Day heading: "Today" / "Tomorrow" / "Yesterday" with the date beside it,
// otherwise the weekday and date ("Thu 01/10/2026").
function groupLabel(key) {
  if (!key) return { label: "No date", sub: "" };
  const diff = Math.round((Date.parse(`${key}T12:00:00Z`) - Date.parse(`${ukDateDaysAgo(0)}T12:00:00Z`)) / 86400000);
  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : null;
  return rel ? { label: rel, sub: fmtDayDate(key) } : { label: fmtDayDate(key), sub: "" };
}
function timeVal(b) {
  if (b.pickupTime) { const d = new Date(b.pickupTime); if (!isNaN(d)) return d.getTime(); }
  if (b.time && b.time !== "—") return Number(b.time.replace(":", "")) || Infinity;
  return Infinity;
}
function groupByDate(list, newestFirst = false) {
  const map = new Map();
  for (const b of list) {
    const k = dateKeyOf(b);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  }
  const groups = [...map.entries()].map(([key, items]) => ({
    key,
    ...groupLabel(key),
    items: items.sort((a, b) => timeVal(a) - timeVal(b)),
  }));
  groups.sort((a, b) => (a.key === null ? 1 : b.key === null ? -1 : a.key < b.key ? -1 : 1));
  if (newestFirst) {
    groups.reverse();
    for (const g of groups) g.items.reverse();
  }
  return groups;
}

// ── Mobile driver bottom-sheet picker ────────────────────────────────────────
function MobileDriverSheet({ booking, drivers, onAssign, onClose }) {
  const [pending, setPending] = useState(false);

  const handleSelect = async (driverId) => {
    if (driverId === booking.driverId) { onClose(); return; }
    setPending(true);
    try {
      await onAssign(booking.id, driverId);
      onClose();
    } catch {
      setPending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full rounded-t-[28px] border-t border-slate-200 bg-white">
        {/* Drag handle */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-12 rounded-full bg-slate-200" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-amber-600">Assign Driver</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0F1B33]">{booking.customer}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-[#0F1B33]">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Driver options */}
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {/* Unassigned */}
          <button
            onClick={() => handleSelect(null)}
            disabled={pending}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-sm transition ${
              !booking.driverId ? "bg-amber-400/10 text-amber-600" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-slate-700" />
            <span className="flex-1 text-left">Unassigned</span>
            {!booking.driverId && <Check className="h-4 w-4 flex-shrink-0" />}
          </button>
          {/* Drivers */}
          {drivers.map((d) => {
            const isCurrent = d.id === booking.driverId;
            return (
              <button
                key={d.id}
                onClick={() => handleSelect(d.id)}
                disabled={pending}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-sm transition ${
                  isCurrent ? "bg-amber-400/10 text-amber-600" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${driverDot(d.status)}`} />
                <span className="flex-1 text-left font-medium">{d.name}{d.kind === "partner" && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">Partner</span>}</span>
                <span className="text-xs text-slate-600">{d.vehicle || d.status}</span>
                {isCurrent && <Check className="h-4 w-4 flex-shrink-0 ml-1" />}
              </button>
            );
          })}
          {pending && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Assigning…
            </div>
          )}
        </div>
        {/* iOS safe-area spacer */}
        <div className="h-8" />
      </div>
    </div>,
    document.body
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────
const STATUS_EDGE = {
  Dispatched: "bg-amber-400",
  "En Route": "bg-blue-500",
  Arrived: "bg-indigo-500",
  "Passenger On Board": "bg-emerald-500",
  Completed: "bg-slate-300",
  Cancelled: "bg-slate-200",
  "No Show": "bg-slate-300",
};

function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

// What the card and the desktop row both show, worked out once.
function bookingFacts(booking) {
  const isDone = ["Completed", "Cancelled", "No Show"].includes(booking.status);
  const [from, to] = (() => {
    const p = booking.pickupLocation || booking.airport || "";
    const d = booking.dropoffAddress || booking.destination || "";
    if (p || d) return [p || "Pickup to confirm", d || "Drop-off to confirm"];
    const parts = String(booking.route || "").split("→").map((x) => x.trim());
    return [parts[0] || "Pickup to confirm", parts[1] || "Drop-off to confirm"];
  })();
  return {
    isDone,
    isCancelled: booking.status === "Cancelled",
    pendingRequest: booking.source === "website" && !booking.operatorResponse && !["Cancelled", "Completed"].includes(booking.status),
    unpaid: booking.status === "Completed" && booking.paymentStatus !== "Paid" && booking.paymentMethod !== "Cash",
    driverUnconfirmed: !isDone && booking.attestation === "operator_alerted",
    awaitingConfirm: !isDone && ["awaiting_first_attestation", "awaiting_second_attestation"].includes(booking.attestation),
    from,
    to,
    statusLabel:
      booking.status === "Unassigned / Missed Call Recovery" ? "Missed call" :
      booking.status === "Passenger On Board" ? "On board" :
      booking.status,
  };
}

function Badges({ facts }) {
  const { pendingRequest, unpaid, driverUnconfirmed, awaitingConfirm } = facts;
  if (!pendingRequest && !unpaid && !driverUnconfirmed && !awaitingConfirm) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {pendingRequest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">New request</span>}
      {unpaid && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Unpaid</span>}
      {driverUnconfirmed && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Driver hasn&apos;t confirmed</span>}
      {awaitingConfirm && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Awaiting driver confirm</span>}
    </div>
  );
}

function RouteLines({ from, to, className = "" }) {
  return (
    <div className={`relative space-y-1 pl-4 leading-snug ${className}`}>
      <span className="absolute left-[3px] top-[7px] bottom-[7px] w-px bg-slate-200" aria-hidden="true" />
      <p className="relative truncate"><span className="absolute -left-4 top-[5px] h-2 w-2 rounded-full border-2 border-slate-400 bg-white" aria-hidden="true" />{from}</p>
      <p className="relative truncate"><span className="absolute -left-4 top-[5px] h-2 w-2 rounded-full bg-[#0F1B33]" aria-hidden="true" />{to}</p>
    </div>
  );
}

function edgeColour(booking, facts) {
  return facts.pendingRequest ? "bg-amber-400" : booking.priority ? "bg-red-500" : STATUS_EDGE[booking.status] || "bg-red-400";
}

// Phone/tablet booking card. The whole card opens the booking; the driver
// chip, call button and accept/decline are their own targets.
function BookingCard({ booking, onSelect, drivers = [], onAssign, onRespond }) {
  const [driverSheetOpen, setDriverSheetOpen] = useState(false);
  const [respBusy, setRespBusy] = useState(null);
  const facts = bookingFacts(booking);
  const { isCancelled, isDone, pendingRequest, from, to, statusLabel } = facts;

  const respond = async (e, decision) => {
    e.stopPropagation();
    setRespBusy(decision);
    try {
      await onRespond?.(booking.id, decision);
    } catch {
      /* error is surfaced by the caller / rolled back in the hook */
    } finally {
      setRespBusy(null);
    }
  };
  const stop = (e) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(booking)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(booking); } }}
      aria-label={`Open booking ${booking.id} for ${booking.customer}`}
      className={`relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,27,51,0.04)] transition active:scale-[0.99] ${
        pendingRequest ? "border-amber-300" : booking.priority ? "border-red-200" : "border-slate-200/80"
      } ${isCancelled ? "opacity-60" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${edgeColour(booking, facts)}`} aria-hidden="true" />

      <div className="flex gap-3 py-3 pl-4 pr-3">
        {/* Time column */}
        <div className="w-14 flex-shrink-0">
          <p className={`text-lg font-semibold leading-none tracking-tight ${isDone ? "text-slate-400" : "text-[#0F1B33]"}`}>{booking.time}</p>
          {booking.flight && booking.flight !== "—" && (
            <p className="mt-1.5 flex items-center gap-0.5 text-[10px] font-medium text-slate-500"><Plane className="h-2.5 w-2.5" />{booking.flight}</p>
          )}
        </div>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#0F1B33]">
              {booking.priority && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-red-600" />}
              {booking.customer}
            </p>
            <p className={`flex-shrink-0 text-[15px] font-semibold ${booking.price === "TBC" ? "text-xs font-medium text-slate-400" : "text-[#0F1B33]"}`}>
              {priceLabel(booking)}
            </p>
          </div>

          <RouteLines from={from} to={to} className="mt-1.5 text-[13px] text-slate-600" />
          <Badges facts={facts} />

          {/* Driver · call · status */}
          <div className="mt-2.5 flex items-center gap-2">
            {isDone && !booking.driverId ? (
              <span className="text-xs text-slate-400">No driver</span>
            ) : (
            <button
              type="button"
              onClick={(e) => { stop(e); setDriverSheetOpen(true); }}
              aria-label={booking.driverId ? `Driver ${booking.driver}, change` : "Assign a driver"}
              className={`flex min-h-[32px] min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition active:scale-95 ${
                booking.driverId ? "border-slate-200 text-slate-700" : "border-dashed border-amber-400 text-amber-700"
              }`}
            >
              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${booking.driverId ? "bg-[#0F1B33] text-white" : "bg-amber-100 text-amber-700"}`}>
                {booking.driverId ? initials(booking.driver) : "+"}
              </span>
              <span className="truncate">{booking.driverId ? booking.driver : "Assign driver"}</span>
            </button>
            )}
            <span className="flex-1" />
            {telHref(booking.phone) && (
              <a
                href={telHref(booking.phone)}
                onClick={stop}
                aria-label={`Call ${booking.customer}`}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition active:scale-95"
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            )}
            <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${bookingStatusColor(booking.status)}`}>
              {statusLabel}
            </span>
          </div>

          {/* Accept / decline a new website request */}
          {pendingRequest && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={(e) => respond(e, "accepted")}
                disabled={!!respBusy}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {respBusy === "accepted" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
              </button>
              <button
                onClick={(e) => respond(e, "rejected")}
                disabled={!!respBusy}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition active:scale-95 disabled:opacity-60"
              >
                {respBusy === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Decline
              </button>
            </div>
          )}
        </div>
      </div>

      {driverSheetOpen && (
        // The sheet is portalled, but React events still bubble to the card:
        // stop them so picking a driver doesn't also open the booking.
        <div onClick={stop} onKeyDown={stop}>
          <MobileDriverSheet
            booking={booking}
            drivers={drivers}
            onAssign={onAssign}
            onClose={() => setDriverSheetOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// Desktop row: time, customer, route, driver, price, status. Clicking the row
// opens the booking; the driver and status controls work in place.
function DesktopRow({ booking, selected, onSelect, drivers, onAssign, onStatus, onRespond }) {
  const [respBusy, setRespBusy] = useState(null);
  const facts = bookingFacts(booking);
  const { isCancelled, isDone, pendingRequest, from, to } = facts;
  const stop = (e) => e.stopPropagation();
  const respond = async (e, decision) => {
    e.stopPropagation();
    setRespBusy(decision);
    try { await onRespond?.(booking.id, decision); } catch { /* surfaced by the hook */ } finally { setRespBusy(null); }
  };

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onSelect(booking)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(booking); } }}
      aria-label={`Open booking ${booking.id} for ${booking.customer}`}
      className={`group relative grid cursor-pointer grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(150px,1fr)_72px_190px_16px] items-center gap-5 px-5 py-3.5 outline-none transition hover:bg-slate-50 focus-visible:bg-amber-50/60 ${
        selected ? "bg-amber-50/60" : ""
      } ${isCancelled ? "opacity-60" : ""}`}
    >
      <span className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${edgeColour(booking, facts)}`} aria-hidden="true" />
      <div>
        <p className={`text-lg font-semibold leading-none tracking-tight ${isDone ? "text-slate-400" : "text-[#0F1B33]"}`}>{booking.time}</p>
        {booking.flight && booking.flight !== "—" && (
          <p className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-slate-500"><Plane className="h-3 w-3" />{booking.flight}</p>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-[#0F1B33]">
            {booking.priority && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-red-600" />}
            {booking.customer}
          </p>
          {telHref(booking.phone) && (
            <a
              href={telHref(booking.phone)}
              onClick={stop}
              aria-label={`Call ${booking.customer}`}
              title={booking.phone}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 opacity-70 transition hover:border-amber-300 hover:text-amber-700 group-hover:opacity-100"
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-slate-400">{booking.id}</p>
        <Badges facts={facts} />
      </div>
      <RouteLines from={from} to={to} className="text-[13px] text-slate-600" />
      <div className="min-w-0" onClick={stop} onKeyDown={stop}>
        <InlineDriverCell bookingId={booking.id} currentDriverId={booking.driverId} drivers={drivers} onAssign={onAssign} />
      </div>
      <p className={`text-right font-semibold ${booking.price === "TBC" ? "text-xs font-medium text-slate-400" : "text-[#0F1B33]"}`}>
        {priceLabel(booking)}
      </p>
      <div className="flex items-center justify-end gap-2" onClick={stop} onKeyDown={stop}>
        {pendingRequest ? (
          <>
            <button
              onClick={(e) => respond(e, "accepted")}
              disabled={!!respBusy}
              className="flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {respBusy === "accepted" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
            </button>
            <button
              onClick={(e) => respond(e, "rejected")}
              disabled={!!respBusy}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:opacity-60"
            >
              {respBusy === "rejected" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Decline
            </button>
          </>
        ) : (
          <StatusActionMenu bookingId={booking.id} currentStatus={booking.status} onUpdate={onStatus} />
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// The bookings list (Bookings → List): every booking from the operational
// window, grouped by date, with status filters, search, inline driver
// assignment and accept/decline. Rows open the shared booking drawer.
export default function BookingsList() {
  const searchParams = useSearchParams();
  // Which slice of bookings to show. A search arriving in the URL (header
  // search, a notification link) looks across everything.
  const [view, setView] = useState(searchParams.get("q") ? "all" : "upcoming");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [searchOpen, setSearchOpen] = useState(false);
  const [stickyTop, setStickyTop] = useState(0);
  const searchRef = useRef(null);
  const filterBarRef = useRef(null);
  const [filterBarH, setFilterBarH] = useState(0);

  // Day headings stick just below the (sticky) filter bar.
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const update = () => setFilterBarH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pin the filter bar directly beneath the (variable-height) app header while
  // scrolling the feed. Measure the header live so it tracks any size change.
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setStickyTop(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const toast = useOperatorToast();
  const api = useBookings();
  const {
    bookings: transfers,
    totalCount,
    loading,
    loadingMore,
    loadMore,
    loadEarlier,
    hasEarlier,
    error,
  } = api;
  const { openNewBooking } = useOperator();
  const { drivers } = useDrivers();

  const debouncedSearch = useDebounce(search, 200);

  // A new ?q= in the address (a search link) fills the search box.
  const [seenParams, setSeenParams] = useState(searchParams);
  if (seenParams !== searchParams) {
    setSeenParams(searchParams);
    const q = searchParams.get("q");
    if (q != null) setSearch(q);
  }

  // Keyboard shortcuts: N = new booking, / or F = focus search
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "n" && !inInput && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        openNewBooking();
        return;
      }

      if ((e.key === "/" || e.key === "f") && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openNewBooking]);

  const drawer = useBookingDrawer(api, drivers);
  const setSelectedBooking = drawer.open;
  const handleAssignDriver = drawer.assign;
  // The drawer shows its own errors; list rows need a toast.
  const handleRespond = (id, decision) =>
    drawer.respond(id, decision).catch((err) => toast({ message: err?.message ?? "Couldn't save the decision", type: "error" }));
  const handleStatusUpdate = drawer.setStatus;

  const today = ukDateDaysAgo(0);
  const viewCounts = useMemo(
    () => Object.fromEntries(Object.entries(LIST_VIEWS).map(([k, fn]) => [k, transfers.filter((t) => fn(t, today)).length])),
    [transfers, today]
  );

  const filtered = useMemo(() => {
    let list = transfers.filter((t) => LIST_VIEWS[view](t, today));
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.customer.toLowerCase().includes(q) ||
          t.flight.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.driver.toLowerCase().includes(q) ||
          t.route.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transfers, view, today, debouncedSearch]);


  return (
    <>
      {drawer.element}

      <div className="grid gap-2 px-2 pb-2 pt-3 sm:gap-4 sm:px-6 sm:pt-4 lg:px-10">
        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-600">
            Failed to load transfers: {error}
          </div>
        )}

          <div className="min-w-0">
            {/* Header block is sticky on mobile so the filter row stays pinned
                below the app header while the feed scrolls; static on desktop. */}
            <div
              ref={filterBarRef}
              style={{ top: stickyTop }}
              className="sticky z-30 mb-2 flex min-w-0 flex-col gap-2 bg-white/95 py-2 backdrop-blur-md lg:static lg:mb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:bg-transparent lg:py-0 lg:backdrop-blur-none"
            >


              {/* Search + filter row */}
              <div className="flex min-w-0 flex-col gap-2 sm:gap-3 lg:flex-1 lg:flex-row-reverse lg:items-center lg:justify-between">
                {/* Search input — always shown on desktop; toggled on mobile */}
                <div className={`relative ${searchOpen ? "block" : "hidden"} sm:block`}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customer, flight, ref… (/)"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-[#0F1B33] placeholder:text-slate-400 outline-none transition focus:border-amber-400/30 sm:py-3 lg:w-72"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F1B33]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* View switcher (Upcoming / Needs action / Past / All) + mobile search toggle */}
                <div className="flex min-w-0 items-center gap-2">
                  <div role="tablist" aria-label="Which bookings" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-none">
                    {LIST_VIEW_TABS.map((v) => (
                      <button
                        key={v.key}
                        role="tab"
                        aria-selected={view === v.key}
                        aria-label={`${v.label} (${viewCounts[v.key]})`}
                        onClick={() => setView(v.key)}
                        className={`flex flex-shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition sm:gap-1.5 sm:px-3 sm:text-sm ${
                          view === v.key ? "bg-white text-[#0F1B33] shadow-sm" : "text-slate-500 hover:text-[#0F1B33]"
                        }`}
                      >
                        {v.short ? (<><span className="sm:hidden">{v.short}</span><span className="hidden sm:inline">{v.label}</span></>) : v.label}
                        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${
                          view === v.key ? (v.key === "action" && viewCounts[v.key] ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600") : "text-slate-400"
                        }`}>{viewCounts[v.key]}</span>
                      </button>
                    ))}
                  </div>
                  {/* Mobile-only search toggle button */}
                  <button
                    onClick={() => {
                      setSearchOpen((v) => {
                        const next = !v;
                        if (!next) setSearch("");
                        else setTimeout(() => searchRef.current?.focus(), 0);
                        return next;
                      });
                    }}
                    aria-label={searchOpen ? "Close search" : "Search"}
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition active:bg-slate-100 sm:hidden ${
                      searchOpen || search
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-600"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    {searchOpen ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile + tablet card layout — grouped by date, extra bottom padding
                so the floating "New Booking" button never covers the last card */}
            <div className="grid min-w-0 gap-2 pb-24 lg:hidden lg:pb-0">
              {loading && transfers.length === 0
                ? [1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="h-4 w-1/3 rounded-full bg-slate-50" />
                      <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-50" />
                    </div>
                  ))
                : groupByDate(filtered, view === "past").map((g) => (
                    <div key={g.key ?? "no-date"} className="grid min-w-0 gap-2">
                      <p
                        style={{ top: stickyTop + filterBarH }}
                        className="sticky z-20 -mx-2 flex items-baseline gap-2 bg-[#F5F6F9]/95 px-3 py-1.5 backdrop-blur-sm sm:-mx-6 sm:px-6"
                      >
                        <span className="text-sm font-semibold text-[#0F1B33]">{g.label}</span>
                        {g.sub && <span className="text-xs text-slate-500">{g.sub}</span>}
                        <span className="ml-auto text-xs text-slate-400">{g.items.length} job{g.items.length === 1 ? "" : "s"}</span>
                      </p>
                      {g.items.map((t) => (
                        <BookingCard
                          key={t.id}
                          booking={t}
                          onSelect={setSelectedBooking}
                          drivers={drivers}
                          onAssign={handleAssignDriver}
                          onRespond={handleRespond}
                        />
                      ))}
                    </div>
                  ))}
              {!loading && filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-600">
                  {debouncedSearch ? `No bookings match "${debouncedSearch}" here.` : EMPTY_TEXT[view]}
                </p>
              )}
            </div>

            {/* Desktop: the same day groups as the cards, as rows. The whole
                row opens the booking; driver and status change in place. */}
            <div className="hidden space-y-5 lg:block">
              {loading && transfers.length === 0 && (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex animate-pulse gap-6 px-5 py-4">
                      <div className="h-4 w-12 rounded-full bg-slate-100" />
                      <div className="h-4 w-40 rounded-full bg-slate-100" />
                      <div className="h-4 flex-1 rounded-full bg-slate-100" />
                    </div>
                  ))}
                </div>
              )}
              {groupByDate(filtered, view === "past").map((g) => (
                <section key={g.key ?? "no-date"} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,27,51,0.04)]">
                  <header className="flex items-baseline gap-2 border-b border-slate-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-[#0F1B33]">{g.label}</h3>
                    {g.sub && <span className="text-xs text-slate-500">{g.sub}</span>}
                    <span className="ml-auto text-xs text-slate-400">{g.items.length} job{g.items.length === 1 ? "" : "s"}</span>
                  </header>
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((t) => (
                      <DesktopRow
                        key={t.id}
                        booking={t}
                        selected={drawer.selectedId === t.id}
                        onSelect={setSelectedBooking}
                        drivers={drivers}
                        onAssign={handleAssignDriver}
                        onStatus={handleStatusUpdate}
                        onRespond={handleRespond}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {!loading && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-600">
                  {debouncedSearch ? `No bookings match "${debouncedSearch}" here.` : EMPTY_TEXT[view]}
                </p>
              )}
            </div>

            {/* Older bookings: the board loads from OPERATIONAL_DAYS_BACK days ago;
                anything earlier (including for a search) loads on request. */}
            {hasEarlier && (view === "past" || view === "all" || debouncedSearch) && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-4 text-center">
                <p className="text-xs text-slate-600">
                  Showing bookings from {fmtDate(ukDateDaysAgo(OPERATIONAL_DAYS_BACK))} onwards{debouncedSearch ? " (search included)" : ""}.
                </p>
                <button
                  onClick={() => loadEarlier().catch((err) => toast({ message: err?.message ?? "Couldn't load earlier bookings", type: "error" }))}
                  disabled={loadingMore}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-500 transition hover:border-amber-400/20 hover:text-amber-600 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Show earlier bookings"}
                </button>
              </div>
            )}

            {/* Load more — shown on both mobile and desktop when more pages exist */}
            {totalCount > transfers.length && !debouncedSearch && (view === "all" || view === "upcoming") && (
              <div className="mt-4 flex items-center justify-center gap-4 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-600">
                  Showing {transfers.length} of {totalCount} bookings
                </p>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-500 transition hover:border-amber-400/20 hover:text-amber-600 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
      </div>
    </>
  );
}
