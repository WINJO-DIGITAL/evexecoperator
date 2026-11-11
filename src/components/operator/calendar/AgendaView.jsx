"use client";

import { dayOfMonth, eachDay, weekdayLong } from "@/lib/operator/calendarModel";
import BookingRow, { ROW_ITEM } from "./BookingRow";

/** The period's days that have work, as one continuous schedule. */
export default function AgendaView({ period, today, byDate, selectedId, onOpen, onAction, onOpenDay, emptyText }) {
  const days = eachDay(period.start, period.end).filter((k) => (byDate.get(k) ?? []).length > 0);

  if (!days.length) {
    return <p className="py-14 text-center text-cal-sm text-cal-muted">{emptyText}</p>;
  }

  return (
    <div className="mt-1">
      {days.map((key) => {
        const list = byDate.get(key);
        const live = list.filter((b) => b.state !== "cancelled").length;
        const tone = key === today ? "text-cal-brass-ink" : key < today ? "text-cal-muted" : "text-cal-ink";
        return (
          <section key={key}>
            <button
              type="button"
              onClick={() => onOpenDay(key)}
              className="sticky top-0 z-[3] flex h-11 w-full items-center justify-between border-b border-cal-line bg-cal-paper text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cal-brass"
            >
              <span className={`font-display text-cal-lg font-medium ${tone}`}>
                {weekdayLong(key)} <span className="tabular-nums">{dayOfMonth(key)}</span>
                {key === today && <span className="ml-1.5 font-sans text-cal-label font-semibold uppercase">Today</span>}
              </span>
              <span className="text-cal-xs tabular-nums text-cal-muted">{live} transfer{live === 1 ? "" : "s"}</span>
            </button>
            <ol className="-mx-3 pb-2">
              {list.map((b) => <li key={b.id} className={ROW_ITEM}><BookingRow b={b} onOpen={onOpen} onAction={onAction} selected={b.id === selectedId} /></li>)}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
