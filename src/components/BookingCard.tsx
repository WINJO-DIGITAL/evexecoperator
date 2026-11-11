"use client";

import { useState, type ReactNode } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Clock, MapPin, Phone, ChevronDown, ChevronUp, MessageSquare, Star, AlertCircle, Bell, AlertTriangle, Trash2, Users, Briefcase, RotateCcw, Pencil, X, ShieldCheck, Camera } from "lucide-react";
import type { DbBooking, DbDriver, BookingStatus, DbDriverLocation, DbJobProof, JobProofKind } from "@/lib/database.types";
import { STATUS_NEXT_PRIMARY, STATUS_NEXT_LABEL, reverseTarget, reverseLabel } from "@/lib/database.types";
import type { BookingNotificationStatus } from "@/hooks/useNotifications";
import { supabase } from "@/lib/supabase";
import StatusBadge from "./StatusBadge";
import DriverDropdown from "./DriverDropdown";
import DriverLiveBadge from "./DriverLiveBadge";
import JobOfferBadge from "./JobOfferBadge";
import FlightVerificationCard from "./FlightVerificationCard";
import { fmtDateTime, fmtDayDate, ukToIso } from "@/lib/dates";
import { looksLikeAirport } from "@/lib/bookingUtils";

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  confirmation: "Confirmation",
  reminder_24h: "24h reminder",
  received: "Booking received",
};

interface Props {
  booking: DbBooking;
  drivers: DbDriver[];
  notification?: BookingNotificationStatus;
  unavailableDriverIds?: Set<string>;
  onStatusChange: (ref: string, status: BookingStatus) => void;
  onDriverAssign:  (ref: string, driverId: string | null) => void;
  onDangerAction?: (booking: DbBooking) => void;
  onViewReturn?: (booking: DbBooking) => void;
  driverLocation?: DbDriverLocation;
  proofs?: DbJobProof[];
}

const PROOF_KIND_LABEL: Record<JobProofKind, string> = {
  pob_photo: "Pickup photo",
  signature: "Signature",
  completion_photo: "Completion photo",
  no_show_photo: "No-show photo",
};

function proofTime(value: string | null | undefined): string {
  if (!value) return "—";
  return fmtDateTime(value);
}

function short(value: string | null | undefined) {
  return value ? value.split(",")[0] : "—";
}

function displayDate(value: string | null | undefined) {
  if (!value) return null;
  return fmtDayDate(value);
}

