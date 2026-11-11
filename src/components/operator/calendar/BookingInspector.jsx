"use client";

import { ArrowLeftRight, ArrowUpRight, CornerDownRight, Phone, Plane, X } from "lucide-react";
import { fmtDate } from "@/lib/dates";
import { formatGap, longDay } from "@/lib/operator/calendarModel";
import { ExceptionNote, StateLabel, StatusMark } from "./BookingRow";

function Field({ label, children, className = "" }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-cal-label font-semibold uppercase text-cal-muted">{label}</dt>
      <dd className="mt-1 text-cal-sm text-cal-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const money = (n) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortPlace = (v) => (v ? String(v).split(",")[0].trim() : "—");

/**
 * Two same-driver jobs side by side. The app records pickup times but not
 * journey length, so it shows the gap and says what it can't know rather
 * than declaring an overlap.
 */
function ConflictPanel({ b, flag, other, onView }) {
  const [first, second] = flag.gap > 0 ? [b, other] : [other, b];
  const line = (job) => (
    <li className="flex items-baseline gap-2.5 py-1.5">
      <span className="w-[42px] shrink-0 text-cal-sm font-semibold tabular-nums text-cal-ink">{job.time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-cal-sm font-medium text-cal-ink">{job.customer}</span>
        <span className="block truncate text-cal-xs text-cal-muted">{shortPlace(job.pickupLocation || job.airport)} → {shortPlace(job.dropoffAddress || job.airport)}</span>
      </span>
      {job.id === b.id ? (
        <span className="shrink-0 text-cal-xs text-cal-muted">This job</span>
      ) : (
        <button type="button" onClick={() => onView(job)} className="shrink-0 text-cal-xs font-semibold text-cal-ink underline decoration-1 underline-offset-2 hover:decoration-2">
          View {job.id}
        </button>
      )}
    </li>
  );
  return (
    <section aria-label="Possible clash" className="border-b border-cal-line py-3">
      <h4 className="flex items-center gap-1.5 text-cal-sm font-semibold text-cal-alert">
        <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Same driver, {formatGap(Math.abs(flag.gap))} apart
      </h4>
      <ul className="mt-1.5 divide-y divide-cal-line">
        {line(first)}
        {line(second)}
      </ul>
      <p className="mt-1.5 text-cal-xs text-cal-muted">
        Both are with {b.driver}. The pickups are under the usual 90-minute gap. Journey times aren&apos;t recorded, so check the
        first job can finish in time, or choose another driver below.
      </p>
    </section>
  );
}

/**
 * The side panel's booking view (desktop). Read-only summary with quick
 * driver assignment; everything else goes through the shared booking drawer.
 */
export default function BookingInspector({ b, lookup, drivers = [], unavailable = new Set(), onAssign, onAction, onSelect, onClose, onOpenFull, onGoToDate }) {
  const canAssign = onAssign && !["done", "cancelled", "reply"].includes(b.state);
  const flight = b.flight && b.flight !== "—" ? b.flight : null;
  const pickup = b.pickupLocation || b.airport || b.direction;
  const dropoff = b.dropoffAddress || b.airport;
  const passengers = b.passengers ? `${b.passengers} passenger${b.passengers === 1 ? "" : "s"}` : null;
  const vehicle = [b.vehicleType, passengers, b.luggage ? `${b.luggage} luggage` : null].filter(Boolean).join(" · ");
  const clashFlag = b.flags.find((f) => f.code === "clash");
  const clashOther = clashFlag ? lookup(clashFlag.otherId) : null;
  // The clash has its own panel; other exceptions keep their one-line note.
  const notes = b.flags.filter((f) => f.code !== "clash" || !clashOther);

  return (
    <article aria-label={`Booking ${b.id}`} className="flex min-h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-cal-line pb-3">
        <div className="min-w-0">
          <StateLabel state={b.state} />
          <p className="mt-1.5 font-display text-cal-2xl font-medium tabular-nums text-cal-ink">{b.minutes == null ? "--:--" : b.time}</p>
          <p className="mt-0.5 text-cal-xs text-cal-muted">{b.travelDate ? longDay(b.travelDate) : "No date"} · <span className="tabular-nums">{b.id}</span></p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close booking" className="-mr-1 flex h-9 w-9 items-center justify-center rounded-cal text-cal-muted hover:bg-cal-well hover:text-cal-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass">
          <X className="h-4 w-4" />
        </button>
      </header>

      {notes.length > 0 && (
        <div className="space-y-1.5 border-b border-cal-line py-2.5">
          {notes.map((f) => <ExceptionNote key={f.code} flag={f} onAction={f.code === "clash" || ["driver", "urgent", "unavailable"].includes(f.code) ? null : (flag) => onAction(flag, b)} />)}
        </div>
      )}
      {clashFlag && clashOther && <ConflictPanel b={b} flag={clashFlag} other={clashOther} onView={onSelect} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 py-4">
        <Field label="Client" className="col-span-2">
          <span className="font-semibold">{b.customer}</span>
          {(b.phone || b.email) && (
            <span className="mt-0.5 block text-cal-xs text-cal-ink2">
              {b.phone && <span className="tabular-nums">{b.phone}</span>}
              {b.phone && b.email && " · "}
              {b.email}
            </span>
          )}
        </Field>
        <Field label="Pick-up" className="col-span-2">{pickup}</Field>
        <Field label="Drop-off" className="col-span-2">{dropoff}</Field>
        <Field label="Flight">{flight && <span className="inline-flex items-center gap-1.5 tabular-nums"><Plane className="h-3.5 w-3.5 text-cal-muted" />{flight}</span>}</Field>
        <Field label="Journey">{b.journeyType}</Field>
        <Field label="Vehicle & party" className="col-span-2">{vehicle}</Field>
        {canAssign ? (
          <div className="col-span-2">
            <label htmlFor="cal-assign" className="flex items-center gap-1.5 text-cal-label font-semibold uppercase text-cal-muted">
              Driver {!b.driverId && <StatusMark state="driver" />}
            </label>
            <select
              id="cal-assign"
              value={b.driverId ?? ""}
              onChange={(e) => onAssign(b.id, e.target.value || null)}
              className={`mt-1 h-9 w-full rounded-cal border bg-cal-sheet px-2 text-cal-sm outline-none focus:border-cal-brass focus-visible:ring-2 focus-visible:ring-cal-brass ${b.driverId ? "border-cal-rule text-cal-ink" : "border-cal-alert/60 text-cal-alert"}`}
            >
              <option value="">Not assigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.kind === "partner" ? " (partner)" : ""}{unavailable.has(d.id) ? " — unavailable this day" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <Field label="Driver">{b.driverId ? b.driver : <span className="text-cal-muted">Not assigned</span>}</Field>
        )}
        <Field label="Fare">{b.fare == null ? <span className="text-cal-muted">TBC</span> : <span className="tabular-nums">{money(b.fare)}</span>}</Field>
        <Field label="Payment">{[b.paymentStatus, b.paymentMethod].filter(Boolean).join(" · ")}</Field>
        <Field label="Booked via">{b.source === "website" ? "Website" : b.source ? b.source[0].toUpperCase() + b.source.slice(1) : null}</Field>
        {b.notes && <Field label="Notes" className="col-span-2"><span className="whitespace-pre-line text-cal-ink2">{b.notes}</span></Field>}
        {b.returnJourney && b.returnDate && (
          <Field label="Return" className="col-span-2">
            <button type="button" onClick={() => onGoToDate(b.returnDate)} className="inline-flex items-center gap-1.5 font-medium text-cal-ink underline decoration-1 underline-offset-2 hover:decoration-2">
              <CornerDownRight className="h-3.5 w-3.5" />
              <span className="tabular-nums">{fmtDate(b.returnDate)}{b.returnTime ? ` ${b.returnTime.slice(0, 5)}` : ""}</span> · show on calendar
            </button>
          </Field>
        )}
      </dl>

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto border-t border-cal-line bg-cal-sheet px-5 pb-5 pt-3.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOpenFull(b)}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-cal bg-cal-ink px-4 text-cal-sm font-semibold text-cal-sheet hover:bg-cal-ink2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass focus-visible:ring-offset-2"
          >
            {b.state === "reply" ? "Accept or decline" : "Open booking"}
            <ArrowUpRight className="h-4 w-4" />
          </button>
          {b.phone && (
            <a
              href={`tel:${b.phone.replace(/\s/g, "")}`}
              aria-label={`Call ${b.customer} on ${b.phone}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-cal border border-cal-rule text-cal-ink hover:bg-cal-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>
        <p className="mt-2 text-cal-xs text-cal-muted">Status, payment, notes and edits are in the booking.</p>
      </div>
    </article>
  );
}
