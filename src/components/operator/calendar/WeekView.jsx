"use client";

import { eachDay, weekdayShort, dayOfMonth } from "@/lib/operator/calendarModel";
import BookingRow, { ROW_ITEM, StatusMark } from "./BookingRow";
import { CriticalMark, dayExceptions } from "./MonthView";

const shortPlace = (v) => (v ? String(v).split(",")[0].trim() : "—");

/**
 * Seven days by pickup time. From lg: seven hairline columns of job tiles.
 * Phones: the days stacked as schedule rows; empty days fold to one line.
 */
export default function WeekView({ period, today, selected, byDate, selectedId, onOpen, onAction, onSelectDay, onOpenDay }) {
  const days = eachDay(period.start, period.end);

  return (
    <div className="mt-3">
      {/* Desktop columns */}
      <div className="hidden border-b border-cal-line lg:grid lg:grid-cols-7">
        {days.map((key, i) => {
          const list = byDate.get(key) ?? [];
          const live = list.filter((b) => b.state !== "cancelled");
          const { critical, followUp } = dayExceptions(live);
          const isToday = key === today;
          const isSel = key === selected;
          return (
            <section key={key} className={`flex min-h-[440px] min-w-0 flex-col border-t border-cal-line ${i ? "border-l" : ""} ${isSel ? "bg-cal-well/60" : ""}`}>
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                onDoubleClick={() => onOpenDay(key)}
                aria-pressed={isSel}
                className="flex items-start justify-between border-b border-cal-line px-2.5 pb-2 pt-2 text-left hover:bg-cal-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass"
              >
                <span>
                  <span className={`block text-cal-label font-semibold uppercase ${isToday ? "text-cal-brass-ink" : "text-cal-muted"}`}>{weekdayShort(key)}{isToday ? " · Today" : ""}</span>
                  <span className={`mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-cal px-1 font-display text-cal-xl tabular-nums -ml-1 ${isSel ? "bg-cal-ink text-cal-sheet" : isToday ? "text-cal-brass-ink" : "text-cal-ink"}`}>
                    {dayOfMonth(key)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 pt-0.5 text-cal-xs tabular-nums text-cal-muted">
                  {live.length || ""}
                  {critical ? <CriticalMark /> : followUp ? <StatusMark state="reply" /> : null}
                </span>
              </button>
              <div className="flex flex-1 flex-col divide-y divide-cal-line">
                {list.map((b) => {
                  const critical = b.flags.some((f) => f.tone === "alert");
                  const quiet = b.state === "done" || b.state === "cancelled";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b)}
                      aria-current={b.id === selectedId ? "true" : undefined}
                      className={`relative px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass ${
                        b.id === selectedId ? "bg-cal-well" : "hover:bg-cal-sheet"
                      } ${b.state === "cancelled" ? "opacity-55" : ""}`}
                    >
                      {b.id === selectedId && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-cal-ink" />}
                      <span className="flex items-center gap-1.5">
                        <StatusMark state={b.state} />
                        <span className={`text-cal-sm font-semibold tabular-nums ${quiet ? "text-cal-muted" : "text-cal-ink"}`}>{b.minutes == null ? "--:--" : b.time}</span>
                        <span className="ml-auto">{critical ? <CriticalMark /> : b.flags.length ? <StatusMark state="reply" /> : null}</span>
                      </span>
                      <span className={`mt-1 block truncate text-cal-sm font-medium ${quiet ? "text-cal-ink2" : "text-cal-ink"}`}>{b.customer}</span>
                      <span className="block truncate text-cal-xs text-cal-ink2">→ {shortPlace(b.dropoffAddress || b.airport)}</span>
                      <span className={`block truncate text-cal-xs ${b.driverId ? "text-cal-muted" : "font-medium text-cal-alert"}`}>{b.driverId ? b.driver : "No driver"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Phones / tablets: stacked days */}
      <div className="lg:hidden">
        {days.map((key) => {
          const list = byDate.get(key) ?? [];
          const live = list.filter((b) => b.state !== "cancelled");
          const isToday = key === today;
          return (
            <section key={key} className="border-b border-cal-line">
              <button
                type="button"
                onClick={() => onOpenDay(key)}
                className="flex h-11 w-full items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass"
              >
                <span className={`text-cal-sm font-semibold ${isToday ? "text-cal-brass-ink" : list.length ? "text-cal-ink" : "text-cal-muted"}`}>
                  {weekdayShort(key)} <span className="tabular-nums">{dayOfMonth(key)}</span>{isToday ? " · Today" : ""}
                </span>
                <span className="text-cal-xs tabular-nums text-cal-muted">
                  {live.length ? `${live.length} transfer${live.length === 1 ? "" : "s"}` : "None"}
                </span>
              </button>
              {list.length > 0 && (
                <ol className="border-t border-cal-line">
                  {list.map((b) => <li key={b.id} className={`-mx-3 ${ROW_ITEM}`}><BookingRow b={b} onOpen={onOpen} onAction={onAction} selected={b.id === selectedId} /></li>)}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
