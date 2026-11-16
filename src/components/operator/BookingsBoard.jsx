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

function Card({ b, today, onOpen }) {
  return (
    <button
      onClick={() => onOpen(b)}
      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-amber-300"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#0F1B33]">
          {b.time}
          {b.travelDate && b.travelDate !== today && <span className="ml-1.5 text-xs font-normal text-slate-500">{fmtDate(b.travelDate)}</span>}
        </p>
        <span className="text-xs font-medium text-amber-600">{b.price}</span>
      </div>
      <p className="mt-1 truncate text-sm text-[#0F1B33]">{b.customer}</p>
      <p className="truncate text-xs text-slate-500">{b.route}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`truncate text-[11px] ${b.driverId ? "text-slate-500" : "text-red-600"}`}>{b.driverId ? b.driver : "No driver"}</span>
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
      <p className="mb-3 mt-3 text-xs text-slate-500">
        {fmtDate(today)} to {fmtDate(until)}. Jobs on the road and requests awaiting a reply are shown whatever their date.
      </p>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {COLUMNS.map((c) => (
          <section key={c.key} className="w-[78vw] max-w-[300px] flex-shrink-0 snap-start rounded-3xl bg-slate-100/70 p-2 sm:w-72 lg:w-auto lg:max-w-none">
            <div className="flex items-center gap-2 px-2 pb-2 pt-1">
              <span className={`h-2 w-2 rounded-full ${c.accent}`} />
              <h3 className="flex-1 text-sm font-semibold text-[#0F1B33]">{c.title}</h3>
              <span className="text-xs text-slate-500">{columns[c.key].length}</span>
            </div>
            <p className="px-2 pb-2 text-[11px] text-slate-500">{c.hint}</p>
            <div className="space-y-2">
              {loading && bookings.length === 0 ? (
                <div className="h-20 animate-pulse rounded-2xl bg-white/70" />
              ) : columns[c.key].length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">Nothing here</p>
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
