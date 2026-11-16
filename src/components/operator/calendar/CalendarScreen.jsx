"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { ukDateDaysAgo, OPERATIONAL_DAYS_BACK } from "@/lib/operator/ukDate";
import { fmtDate } from "@/lib/dates";
import {
  VIEWS, isKey, periodFor, stepCursor, monthWeeks, enrichBookings, applyFilters,
  groupByDate, inPeriod, periodMetrics, coverage,
} from "@/lib/operator/calendarModel";
import CalendarToolbar from "./CalendarToolbar";
import SummaryStrip from "./SummaryStrip";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DaySchedule from "./DaySchedule";
import AgendaView from "./AgendaView";
import BookingInspector from "./BookingInspector";
import BookingRow, { ROW_ITEM } from "./BookingRow";

const STATUS_LABEL = { confirmed: "Confirmed", reply: "Awaiting reply", driver: "Need driver", attention: "Needs attention" };

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/** Re-renders every minute so "today" and "pickup in 3h" stay true. */
function useNow(fixed) {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed != null) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixed]);
  return now;
}

/**
 * The calendar screen itself: state, views and side panel. Has no data
 * fetching of its own, so it renders the same with live data (OperatorCalendar)
 * or demonstration data (the preview). All changes go out through the props.
 *
 * props: bookings (shaped, from hooks/operator/useBookings), drivers,
 *   loading, error, hasEarlier, totalCount, loadingMore,
 *   onLoadEarlier(), onLoadMore(), onRetry(),
 *   unavailableDriverIds(date) → Set, onOpenBooking(b) (the booking drawer),
 *   onAssign(ref, driverId|null), onNewBooking(date),
 *   initialView, initialDate, syncUrl (default true), nowOverride (ms, preview only)
 */
