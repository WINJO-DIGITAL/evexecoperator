"use client";

import { ArrowRight, Plus } from "lucide-react";
import { driverLoad, formatGap, gapBefore, longDay } from "@/lib/operator/calendarModel";
import BookingRow, { ROW_ITEM } from "./BookingRow";

const GAP_SHOWN_FROM = 120; // minutes between pickups worth pointing out

/**
 * One day's transfers as a working schedule. `compact` is the version under
 * the month grid and in the side panel; the full Day view adds drivers' load
 * and the free time between pickups. `hideTitle` when the page heading
 * already names the day.
 */
export default function DaySchedule({
  date, today, bookings, selectedId, onOpen, onAction, onNewBooking, onOpenDay,
  compact = false, hideTitle = false, emptyHint,
}) {
  const live = bookings.filter((b) => b.state !== "cancelled");
  const timed = bookings.filter((b) => b.minutes != null);
  const untimed = bookings.filter((b) => b.minutes == null);
  const isToday = date === today;
  const isPastDay = date < today;
  const load = compact ? null : driverLoad(bookings);
  const first = live.find((b) => b.minutes != null);
  const last = [...live].reverse().find((b) => b.minutes != null);
  const noDriver = live.filter((b) => b.state === "driver" && !b.past).length;

  const row = (b) => <BookingRow b={b} onOpen={onOpen} onAction={onAction} selected={b.id === selectedId} />;

  return (
    <section aria-label={longDay(date)}>
      <header className="border-b border-cal-line pb-2">
        {!hideTitle && (
          <h3 className="font-display text-cal-lg font-medium text-cal-ink">
            {isToday ? "Today" : longDay(date).split(" ")[0]}
            <span className="ml-2 font-sans text-cal-sm font-normal tabular-nums text-cal-muted">{longDay(date).split(" ")[1]}</span>
          </h3>
        )}
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 pt-2 text-cal-xs text-cal-muted">
            <span className="tabular-nums">{live.length ? `${live.length} transfer${live.length === 1 ? "" : "s"}` : "No transfers"}</span>
            {first && last && first !== last && <span className="whitespace-nowrap tabular-nums"> · {first.time}–{last.time}</span>}
            {noDriver > 0 && <span className="whitespace-nowrap font-medium text-cal-alert"> · {noDriver} without driver</span>}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {onOpenDay && (
              <button type="button" onClick={() => onOpenDay(date)} className="inline-flex h-8 items-center gap-1 rounded-cal px-2 text-cal-xs font-semibold text-cal-ink hover:bg-cal-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass">
                Day view <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            {!isPastDay && (
              <button type="button" onClick={() => onNewBooking(date)} className="inline-flex h-8 items-center gap-1 rounded-cal px-2 text-cal-xs font-semibold text-cal-brass-ink hover:bg-cal-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass" aria-label={`New booking on ${longDay(date)}`}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New booking
              </button>
            )}
          </div>
        </div>
      </header>

      {load && load.drivers.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-cal-line py-2 text-cal-xs">
          {load.drivers.map((d) => (
            <span key={d.id} className="text-cal-muted">
              <span className="font-semibold text-cal-ink">{d.name}</span>{" "}
              <span className="tabular-nums">{d.jobs.map((j) => j.time).filter((t) => t !== "—").join(" · ")}</span>
            </span>
          ))}
        </div>
      )}

      {bookings.length === 0 ? (
        <p className="py-8 text-center text-cal-sm text-cal-muted">{emptyHint ?? (isPastDay ? "Nothing was booked for this day." : "Nothing booked yet.")}</p>
      ) : (
        <ol className="-mx-3">
          {timed.map((b, i) => {
            const gap = compact ? null : gapBefore(timed, i);
            return (
              <li key={b.id} className={`${ROW_ITEM} ${gap != null && gap >= GAP_SHOWN_FROM ? "before:hidden" : ""}`}>
                {gap != null && gap >= GAP_SHOWN_FROM && (
                  <p className="flex items-center gap-2 px-3 py-1 text-cal-xs tabular-nums text-cal-muted">
                    <span className="h-px flex-1 bg-cal-line" />
                    {formatGap(gap)} between pickups
                    <span className="h-px flex-1 bg-cal-line" />
                  </p>
                )}
                {row(b)}
              </li>
            );
          })}
          {untimed.length > 0 && (
            <li className={ROW_ITEM}>
              <p className="px-3 pb-1 pt-3 text-cal-label font-semibold uppercase text-cal-muted">No pickup time</p>
              <ol>
                {untimed.map((b) => <li key={b.id} className={ROW_ITEM}>{row(b)}</li>)}
              </ol>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
