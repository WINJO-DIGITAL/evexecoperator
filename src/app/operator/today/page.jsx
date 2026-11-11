"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, CheckCircle2, ChevronRight, Clock, CreditCard, Inbox, MessageSquareReply, UserX,
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

function Tile({ icon: Icon, label, sub, value, tone, href }) {
  const body = (
    <div className="card flex items-center gap-3 p-4 sm:p-5">
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none text-[#0F1B33]">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{label}{sub && <span className="hidden sm:inline"> · {sub}</span>}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
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
    const needs = [
      ...reply.map((b) => ({ b, kind: "reply" })),
      ...noDriver.map((b) => ({ b, kind: "driver" })),
      ...unpaid.map((b) => ({ b, kind: "unpaid" })),
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
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 lg:px-10 lg:py-8">
      {drawer.element}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Couldn&apos;t load bookings: {error}</div>
      )}

      <SetupChecklist drivers={drivers} hasBookings={api.totalCount > 0 || bookings.length > 0} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile icon={Clock} label="Jobs today" sub={`£${view.revenue.toLocaleString("en-GB")}`} value={view.todays.length} tone="bg-amber-50 text-amber-600" href="/operator/bookings" />
        <Tile icon={MessageSquareReply} label="To reply to" value={view.reply.length} tone="bg-amber-50 text-amber-600" />
        <Tile icon={UserX} label="Need a driver" sub="next 48h" value={view.noDriver.length} tone="bg-red-50 text-red-600" />
        <Tile icon={Inbox} label="Inbox" value={inbox.count} tone="bg-slate-100 text-slate-600" href="/operator/inbox" />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-span-2">
          <TextsToSend />
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-[#0F1B33]">Needs you</h2>
              <span className="text-xs text-slate-500">{view.needs.length}</span>
            </div>
            {loading && bookings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : view.needs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <p className="text-sm font-medium text-[#0F1B33]">All clear</p>
                <p className="text-xs text-slate-500">No requests to answer, no jobs without a driver, nothing unpaid.</p>
              </div>
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
              <h2 className="text-base font-semibold text-[#0F1B33]">Today · {fmtDate(today)}</h2>
              <Link href="/operator/bookings" className="text-xs font-medium text-amber-600 hover:underline">All bookings</Link>
            </div>
            {view.todays.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">{loading ? "Loading…" : "No pickups today."}</p>
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
            <h2 className="text-base font-semibold text-[#0F1B33]">Drivers today</h2>
            <Link href="/operator/drivers" className="text-xs font-medium text-amber-600 hover:underline">Drivers</Link>
          </div>
          {view.driverDay.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No drivers yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {view.driverDay.map(({ d, jobs, live, next }) => (
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
