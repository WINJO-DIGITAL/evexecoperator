"use client";

import { useMemo } from "react";
import { useBookings, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { useBookingDrawer } from "@/components/operator/useBookingDrawer";
import { boardColumn } from "@/lib/operator/bookingBuckets";
import { fmtDate } from "@/lib/dates";
import StatusChip from "@/components/operator/StatusChip";

// Bookings → Board: the next BOARD_DAYS days (plus anything on the road) as
// columns by where each job stands. Cards open the shared booking drawer.
const BOARD_DAYS = 7;

const COLUMNS = [
  { key: "reply", title: "Needs reply", hint: "Website requests to accept or decline", accent: "bg-amber-400" },
  { key: "driver", title: "Needs driver", hint: "Confirmed, no driver yet", accent: "bg-red-400" },
  { key: "assigned", title: "Driver assigned", hint: "Ready to go", accent: "bg-slate-400" },
  { key: "road", title: "On the road", hint: "En route, arrived, on board", accent: "bg-blue-500" },
  { key: "done", title: "Done today", hint: "Completed or no-show today", accent: "bg-emerald-500" },
];

// One job: time and price on top, then the customer, route, driver and status.
function Card({ b, today, onOpen }) {
  return (
    <button
      onClick={() => onOpen(b)}
      className="group block w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-left transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold tabular-nums text-[#0F1B33]">
          {b.time}
          {b.travelDate && b.travelDate !== today && <span className="ml-1.5 text-xs font-normal text-slate-500">{fmtDate(b.travelDate)}</span>}
        </p>
        <span className={`text-sm font-semibold ${b.price === "TBC" ? "text-xs font-medium text-slate-400" : "text-[#0F1B33]"}`}>{b.price}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-[#0F1B33]">{b.customer}</p>
      <p className="truncate text-xs text-slate-500">{b.route}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className={`min-w-0 truncate text-xs ${b.driverId ? "text-slate-600" : "font-medium text-red-600"}`}>{b.driverId ? b.driver : "No driver"}</span>
        <StatusChip status={b.status} />
      </div>
    </button>
  );
}

export default function BookingsBoard() {
  const api = useBookings();
  const { bookings, loading, error } = api;
  const { drivers } = useDrivers();
  const drawer = useBookingDrawer(api, drivers);
  const today = ukDateDaysAgo(0);
  const until = ukDateDaysAgo(-BOARD_DAYS);

  const columns = useMemo(() => {
    const by = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));
    for (const b of bookings) {
      const col = boardColumn(b, today);
      if (!col) continue;
      // Upcoming window only, except jobs already on the road or awaiting a
      // reply (those need attention whatever their date).
      const inWindow = b.travelDate && b.travelDate >= today && b.travelDate <= until;
      if (!inWindow && col !== "road" && col !== "reply") continue;
      by[col].push(b);
    }
    for (const k of Object.keys(by)) {
      by[k].sort((a, b) => `${a.travelDate ?? ""}${a.time ?? ""}`.localeCompare(`${b.travelDate ?? ""}${b.time ?? ""}`));
    }
    return by;
  }, [bookings, today, until]);

  return (
    <div className="px-4 pb-24 sm:px-6 sm:pb-8 lg:px-10">
      {drawer.element}
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Couldn&apos;t load bookings: {error}</div>}
      <p className="mb-4 mt-4 text-xs text-slate-500">
        {fmtDate(today)} to {fmtDate(until)}. Jobs on the road and requests awaiting a reply are shown whatever their date.
      </p>
      {/* Five columns side by side on wide screens; on tablets and phones they
          scroll sideways at a width that keeps names and status readable. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {COLUMNS.map((c) => (
          <section key={c.key} className="flex min-w-[280px] max-w-[320px] flex-shrink-0 snap-start flex-col rounded-2xl bg-[#EEF0F3]/70 p-2.5 xl:min-w-0 xl:max-w-none">
            <header className="flex items-center gap-2 px-1.5 pb-1 pt-1">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${c.accent}`} aria-hidden="true" />
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F1B33]">{c.title}</h3>
              <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{columns[c.key].length}</span>
            </header>
            <p className="px-1.5 pb-3 text-xs text-slate-500">{c.hint}</p>
            <div className="flex flex-col gap-2">
              {loading && bookings.length === 0 ? (
                <div className="h-20 animate-pulse rounded-xl bg-white/70" />
              ) : columns[c.key].length === 0 ? (
                <p className="px-1.5 py-6 text-center text-xs text-slate-400">None</p>
              ) : (
                columns[c.key].map((b) => <Card key={b.id} b={b} today={today} onOpen={drawer.open} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
