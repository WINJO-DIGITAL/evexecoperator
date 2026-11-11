"use client";

import { ArrowLeftRight, CalendarX, Clock, MessageSquare, Plane, PoundSterling, UserX } from "lucide-react";
import { STATE_STYLE } from "./tokens";

/** A small square status mark. Hollow = waiting on the office. */
export function StatusMark({ state, className = "" }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.assigned;
  return <span aria-hidden className={`inline-block h-[7px] w-[7px] shrink-0 rounded-[2px] ${s.mark} ${className}`} />;
}

export function StateLabel({ state }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.assigned;
  return (
    <span className={`inline-flex items-center gap-1.5 text-cal-label font-semibold uppercase ${s.text}`}>
      <StatusMark state={state} />
      {s.label}
    </span>
  );
}

// One exception style for every warning: icon + plain sentence + the one
// action that resolves it. Every action opens something that exists (the
// booking, where driver, reply, payment and edits live — or the other job).
const KIND = {
  urgent:      { icon: UserX, action: "Assign driver" },
  driver:      { icon: UserX, action: "Assign driver" },
  clash:       { icon: ArrowLeftRight, action: null }, // "View <ref>", set per flag
  unavailable: { icon: CalendarX, action: "Reassign" },
  reply:       { icon: MessageSquare, action: "Reply" },
  notime:      { icon: Clock, action: "Add time" },
  unpaid:      { icon: PoundSterling, action: "Open payment" },
};

export function ExceptionNote({ flag, onAction }) {
  const kind = KIND[flag.code] ?? { icon: Clock, action: "Open" };
  const Icon = kind.icon;
  const critical = flag.tone === "alert";
  const action = flag.code === "clash" ? `View ${flag.otherId}` : kind.action;
  return (
    <p className={`flex items-start gap-1.5 text-cal-xs ${critical ? "text-cal-alert" : "text-cal-brass-ink"}`}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="min-w-0">
        <span className="font-medium">{flag.label}</span>
        {onAction && action && (
          <>
            {" "}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAction(flag); }}
              className="pointer-events-auto relative z-[2] whitespace-nowrap font-semibold underline decoration-1 underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass"
            >
              {action}
            </button>
          </>
        )}
      </span>
    </p>
  );
}

// List item with an inset hairline above it, aligned to the row's text rather
// than running to the screen edge (rows sit in a -mx-3 list so their hover and
// selection fill can bleed past the gutter).
export const ROW_ITEM = "relative before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:z-[3] before:h-px before:bg-cal-line before:content-[''] first:before:hidden";

const shortPlace = (v) => (v ? String(v).split(",")[0].trim() : null);
const fareText = (n) => `£${n % 1 ? n.toFixed(2) : n}`;

/**
 * One transfer as a schedule row. Order of emphasis: pickup time, passenger,
 * route, driver + flight, exceptions; fare on the right. The whole row opens
 * the booking; exception actions are their own buttons.
 */
export default function BookingRow({ b, onOpen, onAction, selected = false }) {
  const from = shortPlace(b.pickupLocation || b.airport || b.direction);
  const to = shortPlace(b.dropoffAddress || b.airport);
  const quiet = b.state === "done" || b.state === "cancelled";
  const flight = b.flight && b.flight !== "—" ? b.flight : null;

  return (
    <div className={`group relative ${selected ? "bg-cal-well" : "hover:bg-cal-sheet"} ${b.state === "cancelled" ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => onOpen(b)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${b.time === "—" ? "No time" : b.time} ${b.customer}, ${STATE_STYLE[b.state]?.label ?? ""}`}
        className="absolute inset-0 z-[1] w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass"
      />
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 z-[2] w-[3px] bg-cal-ink" />}
      <div className="pointer-events-none relative flex gap-3 px-3 py-2.5">
        <p className={`w-[46px] shrink-0 pt-px text-cal-time font-semibold tabular-nums ${b.minutes == null || quiet ? "text-cal-muted" : "text-cal-ink"} ${b.state === "cancelled" ? "line-through" : ""}`}>
          {b.minutes == null ? "--:--" : b.time}
        </p>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <StatusMark state={b.state} className="relative -top-[2px]" />
            <p className={`min-w-0 flex-1 truncate text-cal-base font-semibold ${quiet ? "text-cal-ink2" : "text-cal-ink"} ${b.state === "cancelled" ? "line-through" : ""}`}>
              {b.customer || b.id}
            </p>
            <span className={`shrink-0 text-cal-sm tabular-nums ${b.fare == null ? "text-cal-muted" : "font-medium text-cal-ink2"}`}>
              {b.fare == null ? "TBC" : fareText(b.fare)}
            </span>
          </div>
          <p className="mt-0.5 text-cal-sm text-cal-ink2 [overflow-wrap:anywhere]">
            {from ?? "—"} <span className="text-cal-faint">→</span> {to ?? "—"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-cal-xs text-cal-muted">
            {b.driverId ? <span>{b.driver}</span> : <span>No driver</span>}
            {flight && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 tabular-nums"><Plane className="h-3 w-3" strokeWidth={2} aria-label="Flight" />{flight}</span>
              </>
            )}
            {!flight && b.isAirport && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Plane className="h-3 w-3" strokeWidth={2} aria-hidden />Airport</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="tabular-nums">{b.id}</span>
          </p>
          {b.flags.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {b.flags.map((f) => <ExceptionNote key={f.code} flag={f} onAction={onAction ? (flag) => onAction(flag, b) : null} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