export default function CalendarScreen({
  bookings, drivers = [], loading = false, error = null, hasEarlier = false, totalCount = 0, loadingMore = false,
  onLoadEarlier, onLoadMore, onRetry, unavailableDriverIds, onOpenBooking, onAssign, onNewBooking,
  initialView, initialDate, syncUrl = true, nowOverride,
}) {
  const now = useNow(nowOverride);
  const today = ukDateDaysAgo(0, new Date(now));
  const isDesktop = useIsDesktop();

  const [view, setView] = useState(() => (VIEWS.includes(initialView) ? initialView : "month"));
  const [cursor, setCursor] = useState(() => (isKey(initialDate) ? initialDate : today));
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("all");
  const [driver, setDriver] = useState("all");
  const [query, setQuery] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const noneUnavailable = useCallback(() => new Set(), []);
  const unavailableFor = unavailableDriverIds ?? noneUnavailable;

  // Keep the URL in step (replace, so Back leaves the calendar rather than
  // stepping through every day tapped).
  useEffect(() => {
    if (!syncUrl) return;
    const p = new URLSearchParams(window.location.search);
    p.set("view", "calendar");
    p.set("cv", view);
    if (cursor === today) p.delete("d"); else p.set("d", cursor);
    const next = `${window.location.pathname}?${p.toString()}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [view, cursor, today, syncUrl]);

  const enriched = useMemo(
    () => enrichBookings(bookings, { today, now, unavailableDriverIds: unavailableFor }),
    [bookings, today, now, unavailableFor]
  );
  const filters = { status, driver, query, showCancelled };
  const visible = useMemo(() => applyFilters(enriched, filters), [enriched, status, driver, query, showCancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => groupByDate(visible), [visible]);
  const period = periodFor(view, cursor, today);

  // The strip counts the period under the driver/search filters but ignores
  // its own status filter, so tapping "Need driver" doesn't rewrite the totals.
  const metrics = useMemo(
    () => periodMetrics(applyFilters(enriched, { ...filters, status: "all", showCancelled: false }).filter((b) => inPeriod(b, period))),
    [enriched, driver, query, period.start, period.end] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const lastLoaded = useMemo(() => bookings.reduce((m, b) => (b.travelDate && b.travelDate > m ? b.travelDate : m), ""), [bookings]);
  const cover = coverage(period, {
    windowStart: ukDateDaysAgo(OPERATIONAL_DAYS_BACK, new Date(now)),
    hasEarlier,
    moreForward: bookings.length < totalCount,
    lastLoaded,
  });

  const selected = selectedId ? enriched.find((b) => b.id === selectedId) ?? null : null;

  const openBooking = useCallback((b) => {
    if (isDesktop) setSelectedId(b.id);
    else onOpenBooking(b);
  }, [isDesktop, onOpenBooking]);

  const lookup = useCallback((id) => enriched.find((b) => b.id === id) ?? null, [enriched]);

  // An exception's action: a clash opens the other job; everything else
  // (assign, reply, add time, payment) is done in the booking itself.
  const handleAction = useCallback((flag, b) => {
    const target = flag.code === "clash" ? lookup(flag.otherId) ?? b : b;
    openBooking(target);
  }, [lookup, openBooking]);

  const goToDate = useCallback((key, nextView) => {
    setCursor(key);
    if (nextView) setView(nextView);
  }, []);

  const newBookingOn = onNewBooking;

  // Escape closes the side panel.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented) setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const filtering = status !== "all" || driver !== "all" || query.trim();
  const emptyText = filtering ? "No transfers match these filters in this period." : "No transfers in this period.";
  const firstLoad = loading && bookings.length === 0;
  const selectedDayList = byDate.get(cursor) ?? [];

  // Side panel when no booking is open: the selected day (month/week), or
  // what needs attention in the period (day/list, which already show days).
  const attentionList = visible.filter((b) => b.attention && inPeriod(b, period) && b.state !== "cancelled");

  return (
    <div className="min-h-screen bg-cal-paper pb-28 text-cal-ink lg:pb-16">
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-3 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-10 lg:px-10 lg:pt-6">
        <div className="min-w-0">
          <CalendarToolbar
            period={period}
            view={view}
            onView={setView}
            onPrev={() => setCursor((c) => stepCursor(view, c, -1))}
            onNext={() => setCursor((c) => stepCursor(view, c, 1))}
            onToday={() => setCursor(today)}
            onTodayDisabled={cursor === today}
            query={query}
            onQuery={setQuery}
            driver={driver}
            onDriver={setDriver}
            drivers={drivers}
            showCancelled={showCancelled}
            onShowCancelled={setShowCancelled}
          />
          <SummaryStrip metrics={metrics} status={status} onStatus={setStatus} complete={cover.complete && !firstLoad} />

          {status !== "all" && (
            <p className="mt-2 flex items-center gap-2 text-cal-xs text-cal-ink2">
              Showing only <span className="font-semibold text-cal-ink">{STATUS_LABEL[status]}</span>
              <button type="button" onClick={() => setStatus("all")} className="inline-flex items-center gap-0.5 font-semibold text-cal-brass-ink hover:underline">
                <X className="h-3 w-3" /> Clear
              </button>
            </p>
          )}

          {error && (
            <div role="status" className="mt-2 flex items-center gap-2 rounded-cal border border-cal-alert/30 bg-cal-alert-soft px-3 py-2 text-cal-xs text-cal-alert">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{bookings.length ? "Couldn't refresh — showing the last bookings loaded." : `Couldn't load bookings: ${error}`}</span>
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline"><RotateCw className="h-3 w-3" /> Retry</button>
            </div>
          )}

          {!firstLoad && !cover.complete && (
            <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cal border border-cal-rule bg-cal-sheet px-3 py-2 text-cal-xs text-cal-ink2">
              <span className="flex-1">
                {cover.missingEarlier
                  ? `Bookings before ${fmtDate(ukDateDaysAgo(OPERATIONAL_DAYS_BACK, new Date(now)))} aren't loaded yet, so this period may be incomplete.`
                  : `Only bookings up to ${fmtDate(lastLoaded)} are loaded, so this period may be incomplete.`}
              </span>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => (cover.missingEarlier ? onLoadEarlier?.() : onLoadMore?.())}
                className="font-semibold text-cal-ink hover:text-cal-brass-ink disabled:text-cal-faint"
              >
                {loadingMore ? "Loading…" : cover.missingEarlier ? "Load earlier bookings" : "Load more bookings"}
              </button>
            </div>
          )}

          {firstLoad ? (
            <Skeleton />
          ) : view === "month" ? (
            <>
              <MonthView
                weeks={monthWeeks(cursor)}
                monthKey={cursor}
                selected={cursor}
                today={today}
                byDate={byDate}
                onSelect={(k) => { setCursor(k); setSelectedId(null); }}
                onOpenDay={(k) => goToDate(k, "day")}
              />
              <div className="mt-5 lg:hidden">
                <DaySchedule date={cursor} today={today} bookings={selectedDayList} selectedId={selectedId} onOpen={openBooking} onAction={handleAction} onNewBooking={newBookingOn} onOpenDay={(k) => goToDate(k, "day")} compact emptyHint={filtering ? "No matching transfers on this day." : undefined} />
              </div>
            </>
          ) : view === "week" ? (
            <WeekView period={period} today={today} selected={cursor} byDate={byDate} selectedId={selectedId} onOpen={openBooking} onAction={handleAction} onSelectDay={(k) => { setCursor(k); setSelectedId(null); }} onOpenDay={(k) => goToDate(k, "day")} />
          ) : view === "day" ? (
            <div className="mt-5">
              <DaySchedule date={cursor} today={today} bookings={selectedDayList} selectedId={selectedId} onOpen={openBooking} onAction={handleAction} onNewBooking={newBookingOn} hideTitle emptyHint={filtering ? "No matching transfers on this day." : undefined} />
            </div>
          ) : (
            <AgendaView period={period} today={today} byDate={byDate} selectedId={selectedId} onOpen={openBooking} onAction={handleAction} onOpenDay={(k) => goToDate(k, "day")} emptyText={emptyText} />
          )}
        </div>

        {/* Side panel (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-[124px] flex max-h-[calc(100vh-140px)] flex-col overflow-y-auto rounded-cal-lg border border-cal-line bg-cal-sheet p-5 [scrollbar-width:thin]">
            {selected ? (
              <BookingInspector
                b={selected}
                drivers={drivers}
                unavailable={selected.travelDate ? unavailableFor(selected.travelDate) : new Set()}
                lookup={lookup}
                onAction={handleAction}
                onSelect={(o) => setSelectedId(o.id)}
                onAssign={onAssign}
                onClose={() => setSelectedId(null)}
                onOpenFull={onOpenBooking}
                onGoToDate={(k) => { setSelectedId(null); goToDate(k); }}
              />
            ) : view === "month" || view === "week" ? (
              <DaySchedule date={cursor} today={today} bookings={selectedDayList} selectedId={selectedId} onOpen={openBooking} onAction={handleAction} onNewBooking={newBookingOn} onOpenDay={(k) => goToDate(k, "day")} compact emptyHint={filtering ? "No matching transfers on this day." : undefined} />
            ) : (
              <section aria-label="Needs attention">
                <header className="border-b border-cal-line pb-2.5">
                  <h3 className="font-display text-cal-lg font-medium text-cal-ink">Needs attention</h3>
                  <p className="mt-0.5 text-cal-xs text-cal-muted">{view === "day" ? "This day" : "This month"} · select a booking for details</p>
                </header>
                {attentionList.length === 0 ? (
                  <p className="py-8 text-center text-cal-sm text-cal-muted">Nothing outstanding.</p>
                ) : (
                  <ol className="-mx-3">
                    {attentionList.map((b) => <li key={b.id} className={ROW_ITEM}><BookingRow b={b} onOpen={openBooking} onAction={handleAction} selected={b.id === selectedId} /></li>)}
                  </ol>
                )}
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-8" aria-busy="true" aria-label="Loading bookings">
      <div className="grid grid-cols-7 border-b border-cal-line">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-cal-line p-1.5 sm:h-16 lg:h-[112px]">
            <div className="h-3 w-4 animate-pulse rounded-sm bg-cal-well motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