export default function BookingCard({ booking, drivers, notification, unavailableDriverIds, onStatusChange, onDriverAssign, onDangerAction, onViewReturn, driverLocation, proofs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const time = booking.travel_time?.slice(0, 5) ?? "—";
  const nextStatus = STATUS_NEXT_PRIMARY[booking.status];
  const nextLabel = STATUS_NEXT_LABEL[booking.status];
  const undoStatus = reverseTarget(booking.status);
  const undoLabel = reverseLabel(booking.status);
  const pickup = booking.pickup_location || booking.airport || booking.direction || "—";
  const dropoff = booking.dropoff_address || booking.destination || booking.airport || "—";
  const route = `${short(pickup)} → ${short(dropoff)}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden transition-all hover:border-gold/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-amber-600/80" />
          <span className="text-xl font-bold text-slate-800 tracking-tight">{time}</span>
          {booking.priority && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <Star size={8} fill="currentColor" /> Priority
            </span>
          )}
          {notification && notification.failedCount > 0 && <AlertTriangle size={12} className="text-red-600" aria-label="Notification failed to send" />}
        </div>
        <div className="flex items-center gap-1.5">
          <JobOfferBadge booking={booking} />
          <StatusBadge status={booking.status} />
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
        <div>
          <p className="font-semibold text-slate-800 text-sm leading-tight">{booking.customer_name}</p>
          <div className="flex items-start gap-1.5 mt-1">
            <MapPin size={12} className="text-amber-600/70 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">{route}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-100 p-3 space-y-2">
          <DetailRow label="Pick up" value={pickup} strong />
          <DetailRow label="Drop off" value={dropoff} strong />
          {booking.flight_number && <DetailRow label="Flight" value={booking.flight_number} />}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InfoPill icon={<Users size={12} />} label="Passengers" value={booking.passengers != null ? String(booking.passengers) : "—"} />
          <InfoPill icon={<Briefcase size={12} />} label="Bags" value={booking.luggage || "—"} />
        </div>

        {booking.return_journey && (() => {
          const clickable = !!(onViewReturn && booking.return_date);
          const inner = (
            <>
              <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-emerald-600">
                <span className="flex items-center gap-1.5"><RotateCcw size={12} /> Return journey</span>
                {clickable && <span className="text-[10px] font-semibold text-emerald-600/80">View on calendar →</span>}
              </div>
              {booking.return_date && <DetailRow label="Return date" value={`${displayDate(booking.return_date) ?? booking.return_date}${booking.return_time ? ` · ${booking.return_time.slice(0, 5)}` : ""}`} />}
              {booking.return_pickup && <DetailRow label="Return pick up" value={booking.return_pickup} />}
              {booking.return_destination && <DetailRow label="Return drop" value={booking.return_destination} />}
              {booking.return_airport && <DetailRow label="Return airport" value={booking.return_airport} />}
              {booking.return_flight && <DetailRow label="Return flight" value={booking.return_flight} />}
            </>
          );
          return clickable ? (
            <button
              type="button"
              onClick={() => onViewReturn!(booking)}
              title="View the return job on the calendar"
              className="w-full space-y-2 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/10 active:scale-[0.99]"
            >
              {inner}
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 space-y-2">{inner}</div>
          );
        })()}

        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${booking.payment_status === "Paid" ? "text-emerald-600" : "text-slate-500"}`}>
            {booking.payment_status ?? "Unpaid"}{booking.payment_method ? ` · ${booking.payment_method}` : " · method not set"}
          </span>
          <span className="text-sm font-semibold text-amber-600">{booking.quoted_price != null ? `£${Number(booking.quoted_price).toFixed(Number.isInteger(Number(booking.quoted_price)) ? 0 : 2)}` : "TBC"}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16 shrink-0">Driver</span>
          <DriverDropdown drivers={drivers} selectedDriverId={booking.driver_id} unavailableDriverIds={unavailableDriverIds} onAssign={(id) => onDriverAssign(booking.ref, id)} disabled={booking.status === "Completed" || booking.status === "Cancelled"} />
          {driverLocation && <DriverLiveBadge location={driverLocation} />}
          {booking.driver_id && unavailableDriverIds?.has(booking.driver_id) && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600" title="Driver has marked this day unavailable"><AlertTriangle size={11} /> Unavailable</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-600 transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Less details" : "More details"}
          </button>
          {onDangerAction && (
            <button type="button" onClick={() => onDangerAction(booking)} title="Remove job" className="flex items-center gap-1 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-500/20"><Trash2 size={12} /> Remove</button>
          )}
        </div>

        {expanded && (
          <div className="space-y-2 pt-1 border-t border-slate-100 slide-up">
            {booking.travel_date && <DetailRow label="Date" value={displayDate(booking.travel_date) ?? booking.travel_date} />}
            {booking.journey_type && <DetailRow label="Journey" value={booking.journey_type.replace(/_/g, " ")} />}
            {booking.vehicle_type && <DetailRow label="Vehicle" value={booking.vehicle_type} />}
            {booking.customer_phone && <div className="flex items-center gap-1.5"><Phone size={11} className="text-amber-600/70 shrink-0" /><span className="text-xs text-slate-500">{booking.customer_phone}</span></div>}
            {booking.customer_email && <DetailRow label="Email" value={booking.customer_email} />}
            {(booking.notes || booking.operator_note) && <div className="flex items-start gap-1.5"><MessageSquare size={11} className="text-amber-600/70 shrink-0 mt-0.5" /><span className="text-xs text-slate-500 italic">{booking.notes || booking.operator_note}</span></div>}
            {notification?.lastSent && <div className="flex items-center gap-1.5"><Bell size={11} className="text-amber-600/70 shrink-0" /><span className="text-xs text-slate-500">{NOTIFICATION_TYPE_LABELS[notification.lastSent.type] ?? notification.lastSent.type} sent {formatDistanceToNow(parseISO(notification.lastSent.sent_at), { addSuffix: true })}</span></div>}
            {notification && notification.pendingCount > 0 && <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-100 px-3 py-1.5 rounded-lg"><Bell size={11} />{notification.pendingCount} notification{notification.pendingCount === 1 ? "" : "s"} pending</div>}
            {notification && notification.failedCount > 0 && <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-100 px-3 py-1.5 rounded-lg"><AlertTriangle size={11} />{notification.failedCount} notification{notification.failedCount === 1 ? "" : "s"} failed to send</div>}
            {(booking.pob_at || booking.completed_at || (proofs && proofs.length > 0)) && (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600"><ShieldCheck size={12} /> Proof of job</div>
                {booking.pob_at && <DetailRow label="Picked up" value={proofTime(booking.pob_at)} />}
                {booking.completed_at && <DetailRow label="Completed" value={proofTime(booking.completed_at)} />}
                {proofs && proofs.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {proofs.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" title={PROOF_KIND_LABEL[p.kind]} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-gold/30 hover:text-amber-600"><Camera size={10} />{PROOF_KIND_LABEL[p.kind]}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={() => setEditing(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/25 bg-gold/10 px-3 py-2 text-xs font-semibold text-amber-600 transition hover:bg-gold/20"><Pencil size={13} /> Edit job</button>
          </div>
        )}

        {(nextStatus || undoStatus) && (
          <div className="flex items-center gap-2 mt-1">
            {nextStatus && nextLabel && (
              <button type="button" onClick={() => onStatusChange(booking.ref, nextStatus)} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gold/10 text-amber-600 border border-gold/25 hover:bg-gold/20 hover:border-gold/40 active:scale-[0.98] transition-all">
                {nextLabel}
              </button>
            )}
            {undoStatus && undoLabel && (
              <button
                type="button"
                onClick={() => onStatusChange(booking.ref, undoStatus)}
                title="Operator correction — reverses this job one step. Drivers can't undo their own progress."
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 border border-slate-200 bg-white transition-all hover:text-red-600 hover:border-red-300 hover:bg-red-50 active:scale-[0.98] ${nextStatus ? "px-3" : "flex-1"}`}
              >
                <RotateCcw size={12} /> {undoLabel}
              </button>
            )}
          </div>
        )}

        {booking.status === "Unassigned / Missed Call Recovery" && <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-100 px-3 py-1.5 rounded-lg"><AlertCircle size={11} /> Missed call recovery — assign driver urgently</div>}
      </div>

      {editing && <EditBookingModal booking={booking} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditBookingModal({ booking, onClose }: { booking: DbBooking; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    travel_date: booking.travel_date ?? "",
    travel_time: booking.travel_time?.slice(0, 5) ?? "",
    customer_name: booking.customer_name ?? "",
    customer_phone: booking.customer_phone ?? "",
    customer_email: booking.customer_email ?? "",
    pickup_location: booking.pickup_location ?? "",
    dropoff_address: booking.dropoff_address ?? "",
    flight_number: booking.flight_number ?? "",
    passengers: booking.passengers != null ? String(booking.passengers) : "1",
    luggage: booking.luggage ?? "",
    quoted_price: booking.quoted_price != null ? String(booking.quoted_price) : "",
    notes: booking.notes ?? booking.operator_note ?? "",
    priority: Boolean(booking.priority),
    payment_status: booking.payment_status ?? "Unpaid",
    payment_method: booking.payment_method ?? "",
  });

  const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const passengers = Math.max(1, Number.parseInt(form.passengers, 10) || 1);
    const pickup_location = form.pickup_location.trim() || null;
    const dropoff_address = form.dropoff_address.trim() || null;
    // No separate "Airport" field -- whichever of pickup/drop-off reads as
    // an airport is the airport, same detection used everywhere else this
    // is entered (Dispatch board, website, Calendar's New Transfer).
    const airport = looksLikeAirport(pickup_location)
      ? pickup_location
      : looksLikeAirport(dropoff_address)
      ? dropoff_address
      : null;
    const payload = {
      travel_date: form.travel_date || null,
      travel_time: form.travel_time ? `${form.travel_time}:00` : null,
      pickup_time: ukToIso(form.travel_date, form.travel_time),
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      pickup_location,
      airport,
      dropoff_address,
      flight_number: form.flight_number.trim() || null,
      passengers,
      luggage: form.luggage.trim() || null,
      quoted_price: form.quoted_price ? Number(form.quoted_price) : null,
      notes: form.notes.trim() || null,
      priority: form.priority,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
    };

    const { error: updateError } = await supabase.from("bookings").update(payload).eq("ref", booking.ref);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#0F1B33]">Edit job</h2>
            <p className="text-xs text-slate-500">{booking.ref}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-[#0F1B33]"><X size={16} /></button>
        </div>

        <div className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date" type="date" value={form.travel_date} onChange={(v) => set("travel_date", v)} />
            <Field label="Time" type="time" value={form.travel_time} onChange={(v) => set("travel_time", v)} />
          </div>
          <Field label="Customer name" value={form.customer_name} onChange={(v) => set("customer_name", v)} required />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" value={form.customer_phone} onChange={(v) => set("customer_phone", v)} />
            <Field label="Email" value={form.customer_email} onChange={(v) => set("customer_email", v)} />
          </div>
          <Field label="Pickup address" value={form.pickup_location} onChange={(v) => set("pickup_location", v)} />
          <Field label="Drop-off address" value={form.dropoff_address} onChange={(v) => set("dropoff_address", v)} />
          <Field label="Flight number" value={form.flight_number} onChange={(v) => set("flight_number", v)} />
          {booking.flight_number && (
            <FlightVerificationCard
              bookingId={booking.id}
              flightNumberInput={booking.flight_number}
              airportInput={booking.airport}
              journeyType={booking.journey_type}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Passengers" type="number" value={form.passengers} onChange={(v) => set("passengers", v)} min={1} />
            <Field label="Bags" value={form.luggage} onChange={(v) => set("luggage", v)} />
          </div>
          <Field label="Price (£)" type="number" value={form.quoted_price} onChange={(v) => set("quoted_price", v)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Payment status</label>
              <select
                value={form.payment_status}
                onChange={(e) => set("payment_status", e.target.value)}
                className={editInputCls}
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Invoiced">Invoiced</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Payment method (driver sees this)</label>
              <select
                value={form.payment_method}
                onChange={(e) => set("payment_method", e.target.value)}
                className={editInputCls}
              >
                <option value="">Not set — TBC</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={editInputCls} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={form.priority} onChange={(e) => set("priority", e.target.checked)} className="h-4 w-4 accent-gold" />
            Mark as priority
          </label>
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !form.customer_name.trim()} className="flex-1 rounded-2xl bg-gold-gradient px-4 py-3 text-sm font-bold text-navy-900 disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

const editInputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-gold/50";

function Field({ label, value, onChange, type = "text", required, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: number }) {
  return <div><label className="mb-1 block text-xs text-slate-500">{label}</label><input type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} required={required} className={editInputCls} /></div>;
}

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">{icon}{label}</div><div className="mt-1 text-xs font-semibold text-slate-700">{value}</div></div>;
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-start gap-2"><span className="text-xs text-slate-600 w-20 shrink-0 mt-0.5">{label}</span><span className={`text-xs leading-relaxed ${strong ? "font-semibold text-slate-700" : "text-slate-500"}`}>{value}</span></div>;
}
