"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ChevronRight, CreditCard, MessageSquareReply, UserX, Flag,
} from "lucide-react";
import { useBookings, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { useBookingDrawer } from "@/components/operator/useBookingDrawer";
import { useOperator } from "@/components/operator/OperatorContext";
import { fmtDate } from "@/lib/dates";
import StatusChip from "@/components/operator/StatusChip";
import SetupChecklist from "@/components/operator/SetupChecklist";
import TextsToSend from "@/components/operator/TextsToSend";
import { DONE_STATUSES as DONE, ON_ROAD_STATUSES, awaitingReply, needsDriver, unpaidCompleted, minutesUntil } from "@/lib/operator/bookingBuckets";

// Home screen: what needs the office now, today's jobs in time order, and
// where each driver is in their day. Every row opens the booking drawer.

// A figure and what it counts. Colour only appears when the number needs action.
function Tile({ label, sub, value, alert, href }) {
  const body = (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${alert && value > 0 ? "text-red-600" : "text-[#0F1B33]"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:opacity-80">{body}</Link> : body;
}

function BookingRow({ b, onOpen, aside }) {
  return (
    <button
      onClick={() => onOpen(b)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5"
    >
      <div className="w-14 flex-shrink-0 text-center">
        <p className="text-sm font-semibold text-[#0F1B33]">{b.time}</p>
        {b.travelDate && b.travelDate !== ukDateDaysAgo(0) && (
          <p className="text-[10px] text-slate-500">{fmtDate(b.travelDate).slice(0, 5)}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#0F1B33]">{b.customer}</p>
        <p className="truncate text-xs text-slate-500">{b.route}</p>
        {/* Phones: status/driver under the customer so the row never overflows */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:hidden">{aside}</div>
      </div>
      <div className="hidden flex-shrink-0 flex-col items-end gap-1 sm:flex">{aside}</div>
      <ChevronRight className="hidden h-4 w-4 flex-shrink-0 text-slate-300 sm:block" />
    </button>
  );
}

export default function TodayPage() {
  const api = useBookings();
  const { bookings, loading, error } = api;
  const { drivers } = useDrivers();
  const drawer = useBookingDrawer(api, drivers);
  const { inbox } = useOperator();

  const today = ukDateDaysAgo(0);
  // "Now" moves on every minute so the 48 h window stays right on a screen left open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const view = useMemo(() => {
    const todays = bookings
      .filter((b) => b.travelDate === today && b.status !== "Cancelled")
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const reply = bookings.filter(awaitingReply);
    const noDriver = bookings.filter((b) => {
      if (!needsDriver(b)) return false;
      const m = minutesUntil(b, now);
      return m != null && m > -60 && m <= 48 * 60;
    });
    const unpaid = bookings.filter(unpaidCompleted);
    // Partner jobs (no Driver App) are only marked Completed by the office. Past ones still
    // on Dispatched or on the road are listed so they don't pile up unmarked.
    const partnerIds = new Set(drivers.filter((d) => d.kind === "partner").map((d) => d.id));
    const unfinished = bookings.filter((b) =>
      partnerIds.has(b.driverId) && b.travelDate && b.travelDate < today
      && (b.status === "Dispatched" || ON_ROAD_STATUSES.includes(b.status)));
    const needs = [
      ...reply.map((b) => ({ b, kind: "reply" })),
      ...noDriver.map((b) => ({ b, kind: "driver" })),
      ...unpaid.map((b) => ({ b, kind: "unpaid" })),
      ...unfinished.map((b) => ({ b, kind: "finish" })),
    ];

    const driverDay = drivers.map((d) => {
      const jobs = todays.filter((b) => b.driverId === d.id);
      const live = jobs.find((b) => ON_ROAD_STATUSES.includes(b.status));
      const next = jobs.find((b) => !DONE.includes(b.status) && (minutesUntil(b, now) ?? -1) >= -30);
      return { d, jobs, live, next };
    });

    const revenue = todays.reduce((s, b) => s + (Number(String(b.price).replace(/[^0-9.]/g, "")) || 0), 0);
    return { todays, needs, reply, noDriver, unpaid, driverDay, revenue };
  }, [bookings, drivers, today, now]);

  const KIND = {
    reply: { label: "Accept or decline", icon: MessageSquareReply, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    driver: { label: "No driver", icon: UserX, cls: "bg-red-50 text-red-700 border-red-200" },
    unpaid: { label: "Unpaid", icon: CreditCard, cls: "bg-violet-50 text-violet-700 border-violet-200" },
    finish: { label: "Mark completed", icon: Flag, cls: "bg-slate-100 text-slate-700 border-slate-300" },
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 lg:px-10 lg:py-8">
      {drawer.element}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Couldn&apos;t load bookings: {error}</div>
      )}

      <SetupChecklist drivers={drivers} hasBookings={api.totalCount > 0 || bookings.length > 0} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile label="Jobs today" sub={view.revenue ? `£${view.revenue.toLocaleString("en-GB")}` : undefined} value={view.todays.length} href="/operator/bookings" />
        <Tile label="To reply to" value={view.reply.length} />
        <Tile label="Need a driver" sub="next 48 hours" value={view.noDriver.length} alert />
        <Tile label="Inbox" value={inbox.count} href="/operator/inbox" />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-span-2">
          <TextsToSend />
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[#0F1B33]">Needs you</h2>
              {view.needs.length > 0 && <span className="text-xs font-medium text-red-600">{view.needs.length}</span>}
            </div>
            {loading && bookings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
            ) : view.needs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Nothing needs you right now.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {view.needs.map(({ b, kind }) => {
                  const k = KIND[kind];
                  return (
                    <BookingRow
                      key={`${kind}-${b.id}`}
                      b={b}
                      onOpen={drawer.open}
                      aside={<span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${k.cls}`}><k.icon className="h-3 w-3" />{k.label}</span>}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[#0F1B33]">Today <span className="font-normal text-slate-500">· {fmtDate(today)}</span></h2>
              <Link href="/operator/bookings" className="text-xs font-medium text-amber-600 hover:underline">All bookings</Link>
            </div>
            {view.todays.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{loading ? "Loading…" : "No pickups today."}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {view.todays.map((b) => (
                  <BookingRow
                    key={b.id}
                    b={b}
                    onOpen={drawer.open}
                    aside={<>
                      <StatusChip status={b.status} />
                      <span className={`text-[11px] ${b.driverId ? "text-slate-500" : "font-medium text-red-600"}`}>{b.driverId ? b.driver : "No driver"}</span>
                    </>}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card h-fit min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-[#0F1B33]">Drivers</h2>
            <Link href="/operator/drivers" className="text-xs font-medium text-amber-600 hover:underline">Manage</Link>
          </div>
          {view.driverDay.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No drivers yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {view.driverDay.filter(({ jobs }) => jobs.length > 0).map(({ d, jobs, live, next }) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${live ? "bg-blue-500" : next ? "bg-amber-400" : "bg-emerald-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F1B33]">{d.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {live ? `${live.status} · ${live.customer}` : next ? `Next ${next.time} · ${next.customer}` : jobs.length ? "Done for today" : "No jobs today"}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-500">{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
          {view.driverDay.some(({ jobs }) => jobs.length === 0) && (
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 first:border-t-0 sm:px-5">
              Free today: {new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(view.driverDay.filter(({ jobs }) => jobs.length === 0).map(({ d }) => d.name))}
            </p>
          )}
          {view.noDriver.length > 0 && (
            <p className="flex items-center gap-2 border-t border-slate-100 bg-red-50/50 px-4 py-3 text-xs text-red-700 sm:px-5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {view.noDriver.length} job{view.noDriver.length === 1 ? "" : "s"} in the next 48 hours still need a driver.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
