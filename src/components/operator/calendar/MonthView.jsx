"use client";

import { useEffect, useRef } from "react";
import { Plane } from "lucide-react";
import { WEEKDAYS_SHORT, addDays, dayOfMonth, longDay } from "@/lib/operator/calendarModel";
import { StatusMark } from "./BookingRow";

const MAX_ROWS = 3;

/**
 * Indicator system (one rule, everywhere):
 *  - the number in a day is how many transfers it has (grey when all are done)
 *  - one exception mark, the most serious only:
 *      CriticalMark  needs a driver, clash, driver unavailable
 *      hollow brass  awaiting reply or other follow-up (unpaid, no time)
 * From lg each day also lists its first jobs with their status marks.
 */
export function CriticalMark({ className = "" }) {
  return (
    <span aria-hidden className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-cal-alert text-[9px] font-bold leading-none text-cal-sheet ${className}`}>
      !
    </span>
  );
}

export function dayExceptions(live) {
  const critical = live.some((b) => b.flags.some((f) => f.tone === "alert"));
  const followUp = !critical && live.some((b) => b.flags.length > 0);
  return { critical, followUp };
}

export default function MonthView({ weeks, monthKey, selected, today, byDate, onSelect, onOpenDay }) {
  const gridRef = useRef(null);
  const focusWanted = useRef(false);

  // After a keyboard move, put focus on the newly selected cell.
  useEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    gridRef.current?.querySelector(`[data-day="${selected}"]`)?.focus();
  }, [selected]);

  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      focusWanted.current = true;
      onSelect(addDays(selected, step));
    } else if (e.key === "Enter" && e.target?.dataset?.day) {
      e.preventDefault();
      onOpenDay(e.target.dataset.day);
    }
  };

  return (
    <div className="mt-3">
      <div className="grid grid-cols-7">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className={`pb-1.5 text-cal-label font-semibold uppercase lg:px-2 text-cal-muted`}>
            <span className="lg:hidden">{d.slice(0, 1)}</span>
            <span className="hidden lg:inline">{d}</span>
          </div>
        ))}
      </div>

      <div ref={gridRef} role="grid" aria-label="Month" onKeyDown={onKeyDown} className="grid grid-cols-7 border-b border-cal-line">
        {weeks.flat().map((key, i) => {
          const list = byDate.get(key) ?? [];
          const live = list.filter((b) => b.state !== "cancelled");
          const allDone = live.length > 0 && live.every((b) => b.state === "done");
          const { critical, followUp } = dayExceptions(live);
          const inMonth = key.slice(0, 7) === monthKey.slice(0, 7);
          const isSel = key === selected;
          const isToday = key === today;
          const label = [
            `${longDay(key)}${isToday ? ", today" : ""}`,
            live.length ? `${live.length} transfer${live.length === 1 ? "" : "s"}` : "no transfers",
            critical && "needs action",
            followUp && "follow-up needed",
          ].filter(Boolean).join(", ");

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-day={key}
              tabIndex={isSel ? 0 : -1}
              aria-selected={isSel}
              aria-label={label}
              onClick={() => onSelect(key)}
              onDoubleClick={() => onOpenDay(key)}
              className={`group relative flex h-14 min-w-0 flex-col border-t border-cal-line px-0.5 pb-1.5 pt-1.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass sm:h-16 lg:h-[112px] lg:px-2 lg:pt-2 ${
                i % 7 ? "lg:border-l" : ""
              } ${isSel ? "lg:bg-cal-well/60" : "hover:bg-cal-sheet"}`}
            >
              <span className="flex items-start justify-between gap-1">
                <span
                  className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-cal px-1 text-cal-sm font-semibold tabular-nums ${
                    isSel ? "bg-cal-ink text-cal-sheet" : isToday ? "text-cal-brass-ink" : inMonth ? "text-cal-ink" : "text-cal-faint"
                  } -ml-1 lg:ml-[-4px]`}
                >
                  {dayOfMonth(key)}
                  {isToday && <span aria-hidden className="absolute -bottom-[3px] left-1 right-1 h-[2px] bg-cal-brass" />}
                </span>
                {/* Exception mark — phones put it bottom-right, desktop top-right */}
                <span className="hidden lg:block">
                  {critical ? <CriticalMark className="mt-1" /> : followUp ? <StatusMark state="reply" className="mt-1.5" /> : null}
                </span>
              </span>

              {/* Phones / tablets: count + one mark */}
              {live.length > 0 && (
                <span className="mt-auto flex items-center gap-1 pl-0.5 lg:hidden">
                  <span className={`text-cal-xs font-semibold tabular-nums ${allDone || !inMonth ? "text-cal-muted" : "text-cal-ink2"}`}>{live.length}</span>
                  {critical ? <CriticalMark /> : followUp ? <StatusMark state="reply" /> : null}
                </span>
              )}

              {/* Desktop: first jobs by time */}
              {live.length > 0 && (
                <span className="mt-1.5 hidden min-w-0 flex-col gap-[3px] lg:flex">
                  {live.slice(0, MAX_ROWS).map((b) => (
                    <span key={b.id} className="flex min-w-0 items-center gap-1.5 text-cal-xs">
                      <StatusMark state={b.state} />
                      <span className={`shrink-0 font-semibold tabular-nums ${b.state === "done" ? "text-cal-muted" : "text-cal-ink"}`}>{b.minutes == null ? "--:--" : b.time}</span>
                      <span className={`min-w-0 truncate ${b.state === "done" ? "text-cal-muted" : "text-cal-ink2"}`}>{(b.customer || "").split(" ").slice(-1)[0]}</span>
                      {b.isAirport && <Plane aria-label="airport" className="h-3 w-3 shrink-0 text-cal-faint" strokeWidth={2} />}
                    </span>
                  ))}
                  {live.length > MAX_ROWS && <span className="pl-3.5 text-cal-xs text-cal-muted">+{live.length - MAX_ROWS} more</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-cal-xs text-cal-muted">
      <span className="inline-flex items-center gap-1.5 lg:hidden"><span className="font-semibold tabular-nums text-cal-ink2">3</span>transfers</span>
      <span className="inline-flex items-center gap-1.5"><CriticalMark />Needs a driver or clashes</span>
      <span className="inline-flex items-center gap-1.5"><StatusMark state="reply" />Awaiting reply or follow-up</span>
      <span className="hidden items-center gap-1.5 lg:inline-flex"><StatusMark state="assigned" />Assigned</span>
      <span className="hidden items-center gap-1.5 lg:inline-flex"><StatusMark state="road" />On the road</span>
      <span className="hidden items-center gap-1.5 lg:inline-flex"><StatusMark state="done" />Completed</span>
      <span className="hidden items-center gap-1.5 lg:inline-flex"><Plane className="h-3 w-3" strokeWidth={2} />Airport</span>
    </div>
  );
}
