"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from "react";
import {
  FileText, Plus, X, Printer, Trash2, Check, Send, CircleDollarSign, Clock,
  MapPin, ImageDown,
  Calendar, CreditCard, Gem, Phone, Mail, Globe, Loader2, Search,
} from "lucide-react";
import { useInvoices, computeTotals } from "@/hooks/operator/useInvoices";
import { shapedBooking, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { useOperatorToast } from "@/components/operator/Toast";
import { EV_EXEC_LOGO } from "@/lib/operator/brandLogo";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/dates";
import { useTenantProfile } from "@/hooks/operator/useTenantProfile";
import { brandFrom } from "@/lib/brand";

const VAT_RATES = [
  { label: "No VAT", value: 0 },
  { label: "VAT 20%", value: 0.2 },
];

// Invoice colours come from the business's branding (brandFrom in
// lib/brand.js), navy #0B132B and gold #D7A23F unless changed.

// Letterhead fallback, used until the business details load (and if a field
// is blank). The live values come from Settings → Business (tenants.brand.invoice).
const COMPANY = {
  name: "EV Exec",
  addressLines: ["EV Exec", "Wheeler Hub Drive", "Blackpool, FY2 0FD", "United Kingdom"],
  phone: "07721 070370",
  email: "book@evexec.co.uk",
  web: "evexec.co.uk",
  tagline1: "ELEVATING EXPERIENCES",
  tagline2: "DRIVING EXCELLENCE.",
};
const DEFAULT_TERMS = "Payment is due within 15 days of invoice date.\nBank Transfer / BACS Preferred.";

function companyFrom(tenant) {
  const b = tenant?.brand?.invoice || {};
  const lines = Array.isArray(b.address_lines) && b.address_lines.length ? b.address_lines : COMPANY.addressLines;
  const tag = Array.isArray(b.tagline) ? b.tagline : [];
  return {
    name: tenant?.name || b.business_name || "EV Exec",
    addressLines: lines,
    phone: b.phone || COMPANY.phone,
    email: b.email || COMPANY.email,
    web: b.web || COMPANY.web,
    tagline1: tag[0] || COMPANY.tagline1,
    tagline2: tag[1] || COMPANY.tagline2,
    terms: b.payment_terms || DEFAULT_TERMS,
  };
}

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
// UK calendar date (the UTC date is yesterday's between 00:00 and 01:00 in summer).
const today = () => ukDateDaysAgo(0);

function statusChip(status) {
  switch (status) {
    case "Paid":  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-600";
    case "Sent":  return "border-blue-400/30 bg-blue-400/10 text-blue-600";
    case "Void":  return "border-slate-500/30 bg-slate-500/10 text-slate-500";
    default:      return "border-amber-400/30 bg-amber-400/10 text-amber-600"; // Draft
  }
}

// DD/MM/YYYY for the printed date (house style).
function longDate(d) {
  if (!d) return null;
  return fmtDate(d) || d;
}
// Date used inside description lines (house style DD/MM/YYYY).
function shortDate(d) {
  if (!d) return null;
  return fmtDate(d) || d;
}

// Journey → the muted description sub-lines shown under a charge (mirrors how
// EV Exec write transfers: "Pick up 08.30 4/11/26", "Return MAN T2 17.05 …").
function journeyLines(j) {
  if (!j) return [];
  const lines = [];
  if (j.pickup) lines.push(j.pickup);
  const pu = ["Pick up", j.time, shortDate(j.date)].filter(Boolean).join(" ");
  if (j.time || j.date) lines.push(pu);
  const hasReturn = j.returnDate || j.returnTime;
  if (!hasReturn) {
    if (j.dropoff) lines.push(`Drop-off ${j.dropoff}`);
    if (j.flight) lines.push(`Flight ${j.flight}`);
  } else {
    lines.push(["Return", j.dropoff, j.returnTime, shortDate(j.returnDate), j.flight].filter(Boolean).join(" "));
  }
  const veh = [j.vehicle, j.passengers ? `${j.passengers} pax` : null, j.luggage ? `${j.luggage} bags` : null].filter(Boolean).join("  ·  ");
  if (veh) lines.push(veh);
  return lines;
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#0F1B33] placeholder:text-slate-400 outline-none transition focus:border-amber-400/40";
const labelCls = "mb-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-500";

// The business's logo (Settings → Branding); EV Exec's built-in badge for EV
// Exec; otherwise the business name as a wordmark. Uploaded logos load with
// CORS so they appear in the downloaded PDF too.
function logoSrcFor(brand) {
  return brand.logoUrl || (brand.useBuiltInLogo ? EV_EXEC_LOGO : null);
}

function InvoiceLogo({ company = COMPANY, brand }) {
  const src = logoSrcFor(brand);
  return (
    <div className="flex flex-col items-start">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={company.name || "Logo"} crossOrigin={brand.logoUrl ? "anonymous" : undefined} className="h-16 w-auto max-w-[220px] object-contain sm:h-20" />
      ) : (
        <p className="text-xl font-semibold tracking-[0.2em] sm:text-2xl" style={{ color: brand.accent }}>{(company.name || "").toUpperCase()}</p>
      )}
      <div className="mt-1 h-px w-28 sm:w-36" style={{ background: brand.accent, opacity: 0.55 }} />
      <p className="mt-1.5 text-[8px] font-semibold leading-relaxed tracking-[0.24em] sm:text-[9px]" style={{ color: brand.accent }}>
        {company.tagline1}<br />{company.tagline2}
      </p>
    </div>
  );
}

