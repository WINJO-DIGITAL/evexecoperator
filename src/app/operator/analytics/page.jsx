"use client";

import React, { useMemo, useState } from "react";
import { TrendingUp, Repeat, PoundSterling, Users, Calendar, Trophy, PieChart, CheckCircle2 } from "lucide-react";
import { useBookings, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { ukDateOf, ukHourOf } from "@/lib/dates";
import { useDrivers } from "@/hooks/operator/useDrivers";

const PERIODS = ["Today", "7 Days", "30 Days", "All Time"];

function BarChart({ bars }) {
  const max = Math.max(...bars.map((d) => d.value), 1);
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {bars.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-lg bg-amber-400/20 transition-all duration-500 hover:bg-amber-400/40"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? "4px" : "0" }}
            title={`£${d.value.toLocaleString()} — ${d.bookings} booking${d.bookings !== 1 ? "s" : ""}`}
          />
          <span className="text-[9px] text-slate-600 sm:text-[10px]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  "Completed":                  { bar: "bg-emerald-400", text: "text-emerald-600" },
  "Dispatched":                 { bar: "bg-amber-400",   text: "text-amber-600"   },
  "En Route":                   { bar: "bg-blue-400",    text: "text-blue-600"    },
  "Passenger On Board":         { bar: "bg-purple-400",  text: "text-purple-300"  },
  "Unassigned":                 { bar: "bg-slate-500",   text: "text-slate-500"   },
  "Cancelled":                  { bar: "bg-red-500",     text: "text-red-600"     },
  "Unassigned / Missed Call Recovery": { bar: "bg-orange-500", text: "text-orange-600" },
};

export default function Analytics() {
  const [period, setPeriod] = useState("7 Days");
  const { bookings } = useBookings({ scope: "all" });
  const { drivers } = useDrivers();

  const parsePrice = (b) => parseFloat(String(b.price).replace("£", "")) || 0;

  // ── Build live "Today" data from real bookings ──────────────────────────────
  const todayData = useMemo(() => {
    const today = ukDateDaysAgo(0);
    const todayBookings = bookings.filter((b) => b.pickupTime && (b.travelDate || ukDateOf(b.pickupTime)) === today);

    const completedRevenue = todayBookings
      .filter((b) => b.status === "Completed")
      .reduce((acc, b) => acc + parsePrice(b), 0);

    const windows = [
      { label: "06:00", start: 6, end: 9 },
      { label: "09:00", start: 9, end: 12 },
      { label: "12:00", start: 12, end: 15 },
      { label: "15:00", start: 15, end: 18 },
      { label: "18:00", start: 18, end: 21 },
      { label: "21:00", start: 21, end: 24 },
    ];

    const bars = windows.map(({ label, start, end }) => {
      const windowBookings = todayBookings.filter((b) => {
        const h = ukHourOf(b.pickupTime);
        return h >= start && h < end;
      });
      const revenue = windowBookings.reduce((acc, b) => acc + parsePrice(b), 0);
      return { label, value: revenue, bookings: windowBookings.length };
    });

    const co2kg = Math.round(todayBookings.length * 7.3);

    return {
      bars,
      totalRevenue: completedRevenue,
      totalBookings: todayBookings.length,
      newCustomers: new Set(todayBookings.map((b) => b.phone || b.customer)).size,
      co2: `${co2kg}kg`,
      subRevenue: "Live today",
      peakDay: bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0] ?? { label: "—", value: 0 }),
    };
  }, [bookings]);

  // ── Build real data for 7 Days / 30 Days / All Time from actual bookings ────
  const liveData = useMemo(() => {
    const now = new Date();

    function buildBars(buckets) {
      return buckets.map(({ label, start, end }) => {
        const subset = bookings.filter((b) => {
          if (!b.pickupTime) return false;
          const t = new Date(b.pickupTime).getTime();
          return t >= start && t < end;
        });
        return {
          label,
          value: subset.reduce((acc, b) => acc + parsePrice(b), 0),
          bookings: subset.length,
        };
      });
    }

    function periodStats(periodBookings, subRevenue) {
      const co2kg = Math.round(periodBookings.length * 7.3);
      const uniqueCustomers = new Set(
        periodBookings.map((b) => b.phone || b.customer)
      ).size;
      return {
        newCustomers: uniqueCustomers,
        co2: co2kg > 0 ? `${co2kg.toLocaleString()}kg` : "0kg",
        subRevenue,
      };
    }

    // 7 Days: last 7 calendar days
    const sevenDayBuckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      return {
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        start: d.getTime(),
        end: end.getTime(),
      };
    });

    // 30 Days: 4 rolling weeks, most recent = Wk 4
    const thirtyDayBuckets = Array.from({ length: 4 }, (_, i) => {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      weekEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      return {
        label: `Wk ${4 - i}`,
        start: weekStart.getTime(),
        end: weekEnd.getTime() + 1,
      };
    }).reverse();

    // All Time: last 6 calendar months
    const allTimeBuckets = Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i;
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      return {
        // House date style: numbers only, no month names (MM/YYYY).
        label: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
        start: d.getTime(),
        end: end.getTime(),
      };
    });

    const sevenStart = sevenDayBuckets[0].start;
    const thirtyStart = thirtyDayBuckets[0].start;

    const sevenDayBookings = bookings.filter(
      (b) => b.pickupTime && new Date(b.pickupTime).getTime() >= sevenStart
    );
    const thirtyDayBookings = bookings.filter(
      (b) => b.pickupTime && new Date(b.pickupTime).getTime() >= thirtyStart
    );

    return {
      "7 Days": {
        bars: buildBars(sevenDayBuckets),
        ...periodStats(sevenDayBookings, "Last 7 days"),
      },
      "30 Days": {
        bars: buildBars(thirtyDayBuckets),
        ...periodStats(thirtyDayBookings, "Last 30 days"),
      },
      "All Time": {
        bars: buildBars(allTimeBuckets),
        ...periodStats(bookings, "All loaded bookings"),
      },
    };
  }, [bookings]);

  const isToday = period === "Today";
  const periodData = isToday ? null : liveData[period];

  const bars = isToday ? todayData.bars : periodData?.bars ?? [];
  const totalRevenue = isToday
    ? todayData.totalRevenue
    : bars.reduce((acc, d) => acc + d.value, 0);
  const totalBookings = isToday
    ? todayData.totalBookings
    : bars.reduce((acc, d) => acc + d.bookings, 0);
  const newCustomers = isToday ? todayData.newCustomers : periodData?.newCustomers ?? 0;
  const subRevenue = isToday ? todayData.subRevenue : periodData?.subRevenue ?? "";
  const peakDay = isToday
    ? todayData.peakDay
    : bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0] ?? { label: "—", value: 0 });

  const avgPerJob = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

  const topRoutes = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const key = b.route && b.route !== "—" ? b.route : null;
      if (!key) return;
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += parsePrice(b);
    });
    return Object.entries(map)
      .map(([route, { count, revenue }]) => ({ route, count, revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [bookings]);

  const statusBreakdown = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      map[b.status] = (map[b.status] || 0) + 1;
    });
    return Object.entries(map)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [bookings]);

  const driverLeaderboard = useMemo(() => {
    const completedMap = {};
    const revenueMap = {};
    bookings.forEach((b) => {
      if (!b.driverId) return;
      completedMap[b.driverId] = (completedMap[b.driverId] || 0) + (b.status === "Completed" ? 1 : 0);
      revenueMap[b.driverId] = (revenueMap[b.driverId] || 0) + (b.status === "Completed" ? parsePrice(b) : 0);
    });
    return drivers
      .map((d) => ({
        id: d.id,
        name: d.name,
        vehicle: d.vehicle,
        completed: completedMap[d.id] || 0,
        revenue: revenueMap[d.id] || 0,
        completedToday: d.completedToday || 0,
      }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);
  }, [bookings, drivers]);

  const cancellationRate = useMemo(() => {
    const total = bookings.length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    return total > 0 ? Math.round((cancelled / total) * 100) : 0;
  }, [bookings]);

  // Real repeat-customer count: customers (by phone, else name) with >1 booking.
  const repeatCustomers = useMemo(() => {
    const counts = new Map();
    for (const b of bookings) {
      const key = (b.phone || b.customer || "").trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let n = 0;
    for (const c of counts.values()) if (c > 1) n++;
    return n;
  }, [bookings]);

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:p-10">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              period === p
                ? "border-amber-400/40 bg-amber-400/10 text-amber-600"
                : "border-slate-200 text-slate-500 hover:text-slate-600"
            }`}
          >
            {p}
          </button>
        ))}
        {isToday && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live data
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "Total Revenue",
            value: `£${totalRevenue.toLocaleString()}`,
            sub: subRevenue,
            icon: PoundSterling,
          },
          {
            label: "Total Bookings",
            value: totalBookings,
            sub: avgPerJob > 0 ? `Avg £${avgPerJob} per job` : "No completed jobs yet",
            icon: Calendar,
          },
          {
            label: "New Customers",
            value: newCustomers,
            sub: "First-time this period",
            icon: Users,
          },
          {
            label: "Repeat Customers",
            value: repeatCustomers,
            sub: "Booked more than once",
            icon: Repeat,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50">
                <kpi.icon className="h-4 w-4 text-amber-600" />
              </div>
              <TrendingUp className="h-3 w-3 text-emerald-600" />
            </div>
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[#0F1B33] sm:text-3xl">{kpi.value}</p>
            <p className="mt-2 text-xs text-slate-500">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Cancellation rate inline stat */}
      {bookings.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm text-slate-500">
            Cancellation rate: <span className={`font-semibold ${cancellationRate > 10 ? "text-red-600" : "text-emerald-600"}`}>{cancellationRate}%</span>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-sm text-slate-500">
            Completed: <span className="font-semibold text-emerald-600">{bookings.filter((b) => b.status === "Completed").length}</span>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-sm text-slate-500">
            Active now: <span className="font-semibold text-amber-600">{bookings.filter((b) => ["Dispatched","En Route","Passenger On Board"].includes(b.status)).length}</span>
          </span>
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Revenue bar chart */}
        <div className="card p-5 sm:p-6">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Revenue</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#0F1B33]">
              {period === "Today" ? "Today's Revenue" : `Revenue — ${period}`}
            </h2>
          </div>
          {bars.length > 0 ? (
            <>
              <BarChart bars={bars} />
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span>
                  Peak:{" "}
                  <span className="text-amber-600">
                    {peakDay.label} — £{peakDay.value.toLocaleString()}
                  </span>
                </span>
                <span>
                  Total:{" "}
                  <span className="text-[#0F1B33]">£{totalRevenue.toLocaleString()}</span>
                </span>
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-sm text-slate-600">No revenue data for today yet.</p>
          )}
        </div>

        {/* Top routes */}
        <div className="card p-5 sm:p-6">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Routes</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#0F1B33]">Top Routes</h2>
          </div>
          {topRoutes.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-600">No route data yet.</p>
          ) : (
            <div className="space-y-4">
              {topRoutes.map((r) => (
                <div key={r.route}>
                  <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate text-slate-600">{r.route}</span>
                    <span className="flex-shrink-0 font-semibold text-amber-600">
                      £{r.revenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-amber-400/50 transition-all duration-500"
                      style={{ width: `${(r.count / topRoutes[0].count) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-slate-600">{r.count} job{r.count !== 1 ? "s" : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Status breakdown + Driver leaderboard */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Status breakdown */}
        <div className="card p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <PieChart className="h-4 w-4 text-amber-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Breakdown</p>
              <h2 className="mt-1 text-xl font-semibold text-[#0F1B33]">Jobs by Status</h2>
            </div>
          </div>
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {statusBreakdown.map(({ status, count }) => {
                const pct = Math.round((count / bookings.length) * 100);
                const c = STATUS_COLORS[status] ?? { bar: "bg-slate-500", text: "text-slate-500" };
                return (
                  <div key={status}>
                    <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                      <span className={`font-medium ${c.text}`}>{status}</span>
                      <span className="flex-shrink-0 text-slate-500">{count} job{count !== 1 ? "s" : ""} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${c.bar} opacity-60`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Driver leaderboard */}
        <div className="card p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Trophy className="h-4 w-4 text-amber-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Performance</p>
              <h2 className="mt-1 text-xl font-semibold text-[#0F1B33]">Driver Leaderboard</h2>
            </div>
          </div>
          {driverLeaderboard.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">No drivers yet.</p>
          ) : (
            <div className="space-y-3">
              {driverLeaderboard.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <span className={`w-5 flex-shrink-0 text-center text-sm font-bold ${
                    i === 0 ? "text-amber-600" : i === 1 ? "text-slate-600" : "text-slate-600"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-xs font-semibold text-amber-600">
                    {d.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F1B33]">{d.name}</p>
                    <p className="truncate text-xs text-slate-600">{d.vehicle}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold text-emerald-600">{d.completed} jobs</p>
                    <p className="text-xs text-slate-600">£{d.revenue.toLocaleString()}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-semibold text-amber-600">{d.completedToday}</p>
                    <p className="text-[10px] text-slate-700">today</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}