"use client";

import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, format, isSameDay, isToday, isSameMonth,
  addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plane, Car } from "lucide-react";
import type { DbBooking } from "@/lib/database.types";
import { fmtDate } from "@/lib/dates";
type CalendarBookingMap = Record<string, DbBooking[]>;

interface Props {
  currentMonth: Date;
  bookings: DbBooking[];
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

type ViewMode = "month" | "week";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Returns 0 (Mon) – 6 (Sun) — ISO weekday convention */
function isoWeekday(date: Date): number {
  return (getDay(date) + 6) % 7;
}

/** Splits a day's bookings into active/confirmed/pending, with revenue and an airport flag */
function classifyBookings(dayBookings: DbBooking[]) {
  const active = dayBookings.filter((b) => b.status !== "Cancelled");
  const pending = active.filter(
    (b) => b.status === "Unassigned" || b.status === "Unassigned / Missed Call Recovery"
  ).length;
  const confirmed = active.length - pending;
  const hasAirport = active.some((b) => b.flight_number !== null);
  const revenue = active.reduce((sum, b) => sum + (b.quoted_price ?? 0), 0);
  return { active, confirmed, pending, hasAirport, revenue };
}

export default function CalendarView({
  currentMonth,
  bookings,
  selectedDate,
  onDateSelect,
  onMonthChange,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  // Build a map of dateStr → bookings for quick lookup
  const bookingMap = useMemo<CalendarBookingMap>(() => {
    const map: CalendarBookingMap = {};
    for (const b of bookings) {
      if (!b.travel_date) continue;
      const key = b.travel_date.slice(0, 10); // YYYY-MM-DD
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end:   endOfMonth(currentMonth),
  });

  // Leading empty cells so the grid aligns to Mon
  const leadingBlanks = isoWeekday(days[0]);

  const cells: Array<Date | null> = [
    ...Array(leadingBlanks).fill(null),
    ...days,
  ];

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const monthTotal = bookings
    .filter((b) => {
      if (!b.travel_date) return false;
      const d = new Date(b.travel_date);
      return isSameMonth(d, currentMonth) && b.status !== "Cancelled";
    })
    .reduce((sum, b) => sum + (b.quoted_price ?? 0), 0);

  // Today strip — surfaces today's job count regardless of which month/day is selected
  const todayStr   = format(new Date(), "yyyy-MM-dd");
  const todayCount = bookings.filter(
    (b) => b.travel_date === todayStr && b.status !== "Cancelled"
  ).length;
  const onToday = !!selectedDate && format(selectedDate, "yyyy-MM-dd") === todayStr;

  // Week view — the 7-day week containing the selected date (or today)
  const weekAnchor = selectedDate ?? new Date();
  const weekStart  = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekEnd    = endOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekDays   = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekTotal = weekDays.reduce((sum, day) => {
    const key = format(day, "yyyy-MM-dd");
    return sum + classifyBookings(bookingMap[key] ?? []).revenue;
  }, 0);

  const weekLabel = isSameMonth(weekStart, weekEnd)
    ? `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`
    : `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

  const goPrev = () =>
    viewMode === "month"
      ? onMonthChange(subMonths(currentMonth, 1))
      : onDateSelect(subWeeks(weekAnchor, 1));

  const goNext = () =>
    viewMode === "month"
      ? onMonthChange(addMonths(currentMonth, 1))
      : onDateSelect(addWeeks(weekAnchor, 1));

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {viewMode === "month" ? format(currentMonth, "MMMM yyyy") : weekLabel}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewMode === "month" ? "Monthly total" : "Weekly total"}{" "}
            <span className="text-amber-600 font-semibold">
              £{(viewMode === "month" ? monthTotal : weekTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {todayCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 mr-1 px-2 py-1 rounded-full text-[10px] font-semibold text-amber-600 bg-gold/10 border border-gold/20">
              {todayCount} today
            </span>
          )}
          <button
            onClick={() => onDateSelect(new Date())}
            disabled={onToday}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              onToday
                ? "text-slate-600 border-slate-100 cursor-default"
                : "text-amber-600 border-gold/25 hover:bg-gold/10"
            }`}
          >
            Today
          </button>
          <button
            onClick={goPrev}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goNext}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* View toggle + legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white border border-slate-200">
          {(["month", "week"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                viewMode === mode
                  ? "bg-gold/15 text-amber-600"
                  : "text-slate-500 hover:text-slate-600"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gold" />
            Pending
          </span>
        </div>
      </div>

      {viewMode === "month" ? (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center">
            {DAYS.map((d) => (
              <div key={d} className="text-[10px] font-semibold text-slate-600 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} />;

              const dateKey     = format(day, "yyyy-MM-dd");
              const dayBookings = bookingMap[dateKey] ?? [];
              const isSelected  = selectedDate ? isSameDay(day, selectedDate) : false;
              const isTodayDate = isToday(day);
              const { active, confirmed, pending, hasAirport } = classifyBookings(dayBookings);

              return (
                <button
                  key={dateKey}
                  onClick={() => onDateSelect(day)}
                  className={`
                    relative flex flex-col items-center justify-start
                    py-2 px-1 rounded-xl transition-all
                    ${isSelected
                      ? "bg-gold text-navy-900 shadow-gold-md"
                      : isTodayDate
                      ? "bg-slate-100 text-slate-800 ring-2 ring-gold/50"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }
                  `}
                >
                  <span
                    className={`text-sm font-semibold leading-none mb-1.5 ${
                      isSelected ? "text-navy-900" : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Booking indicators */}
                  {active.length > 0 && (
                    <div className="flex flex-col items-center gap-0.5">
                      {hasAirport ? (
                        <Plane
                          size={9}
                          className={
                            isSelected ? "text-navy-800" : "text-amber-600"
                          }
                        />
                      ) : (
                        <Car
                          size={9}
                          className={
                            isSelected ? "text-navy-800" : "text-slate-500"
                          }
                        />
                      )}

                      {/* Dots for confirmed / pending */}
                      <div className="flex gap-0.5">
                        {confirmed > 0 && (
                          <span
                            className={`w-1 h-1 rounded-full ${
                              isSelected ? "bg-white" : "bg-emerald-500"
                            }`}
                          />
                        )}
                        {pending > 0 && (
                          <span
                            className={`w-1 h-1 rounded-full ${
                              isSelected ? "bg-slate-100" : "bg-gold"
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* Week agenda */
        <div className="flex flex-col gap-1.5">
          {weekDays.map((day) => {
            const dateKey     = format(day, "yyyy-MM-dd");
            const dayBookings = bookingMap[dateKey] ?? [];
            const isSelected  = selectedDate ? isSameDay(day, selectedDate) : false;
            const isTodayDate = isToday(day);
            const { active, confirmed, pending, hasAirport, revenue } = classifyBookings(dayBookings);

            return (
              <button
                key={dateKey}
                onClick={() => onDateSelect(day)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-gold border-gold text-navy-900 shadow-gold-md"
                    : isTodayDate
                    ? "bg-slate-100 border-gold/40 ring-2 ring-gold/50 text-slate-800"
                    : "bg-white border-slate-200 text-slate-600 hover:border-gold/20"
                }`}
              >
                {/* Date block */}
                <div className="flex flex-col items-center justify-center w-11 shrink-0">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                    isSelected ? "text-navy-900/70" : "text-slate-500"
                  }`}>
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-lg font-bold leading-none mt-0.5 ${
                    isSelected ? "text-navy-900" : "text-slate-800"
                  }`}>
                    {format(day, "d")}
                  </span>
                </div>

                {/* Summary */}
                <div className="flex-1 min-w-0">
                  {active.length === 0 ? (
                    <span className={`text-xs ${isSelected ? "text-navy-900/60" : "text-slate-600"}`}>
                      No transfers
                    </span>
                  ) : (
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${
                        isSelected ? "text-navy-900" : "text-slate-700"
                      }`}>
                        {hasAirport ? <Plane size={12} /> : <Car size={12} />}
                        {active.length} job{active.length !== 1 ? "s" : ""}
                      </span>
                      {confirmed > 0 && (
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${
                          isSelected ? "text-navy-900/70" : "text-emerald-600"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {confirmed}
                        </span>
                      )}
                      {pending > 0 && (
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${
                          isSelected ? "text-navy-900/70" : "text-amber-600"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {pending}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Revenue */}
                {revenue > 0 && (
                  <span className={`text-xs font-bold shrink-0 ${isSelected ? "text-navy-900" : "text-amber-600"}`}>
                    £{revenue.toLocaleString("en-GB")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}