/* ─── Jobs to invoice ───────────────────────────────────────────────────── */

// Every booking, newest travel date first, for the job finder. Loaded on its
// own (not the dispatch board's paged, oldest-first list) so recent jobs are
// always there to pick.
function useInvoiceJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .order("travel_date", { ascending: false, nullsFirst: false })
        .order("travel_time", { ascending: false })
        .limit(2000);
      if (live) { setJobs((data || []).map(shapedBooking)); setLoading(false); }
    })().catch(() => live && setLoading(false));
    return () => { live = false; };
  }, []);
  return { jobs, loading };
}

const isReturnLeg = (j) => /^Return leg created automatically/i.test(j.notes || "");
const isCompleted = (j) => String(j.status || "").toLowerCase() === "completed";
const dash = (v) => (v && v !== "—" ? v : "");

function jobSearchText(j) {
  return [
    j.id, j.customer, j.phone, String(j.phone || "").replace(/\D/g, ""), j.email,
    j.pickupLocation, j.dropoffAddress, j.airport, dash(j.flight),
    j.travelDate, fmtDate(j.travelDate), j.status,
  ].filter(Boolean).join(" ").toLowerCase();
}

// Search box + list of jobs. Default view is the jobs that still need an
// invoice (completed, not yet invoiced, not an auto-created return leg).
// Jobs that already have an invoice show it, and open it instead of
// starting a duplicate.
function JobPicker({ jobs, loading, invoiceFor, onPick, onOpenInvoice }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState("todo");

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return jobs.filter((j) => {
      if (view === "todo" && (!isCompleted(j) || isReturnLeg(j) || invoiceFor(j))) return false;
      if (!words.length) return true;
      const text = jobSearchText(j);
      return words.every((w) => text.includes(w));
    });
  }, [jobs, q, view, invoiceFor]);

  const todoCount = useMemo(
    () => jobs.filter((j) => isCompleted(j) && !isReturnLeg(j) && !invoiceFor(j)).length,
    [jobs, invoiceFor]
  );

  return (
    <div>
      <p className={labelCls}>Find the job</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={inputCls + " pl-9"}
          placeholder="Ref, name, phone, address, date (DD/MM/YYYY) or flight"
        />
      </div>
      <div className="mt-2 flex gap-1.5">
        {[["todo", `To invoice (${todoCount})`], ["all", "All jobs"]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              view === k ? "border-amber-400/40 bg-amber-400/10 text-amber-600" : "border-slate-200 text-slate-500 hover:text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-1.5">
        {loading && jobs.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Loading jobs…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            {view === "todo" && !q ? "Every completed job has an invoice." : "No jobs match. Try All jobs, or fewer words."}
          </p>
        ) : (
          list.slice(0, 100).map((j) => {
            const inv = invoiceFor(j);
            const when = [fmtDate(j.travelDate), dash(j.time)].filter(Boolean).join(" ");
            return (
              <button key={j.id} type="button"
                onClick={() => (inv ? onOpenInvoice(inv) : onPick(j.id))}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-white p-2.5 text-left transition hover:border-amber-400/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F1B33]">{j.customer || "No name"}</p>
                  <p className="truncate text-xs text-slate-600">{dash(j.route)}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {when || "No date"} · {j.id}{isReturnLeg(j) ? " · Return leg" : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold text-amber-600">{j.price}</span>
                  {inv ? (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusChip(inv.status)}`}>{inv.number} · Open</span>
                  ) : (
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">{j.status}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
      {list.length > 100 && <p className="mt-1 text-[10px] text-slate-500">Showing the 100 most recent matches. Search to narrow it down.</p>}
    </div>
  );
}

/* ─── Create-invoice modal ──────────────────────────────────────────────── */
function InvoiceModal({ open, onClose, onCreate, bookings, jobsLoading, invoiceFor, onOpenInvoice, initialRef }) {
  const blankItem = { description: "", quantity: 1, unit_price: "" };
  const emptyJourney = { pickup: "", dropoff: "", date: "", time: "", flight: "", passengers: "", luggage: "", vehicle: "", returnDate: "", returnTime: "" };
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [bookingId, setBookingId] = useState(null);
  const [journey, setJourney] = useState({ ...emptyJourney });
  const [items, setItems] = useState([{ ...blankItem }]);
  const [vatRate, setVatRate] = useState(0);
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const reset = () => {
    setCustomer(""); setEmail(""); setPhone(""); setAddress(""); setBookingRef(""); setBookingId(null);
    setJourney({ ...emptyJourney });
    setItems([{ ...blankItem }]); setVatRate(0); setIssueDate(today()); setDueDate("");
    setNotes(""); setErr(null);
  };

  const setJ = (key, val) => setJourney((prev) => ({ ...prev, [key]: val }));

  const prefillFromBooking = (ref) => {
    setBookingRef(ref);
    if (!ref) { setBookingId(null); setJourney({ ...emptyJourney }); return; }
    const b = bookings.find((x) => x.id === ref);
    if (!b) return;
    setBookingId(b.dbId || null);
    setCustomer(b.customer || "");
    setPhone(b.phone && b.phone !== "—" ? b.phone : "");
    setEmail(b.email && b.email !== "—" ? b.email : "");

    const pickup = b.pickupLocation && b.pickupLocation !== "—" ? b.pickupLocation : (b.airport && b.airport !== "—" ? b.airport : "");
    const dropoff = b.dropoffAddress && b.dropoffAddress !== "—" ? b.dropoffAddress : "";
    setJourney({
      pickup, dropoff,
      date: b.travelDate || "",
      time: b.time && b.time !== "—" ? b.time : "",
      flight: b.flight && b.flight !== "—" ? b.flight : "",
      passengers: b.passengers != null ? String(b.passengers) : "",
      luggage: b.luggage != null ? String(b.luggage) : "",
      vehicle: b.vehicleType && b.vehicleType !== "—" ? b.vehicleType : "",
      returnDate: b.returnJourney && b.returnDate ? b.returnDate : "",
      returnTime: b.returnJourney && b.returnTime ? b.returnTime : "",
    });

    const routeText = b.route && b.route !== "—" ? b.route : [pickup, dropoff].filter(Boolean).join(" → ");
    const price = b.price && b.price !== "TBC" ? Number(String(b.price).replace(/[^0-9.]/g, "")) : "";
    const seeded = [{ description: `Airport transfer${routeText ? ` — ${routeText}` : ""}`, quantity: 1, unit_price: price }];
    if (b.returnJourney && b.returnRoute) {
      seeded.push({ description: `Return transfer — ${b.returnRoute}`, quantity: 1, unit_price: "" });
    }
    setItems(seeded);
  };

  const setItem = (i, key, val) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((prev) => [...prev, { ...blankItem }]);
  const removeItem = (i) => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const totals = useMemo(() => computeTotals(items, vatRate), [items, vatRate]);

  // Opened for a specific job (invoices?ref=EVX-…): prefill it once loaded.
  // Done while rendering (once the job has loaded), not in an effect.
  const [appliedRef, setAppliedRef] = useState(null);
  if (open && initialRef && appliedRef !== initialRef && bookings.some((b) => b.id === initialRef)) {
    setAppliedRef(initialRef);
    prefillFromBooking(initialRef);
  }

  const selectedJob = bookingRef ? bookings.find((b) => b.id === bookingRef) : null;

  const submit = async () => {
    if (!customer.trim()) { setErr("Customer name is required."); return; }
    if (!items.some((it) => it.description.trim() && Number(it.unit_price) > 0)) {
      setErr("Add at least one line item with a description and amount."); return;
    }
    setBusy(true); setErr(null);
    try {
      const cleanItems = items
        .filter((it) => it.description.trim())
        .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0 }));
      const cleanJourney = Object.fromEntries(
        Object.entries(journey).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v !== "" && v != null)
      );
      await onCreate({
        customer, email, phone, address, bookingRef: bookingRef || null, bookingId: bookingRef ? bookingId : null,
        journey: cleanJourney,
        lineItems: cleanItems, vatRate, issueDate, dueDate: dueDate || null, notes, status: "Draft",
      });
      reset();
      onClose();
    } catch (e) {
      setErr(e?.message ?? "Failed to create invoice.");
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#0F1B33]">New Invoice</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-[#0F1B33]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {selectedJob ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
              <div className="min-w-0 flex-1">
                <p className={labelCls + " mb-1"}>Invoicing job</p>
                <p className="truncate text-sm font-semibold text-[#0F1B33]">{selectedJob.customer} · {selectedJob.id}</p>
                <p className="truncate text-xs text-slate-600">{dash(selectedJob.route)}</p>
                <p className="truncate text-[11px] text-slate-500">{[fmtDate(selectedJob.travelDate), dash(selectedJob.time)].filter(Boolean).join(" ")} · {selectedJob.price}</p>
              </div>
              <button type="button" onClick={() => prefillFromBooking("")} className="flex-shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:text-[#0F1B33]">Change</button>
            </div>
          ) : (
            <div>
              <JobPicker jobs={bookings} loading={jobsLoading} invoiceFor={invoiceFor} onPick={prefillFromBooking} onOpenInvoice={onOpenInvoice} />
              <p className="mt-1 text-[10px] text-slate-600">Pick a job to fill in the customer, journey and price. You can edit anything below, or skip this for a manual invoice.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className={labelCls}>Customer name *</p>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} className={inputCls} placeholder="Customer or company" />
            </div>
            <div>
              <p className={labelCls}>Email</p>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@email.com" />
            </div>
            <div>
              <p className={labelCls}>Phone</p>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="Phone" />
            </div>
            <div className="col-span-2">
              <p className={labelCls}>Billing address</p>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Address (shown under Invoice To)" />
            </div>
          </div>

          {/* Journey details */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-600/80">
              <MapPin className="h-3 w-3" /> Journey details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <p className={labelCls}>Pickup address</p>
                <input value={journey.pickup} onChange={(e) => setJ("pickup", e.target.value)} className={inputCls} placeholder="e.g. 27 Springbrook Avenue, FY5 3SN" />
              </div>
              <div className="col-span-2">
                <p className={labelCls}>Drop-off address</p>
                <input value={journey.dropoff} onChange={(e) => setJ("dropoff", e.target.value)} className={inputCls} placeholder="e.g. Manchester Airport T2" />
              </div>
              <div>
                <p className={labelCls}>Date</p>
                <input type="date" value={journey.date} onChange={(e) => setJ("date", e.target.value)} className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Pickup time</p>
                <input value={journey.time} onChange={(e) => setJ("time", e.target.value)} className={inputCls} placeholder="e.g. 08.30" />
              </div>
              <div>
                <p className={labelCls}>Flight no.</p>
                <input value={journey.flight} onChange={(e) => setJ("flight", e.target.value)} className={inputCls} placeholder="e.g. EZY2010" />
              </div>
              <div>
                <p className={labelCls}>Vehicle</p>
                <input value={journey.vehicle} onChange={(e) => setJ("vehicle", e.target.value)} className={inputCls} placeholder="e.g. Executive" />
              </div>
              <div>
                <p className={labelCls}>Passengers</p>
                <input value={journey.passengers} onChange={(e) => setJ("passengers", e.target.value)} inputMode="numeric" className={inputCls} placeholder="e.g. 2" />
              </div>
              <div>
                <p className={labelCls}>Luggage</p>
                <input value={journey.luggage} onChange={(e) => setJ("luggage", e.target.value)} inputMode="numeric" className={inputCls} placeholder="e.g. 3" />
              </div>
              <div>
                <p className={labelCls}>Return date</p>
                <input type="date" value={journey.returnDate} onChange={(e) => setJ("returnDate", e.target.value)} className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Return time</p>
                <input value={journey.returnTime} onChange={(e) => setJ("returnTime", e.target.value)} className={inputCls} placeholder="e.g. 17.05" />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className={labelCls}>Charges</p>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className={inputCls + " flex-1"} placeholder="What's being charged" />
                  <input value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} inputMode="numeric" className={inputCls + " w-14 text-center"} placeholder="Qty" />
                  <input value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} inputMode="decimal" className={inputCls + " w-20"} placeholder="£" />
                  <button onClick={() => removeItem(i)} className="mt-1 flex-shrink-0 text-slate-600 hover:text-red-600" title="Remove line"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700">
              <Plus className="h-3.5 w-3.5" /> Add charge
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelCls}>VAT</p>
              <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className={inputCls}>
                {VAT_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <p className={labelCls}>Issue date</p>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Due date</p>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <p className={labelCls}>Payment terms / notes</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder={"Leave blank for the standard terms:\nPayment due within 15 days · Bank Transfer / BACS preferred"} />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
            {vatRate > 0 && <div className="mt-1 flex justify-between text-slate-500"><span>VAT ({Math.round(vatRate * 100)}%)</span><span>{money(totals.vatAmount)}</span></div>}
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-[#0F1B33]"><span>Total</span><span className="text-amber-600">{money(totals.total)}</span></div>
          </div>

          {err && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-60">
            {busy ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Printable invoice — EV Exec navy & gold template ──────────────────── */
function InvoicePreview({ invoice, onClose, onStatus, onDelete, onEmailed }) {
  const inv = invoice;
  const jLines = journeyLines(inv.journey);
  const { tenant } = useTenantProfile();
  const company = companyFrom(tenant);
  // Invoice colours from Settings → Branding (navy and gold by default).
  const brand = brandFrom(tenant);
  const NAVY = brand.primary;
  const GOLD = brand.accent;
  const terms = (inv.notes && inv.notes.trim()) || company.terms;
  const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
  const sheetRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingImg, setSavingImg] = useState(false);
  const toast = useOperatorToast();

  // Render the on-screen invoice to a true A4 PDF (jsPDF). Browser print on
  // iOS/Safari ignores @page sizing and prints a tiny corner, so we always
  // build the PDF ourselves. The sheet is momentarily pinned to a fixed A4
  // width so the capture fills the page crisply regardless of screen size.
  // Capture the invoice sheet to a canvas, pinned to a full A4 page so the
  // footer sits flush at the bottom. Shared by both the PDF and image exports.
  const captureCanvas = useCallback(async () => {
    const { default: html2canvas } = await import("html2canvas");
    const el = sheetRef.current;
    // Pin to A4 (794px wide at 96dpi) with square corners so the export fills the
    // page and the navy header/footer bands have no white notches. We set an
    // *exact* height — the invoice's natural height, but never less than one A4
    // page (1123px) — so the flex spacer grows to push the footer flush to the
    // bottom edge. min-height alone left the footer floating short of the page.
    const prev = {
      width: el.style.width, height: el.style.height,
      minHeight: el.style.minHeight, borderRadius: el.style.borderRadius,
    };
    el.style.width = "794px";
    el.style.borderRadius = "0px";
    el.style.minHeight = "0px";
    el.style.height = "auto";
    // Measure the content's natural height at the pinned A4 width, then lock the
    // sheet to at least a full page so short invoices fill the whole A4 sheet.
    const A4_H = 1123;
    const natural = Math.ceil(el.getBoundingClientRect().height);
    el.style.height = `${Math.max(A4_H, natural)}px`;
    try {
      return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: 900 });
    } finally {
      Object.assign(el.style, prev);
    }
  }, []);

  const buildPdf = useCallback(async () => {
    const jsPDFmod = await import("jspdf");
    const jsPDF = jsPDFmod.jsPDF || jsPDFmod.default;
    const canvas = await captureCanvas();
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    // Slice across pages if the invoice is taller than one A4 page. The sheet is
    // pinned to a pixel-based "A4" (794x1123 at 96dpi) for the capture, which
    // doesn't perfectly match jsPDF's point-based A4 (595.28x841.89pt) -- the
    // rounding difference is a fraction of a point, but a bare `remaining > 0`
    // check treats that as a whole extra page's worth of overflow, appending a
    // near-blank trailing page to every invoice that exactly fills one page
    // (which is every short invoice, since the sheet has a one-page minimum
    // height). A 1pt tolerance (imperceptible; real overflow from actual
    // content is always many points) absorbs the rounding without risking
    // real content getting cut off.
    const OVERFLOW_TOLERANCE_PT = 1;
    let remaining = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    remaining -= pageH;
    while (remaining > OVERFLOW_TOLERANCE_PT) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      remaining -= pageH;
    }
    return pdf;
  }, [captureCanvas]);

  const fileName = useCallback(
    (ext = "pdf") => `${String(inv.number || "invoice").replace(/[^A-Za-z0-9_-]+/g, "-")}.${ext}`,
    [inv.number]
  );

  // Save/share the A4 PDF (replaces the unreliable browser print). On phones we
  // prefer the native share sheet (Save to Files, Mail, Messages…), since iOS
  // Safari won't reliably download a blob; desktop falls back to a download.
  const downloadPdf = useCallback(async () => {
    if (!sheetRef.current) return;
    setDownloading(true);
    try {
      const pdf = await buildPdf();
      const name = fileName();
      const blob = pdf.output("blob");
      const file = typeof File !== "undefined" ? new File([blob], name, { type: "application/pdf" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return; // user closed the share sheet
          // any other error → fall back to a direct download below
        }
      }
      pdf.save(name);
    } catch (e) {
      toast({ message: e?.message ?? "Couldn't build the PDF.", type: "error" });
    } finally {
      setDownloading(false);
    }
  }, [buildPdf, fileName, toast]);

  // Save/share the invoice as a PNG image. Same A4 capture as the PDF, output as
  // a picture for pasting into messages, socials, or a photo library. Uses the
  // native share sheet on phones and falls back to a plain download on desktop.
  const downloadImage = useCallback(async () => {
    if (!sheetRef.current) return;
    setSavingImg(true);
    try {
      const canvas = await captureCanvas();
      const name = fileName("png");
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't build the image.");
      const file = typeof File !== "undefined" ? new File([blob], name, { type: "image/png" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return; // user closed the share sheet
          // any other error → fall back to a direct download below
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ message: e?.message ?? "Couldn't build the image.", type: "error" });
    } finally {
      setSavingImg(false);
    }
  }, [captureCanvas, fileName, toast]);

  // Render the on-screen invoice to a PDF, then post it to the API route which
  // emails it to the customer via Resend.
  const emailToCustomer = useCallback(async () => {
    if (!inv.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email)) {
      toast({ message: "This invoice has no valid customer email. Add one via the booking, or resend after editing.", type: "error" });
      return;
    }
    if (!sheetRef.current) return;
    setSending(true);
    try {
      const pdf = await buildPdf();
      const pdfBase64 = pdf.output("datauristring").split(",")[1];

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          invoiceId: inv.id, to: inv.email, customerName: inv.customer,
          number: inv.number, total: money(inv.total), pdfBase64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send the invoice.");

      toast({ message: `Invoice emailed to ${inv.email}`, type: "success" });
      if (inv.status !== "Paid") onEmailed?.(inv.id);
    } catch (e) {
      toast({ message: e?.message ?? "Failed to email the invoice.", type: "error" });
    } finally {
      setSending(false);
    }
  }, [inv, toast, onEmailed, buildPdf]);

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl">
        {/* Action bar — hidden when printing */}
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:text-[#0F1B33]">← Back</button>
          <div className="flex flex-wrap items-center gap-2">
            {inv.status !== "Sent" && inv.status !== "Paid" && (
              <button onClick={() => onStatus(inv.id, "Sent")} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400/30 bg-blue-400/10 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-400/20"><Send className="h-3.5 w-3.5" />Mark Sent</button>
            )}
            {inv.status !== "Paid" && (
              <button onClick={() => onStatus(inv.id, "Paid")} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-400/20"><Check className="h-3.5 w-3.5" />Mark Paid</button>
            )}
            {inv.status !== "Void" && (
              <button onClick={() => onStatus(inv.id, "Void")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:text-[#0F1B33]">Void</button>
            )}
            <button onClick={() => onDelete(inv)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            <button onClick={emailToCustomer} disabled={sending} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-400/20 disabled:opacity-60">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {sending ? "Sending…" : "Email to Customer"}
            </button>
            <button onClick={downloadImage} disabled={savingImg} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-[#0F1B33] disabled:opacity-60">
              {savingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
              {savingImg ? "Building…" : "Save Image"}
            </button>
            <button onClick={downloadPdf} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-60">
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              {downloading ? "Building…" : "Save PDF (A4)"}
            </button>
          </div>
        </div>

        {/* The invoice sheet */}
        <div ref={sheetRef} className="invoice-print flex flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl" style={exact}>
          {/* Everything above the footer — grows to push the footer to the
              bottom of the page when the sheet is sized to A4 for print/PDF. */}
          <div className="flex flex-1 flex-col">
          {/* ── Header band ── */}
          <div className="relative px-5 pt-5 pb-10 sm:px-10 sm:pt-8 sm:pb-14" style={{ backgroundColor: NAVY, ...exact }}>
            <div className="flex items-start justify-between gap-3">
              <InvoiceLogo company={company} brand={brand} />
              <div className="text-right">
                <p className="text-xl font-light tracking-[0.3em] sm:text-3xl sm:tracking-[0.35em]" style={{ color: GOLD }}>INVOICE</p>
                <div className="ml-auto mt-2 h-0.5 w-16 sm:w-24" style={{ background: GOLD }} />
              </div>
            </div>
            {/* angled gold accent toward the white body */}
            <svg className="absolute inset-x-0 bottom-0 h-8 w-full" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
              <polygon points="0,10 100,10 100,3 55,10" fill="#ffffff" />
              <line x1="55" y1="10" x2="100" y2="3" stroke={GOLD} strokeWidth="0.4" />
            </svg>
          </div>

          {/* ── Bill-to + meta ── */}
          <div className="grid grid-cols-2 gap-4 px-5 pt-5 text-sm sm:gap-6 sm:px-10">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Invoice to</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{inv.customer}</p>
              {inv.address && inv.address.split(/,\s*/).map((ln, i) => (
                <p key={i} className="text-slate-600">{ln}</p>
              ))}
              {inv.email && <p className="mt-1 text-slate-600">{inv.email}</p>}
              {inv.phone && <p className="text-slate-600">{inv.phone}</p>}
            </div>
            <div className="border-l pl-6" style={{ borderColor: `${GOLD}55` }}>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5" style={{ color: GOLD }} />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Date</p>
                  <p className="mt-0.5 font-medium text-slate-800">{longDate(inv.issueDate) || inv.issueDate || "—"}</p>
                </div>
              </div>
              <div className="my-3 h-px w-full" style={{ background: `${GOLD}33` }} />
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5" style={{ color: GOLD }} />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Invoice number</p>
                  <p className="mt-0.5 font-medium text-slate-800">{inv.number}</p>
                  {inv.status !== "Draft" && (
                    <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      inv.status === "Paid" ? "border-emerald-500 text-emerald-700"
                      : inv.status === "Sent" ? "border-blue-500 text-blue-700"
                      : "border-slate-400 text-slate-500"}`}>{inv.status}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Line-items table ── */}
          <div className="px-5 pt-5 sm:px-10 sm:pt-6">
            <div className="overflow-hidden rounded-sm border" style={{ borderColor: `${GOLD}66` }}>
              <table className="w-full table-fixed text-[13px] sm:text-sm">
                <colgroup>
                  <col />
                  <col className="w-9 sm:w-12" />
                  <col className="w-16 sm:w-24" />
                  <col className="w-16 sm:w-24" />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: NAVY, ...exact }}>
                    <th className="px-2.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.12em] sm:px-4 sm:py-3 sm:text-[11px]" style={{ color: GOLD }}>Description</th>
                    <th className="px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:py-3 sm:text-[11px]" style={{ color: GOLD }}>Qty</th>
                    <th className="px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:py-3 sm:text-[11px]" style={{ color: GOLD }}>Price</th>
                    <th className="px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] sm:px-4 sm:py-3 sm:text-[11px]" style={{ color: GOLD }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lineItems.map((li, i) => (
                    <tr key={i} className="align-top" style={{ borderTop: i === 0 ? "none" : `1px solid ${GOLD}22` }}>
                      <td className="px-2.5 py-2.5 text-slate-700 sm:px-4 sm:py-3">
                        <p className="break-words font-medium text-slate-800">{li.description}</p>
                        {i === 0 && jLines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {jLines.map((l, k) => <p key={k} className="break-words text-[10px] text-slate-500 sm:text-[11px]">{l}</p>)}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-2.5 text-center text-slate-600 sm:px-3 sm:py-3">{li.quantity}</td>
                      <td className="whitespace-nowrap px-1 py-2.5 text-center text-slate-600 sm:px-3 sm:py-3">{money(li.unit_price)}</td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-center font-medium text-slate-800 sm:px-4 sm:py-3">{money((Number(li.quantity) || 0) * (Number(li.unit_price) || 0))}</td>
                    </tr>
                  ))}
                  {/* Subtotal */}
                  <tr style={{ borderTop: `1px solid ${GOLD}66` }}>
                    <td className="px-2.5 py-2 sm:px-4 sm:py-2.5" />
                    <td colSpan={2} className="px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 sm:px-3 sm:py-2.5 sm:text-[12px]" style={{ borderLeft: `1px solid ${GOLD}66` }}>Subtotal</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-center font-medium text-slate-800 sm:px-4 sm:py-2.5">{money(inv.subtotal)}</td>
                  </tr>
                  {/* Tax */}
                  <tr style={{ borderTop: `1px solid ${GOLD}66` }}>
                    <td className="px-2.5 py-2 sm:px-4 sm:py-2.5" />
                    <td colSpan={2} className="px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 sm:px-3 sm:py-2.5 sm:text-[12px]" style={{ borderLeft: `1px solid ${GOLD}66` }}>
                      Tax ({Math.round((inv.vatRate || 0) * 100)}%)
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-center font-medium text-slate-800 sm:px-4 sm:py-2.5">{money(inv.vatAmount)}</td>
                  </tr>
                  {/* Total */}
                  <tr style={{ backgroundColor: NAVY, ...exact }}>
                    <td className="px-2.5 py-3 sm:px-4 sm:py-3.5" />
                    <td colSpan={2} className="px-1 py-3 text-center text-base font-bold uppercase tracking-wider sm:px-3 sm:py-3.5 sm:text-lg" style={{ color: GOLD }}>Total</td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-center text-base font-black sm:px-4 sm:py-3.5 sm:text-lg" style={{ color: GOLD }}>{money(inv.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Payment terms + thank you ── */}
          <div className="grid grid-cols-2 gap-4 px-5 py-6 sm:gap-6 sm:px-10 sm:py-8">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 sm:h-11 sm:w-11" style={{ borderColor: GOLD }}>
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: GOLD }} />
              </span>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-slate-800">Payment terms</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{terms}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 border-l pl-4 sm:pl-6" style={{ borderColor: `${GOLD}33` }}>
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 sm:h-11 sm:w-11" style={{ borderColor: GOLD }}>
                <Gem className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: GOLD }} />
              </span>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-slate-800">Thank you</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">We appreciate your business and look forward to our continued partnership.</p>
              </div>
            </div>
          </div>

          {/* Thank-you flourish — centres in the space above the footer so a
              short invoice still fills the A4 page. A faint copy of the logo sits
              behind it as a watermark to fill the empty space. */}
          <div className="relative flex flex-1 items-center justify-center px-8 py-8">
            {/* Watermark — the logo, greatly enlarged and dimmed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoSrcFor(brand) && <img
              src={logoSrcFor(brand)}
              crossOrigin={brand.logoUrl ? "anonymous" : undefined}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 w-64 max-w-[70%] -translate-x-1/2 -translate-y-1/2 select-none sm:w-80"
              style={{ opacity: 0.06 }}
            />}
            <div className="relative text-center">
              <p className="text-[15px] font-semibold uppercase tracking-[0.18em] sm:text-base" style={{ color: NAVY }}>
                Thank you for choosing {company.name}
              </p>
              <div className="mx-auto mt-2.5 h-px w-20" style={{ background: GOLD }} />
            </div>
          </div>
          </div>{/* end grow wrapper */}

          {/* ── Footer band ── */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 text-[11px] sm:px-10 sm:py-5" style={{ backgroundColor: NAVY, ...exact }}>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
              <div className="leading-snug text-slate-300">
                {company.addressLines.map((l, i) => <p key={i}>{l}</p>)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="h-4 w-4" style={{ color: GOLD }} /> {company.phone}
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Mail className="h-4 w-4" style={{ color: GOLD }} /> {company.email}
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Globe className="h-4 w-4" style={{ color: GOLD }} /> {company.web}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function InvoicesPage() {
  const { invoices, loading, createInvoice, updateStatus, deleteInvoice } = useInvoices();
  const { jobs, loading: jobsLoading } = useInvoiceJobs();
  const toast = useOperatorToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  // invoices?ref=EVX-… opens the new-invoice form for that job. The address is
  // read as an external value (nothing on the server, so no mismatch), and the
  // form opens once when it first appears.
  const urlRef = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("ref"),
    () => null
  );
  const [dismissedRef, setDismissedRef] = useState(null); // closed by the operator
  const [openedForRef, setOpenedForRef] = useState(null);
  const initialRef = urlRef && urlRef !== dismissedRef ? urlRef : null;
  if (urlRef && openedForRef !== urlRef) {
    setOpenedForRef(urlRef);
    setModalOpen(true);
  }

  // A job's existing invoice, matched by the booking link or its ref.
  const invoiceFor = useMemo(() => {
    const byId = new Map(), byRef = new Map();
    invoices.forEach((i) => {
      if (i.bookingId) byId.set(i.bookingId, i);
      if (i.bookingRef) byRef.set(i.bookingRef, i);
    });
    return (j) => (j.dbId && byId.get(j.dbId)) || byRef.get(j.id) || (j.dbId && byRef.get(j.dbId)) || null;
  }, [invoices]);

  const stats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status === "Draft" || i.status === "Sent").reduce((a, i) => a + i.total, 0);
    const paid = invoices.filter((i) => i.status === "Paid").reduce((a, i) => a + i.total, 0);
    const unpaidCount = invoices.filter((i) => i.status === "Draft" || i.status === "Sent").length;
    return { outstanding, paid, unpaidCount };
  }, [invoices]);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return invoices.filter((i) => {
      if (filter !== "All" && i.status !== filter) return false;
      if (!words.length) return true;
      const text = [
        i.number, i.bookingRef, i.customer, i.email, i.phone, String(i.phone || "").replace(/\D/g, ""),
        i.journey?.pickup, i.journey?.dropoff, i.journey?.date, fmtDate(i.journey?.date),
        i.issueDate, fmtDate(i.issueDate),
      ].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [invoices, filter, search]);

  const handleCreate = useCallback(async (form) => {
    const inv = await createInvoice(form);
    toast({ message: `Invoice ${inv.number} created`, type: "success" });
    setPreview(inv);
    return inv;
  }, [createInvoice, toast]);

  const handleStatus = useCallback(async (id, status) => {
    try {
      await updateStatus(id, status);
      setPreview((p) => (p?.id === id ? { ...p, status } : p));
      toast({ message: `Invoice marked ${status}`, type: "success" });
    } catch (e) {
      toast({ message: e?.message ?? "Failed to update", type: "error" });
    }
  }, [updateStatus, toast]);

  const handleDelete = useCallback(async (inv) => {
    if (!confirm(`Delete invoice ${inv.number}? This cannot be undone.`)) return;
    try {
      await deleteInvoice(inv.id);
      setPreview(null);
      toast({ message: `Invoice ${inv.number} deleted`, type: "success" });
    } catch (e) {
      toast({ message: e?.message ?? "Failed to delete", type: "error" });
    }
  }, [deleteInvoice, toast]);

  return (
    <>
      {/* Print isolation: only the invoice sheet prints, sized to a single A4
          page with the full-width (desktop) layout and backgrounds intact. */}
      <style>{`
      @page { size: A4 portrait; margin: 12mm; }
      @media print {
        html, body { width: 210mm; background: #ffffff !important; }
        body * { visibility: hidden !important; }
        .invoice-print, .invoice-print * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .invoice-print {
          position: absolute; left: 0; top: 0;
          width: 186mm;              /* A4 width (210mm) minus 2×12mm page margins */
          box-shadow: none !important; border-radius: 0 !important;
        }
        .invoice-print table { page-break-inside: auto; }
        .invoice-print tr { page-break-inside: avoid; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="grid min-w-0 gap-4 p-4 sm:gap-6 sm:p-6 lg:p-10">
        {/* Stats */}
        <div className="grid min-w-0 grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Outstanding", value: money(stats.outstanding), icon: Clock, color: "text-amber-600" },
            { label: "Paid", value: money(stats.paid), icon: CircleDollarSign, color: "text-emerald-600" },
            { label: "Unpaid", value: stats.unpaidCount, icon: FileText, color: "text-[#0F1B33]" },
          ].map((s) => (
            <div key={s.label} className="card min-w-0 p-3 sm:p-5">
              <div className="mb-2 flex items-center justify-between">
                <s.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.color}`} />
              </div>
              <p className={`truncate text-lg font-bold sm:text-2xl ${s.color}`}>{s.value}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Header + New */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Billing</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#0F1B33]">Invoices</h2>
          </div>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 sm:px-5 sm:py-3">
            <Plus className="h-4 w-4" /> New Invoice
          </button>
        </div>

        {/* Search + filter chips */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + " pl-9"}
            placeholder="Search invoices: number, job ref, customer, phone, address or date" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", "Draft", "Sent", "Paid", "Void"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? "border-amber-400/40 bg-amber-400/10 text-amber-600" : "border-slate-200 text-slate-500 hover:text-slate-600"}`}>
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="card min-w-0 p-3 sm:p-4">
          {loading && invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">Loading invoices…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <FileText className="mb-3 h-8 w-8 text-slate-700" />
              <p className="text-sm text-slate-600">{invoices.length === 0 ? "No invoices yet." : search.trim() ? "No invoices match your search." : `No ${filter.toLowerCase()} invoices.`}</p>
              {invoices.length === 0 && (
                <button onClick={() => setModalOpen(true)} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 hover:text-amber-600">
                  + Create your first invoice
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((inv) => (
                <button key={inv.id} onClick={() => setPreview(inv)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-amber-400/20 hover:bg-slate-50">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400/10">
                    <FileText className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0F1B33]">{inv.customer}</p>
                    <p className="truncate text-xs text-slate-500">
                      {inv.number}{inv.bookingRef ? ` · ${inv.bookingRef}` : ""}{inv.journey?.date ? ` · Travel ${fmtDate(inv.journey.date)}` : inv.issueDate ? ` · Issued ${fmtDate(inv.issueDate)}` : ""}
                      {inv.journey?.pickup || inv.journey?.dropoff ? ` · ${[inv.journey.pickup, inv.journey.dropoff].filter(Boolean).join(" → ")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold text-amber-600">{money(inv.total)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusChip(inv.status)}`}>{inv.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <InvoiceModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDismissedRef(urlRef); }}
        onCreate={handleCreate}
        bookings={jobs}
        jobsLoading={jobsLoading}
        invoiceFor={invoiceFor}
        onOpenInvoice={(inv) => { setModalOpen(false); setDismissedRef(urlRef); setPreview(inv); }}
        initialRef={initialRef}
      />
      {preview && (
        <InvoicePreview
          invoice={preview}
          onClose={() => setPreview(null)}
          onStatus={handleStatus}
          onDelete={handleDelete}
          onEmailed={(id) => {
            updateStatus(id, "Sent").catch(() => {});
            setPreview((p) => (p?.id === id ? { ...p, status: "Sent" } : p));
          }}
        />
      )}
    </>
  );
}
