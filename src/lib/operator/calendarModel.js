// Pure logic behind the operator calendar (Bookings → Calendar).
//
// Works on the shaped bookings from hooks/operator/useBookings and reuses the
// shared definitions in bookingBuckets, so the calendar, the list and the
// board always agree on what "awaiting reply" or "needs a driver" means.
//
// Every calendar date is a UK wall-clock date string, YYYY-MM-DD (the same
// form as booking.travelDate). Date maths is done on UTC noon so no device
// timezone or clock change can move a booking onto the wrong day.

import { awaitingReply, needsDriver, isPast, unpaidCompleted, DONE_STATUSES, ON_ROAD_STATUSES } from "./bookingBuckets";
import { CLASH_BUFFER_MINUTES, looksLikeAirport } from "../bookingUtils";

// ── Date keys ────────────────────────────────────────────────────────────────

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const isKey = (k) => typeof k === "string" && KEY_RE.test(k);

function toDate(key) {
  const [, y, m, d] = key.match(KEY_RE);
  return new Date(Date.UTC(+y, +m - 1, +d, 12));
}
function fromDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(key, n) {
  const d = toDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key) {
  return (toDate(key).getUTCDay() + 6) % 7;
}

export const startOfWeek = (key) => addDays(key, -weekdayIndex(key));
export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;
export function endOfMonth(key) {
  const d = toDate(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return fromDate(d);
}
export function addMonths(key, n) {
  const d = toDate(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + n);
  const target = fromDate(d);
  // Keep the day of month where possible (31st → last day of a short month).
  const day = Math.min(+key.slice(8, 10), +endOfMonth(target).slice(8, 10));
  return `${target.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export function daysBetween(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

/** Every key from start to end inclusive. */
export function eachDay(start, end) {
  const out = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

/** The Monday-first weeks covering a month, as rows of 7 keys. */
export function monthWeeks(key) {
  const first = startOfWeek(startOfMonth(key));
  const last = addDays(startOfWeek(endOfMonth(key)), 6);
  const days = eachDay(first, last);
  const rows = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dm = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const dmy = (key) => `${dm(key)}/${key.slice(0, 4)}`;
const monthOf = (key) => MONTHS[+key.slice(5, 7) - 1];
export const dayOfMonth = (key) => +key.slice(8, 10);
export const weekdayShort = (key) => WEEKDAYS_SHORT[weekdayIndex(key)];
export const weekdayLong = (key) => WEEKDAYS_LONG[weekdayIndex(key)];
/** "Thursday 15/10/2026" — data and labels stay in the house DD/MM/YYYY style. */
export const longDay = (key) => `${weekdayLong(key)} ${dmy(key)}`;
export const shortDay = (key) => `${weekdayShort(key)} ${dm(key)}`;

// Calendar navigation headings are the one place a month is written out
// ("October 2026"), at the user's request (15/10/2026). Everything else —
// booking dates, the side panel, notices — keeps DD/MM/YYYY.
export const monthTitle = (key) => `${monthOf(key)} ${key.slice(0, 4)}`;
export const dayTitle = (key) => `${weekdayLong(key)}, ${dayOfMonth(key)} ${monthOf(key)} ${key.slice(0, 4)}`;

/** ISO-8601 week number (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeek(key) {
  const thursday = addDays(key, 3 - weekdayIndex(key));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

function relativeDay(key, today) {
  const n = daysBetween(today, key);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
function relativeMonth(key, today) {
  const n = (+key.slice(0, 4) - +today.slice(0, 4)) * 12 + (+key.slice(5, 7) - +today.slice(5, 7));
  if (n === 0) return "This month";
  if (n === 1) return "Next month";
  if (n === -1) return "Last month";
  return n > 0 ? `In ${n} months` : `${-n} months ago`;
}

// ── Periods ──────────────────────────────────────────────────────────────────

export const VIEWS = ["month", "week", "day", "list"];

/**
 * The date range a view covers around the cursor date (List = the month),
 * with its heading: `title` (from sm), `titleShort` (phones), and a quiet
 * `eyebrow` placing it relative to today.
 */
export function periodFor(view, cursor, today = cursor) {
  if (view === "day") {
    const rel = relativeDay(cursor, today);
    return {
      view, start: cursor, end: cursor,
      title: dayTitle(cursor),
      titleShort: `${dayOfMonth(cursor)} ${monthOf(cursor)} ${cursor.slice(0, 4)}`,
      eyebrow: rel,
      eyebrowShort: `${weekdayLong(cursor)} · ${rel}`,
    };
  }
  if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    const short = (k) => `${dayOfMonth(k)} ${monthOf(k).slice(0, 3)}`;
    let title;
    if (start.slice(0, 7) === end.slice(0, 7)) title = `${dayOfMonth(start)}–${dayOfMonth(end)} ${monthOf(end)} ${end.slice(0, 4)}`;
    else if (start.slice(0, 4) === end.slice(0, 4)) title = `${short(start)} – ${short(end)} ${end.slice(0, 4)}`;
    else title = `${short(start)} ${start.slice(0, 4)} – ${short(end)} ${end.slice(0, 4)}`;
    const n = Math.round(daysBetween(startOfWeek(today), start) / 7);
    const rel = n === 0 ? "This week" : n === 1 ? "Next week" : n === -1 ? "Last week" : null;
    const eyebrow = `Week ${isoWeek(start)}${rel ? ` · ${rel}` : ""}`;
    return { view, start, end, title, titleShort: title, eyebrow, eyebrowShort: eyebrow };
  }
  const rel = relativeMonth(cursor, today);
  return {
    view, start: startOfMonth(cursor), end: endOfMonth(cursor),
    title: monthTitle(cursor), titleShort: monthTitle(cursor), eyebrow: rel, eyebrowShort: rel,
  };
}

/** Where Previous / Next moves the cursor in each view. */
export function stepCursor(view, cursor, dir) {
  if (view === "day") return addDays(cursor, dir);
  if (view === "week") return addDays(cursor, 7 * dir);
  return addMonths(cursor, dir);
}

// ── Times ────────────────────────────────────────────────────────────────────

export function minutesOf(time) {
  const m = String(time ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

export function formatGap(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

// ── Booking state and flags ─────────────────────────────────────────────────

/**
 * Where a booking stands, for colour and grouping:
 *  reply     website request still to accept or decline  ("pending")
 *  driver    confirmed but no driver                     ("unassigned")
 *  assigned  driver on it, not yet on the road
 *  road      en route / arrived / passenger on board
 *  done      completed or no-show
 *  cancelled
 */
export function bookingState(b) {
  if (b.status === "Cancelled") return "cancelled";
  if (awaitingReply(b)) return "reply";
  if (ON_ROAD_STATUSES.includes(b.status)) return "road";
  if (DONE_STATUSES.includes(b.status)) return "done";
  if (needsDriver(b)) return "driver";
  return "assigned";
}

export const STATE_LABEL = {
  reply: "Awaiting reply",
  driver: "Needs driver",
  assigned: "Driver assigned",
  road: "On the road",
  done: "Completed",
  cancelled: "Cancelled",
};

export function isAirportJob(b) {
  return Boolean(
    b.airport ||
    (b.flight && b.flight !== "—") ||
    looksLikeAirport(b.pickupLocation) ||
    looksLikeAirport(b.dropoffAddress)
  );
}

/** Numeric fare. Prefers the raw value; falls back to the "£95" display string. */
export function fareOf(b) {
  if (typeof b.priceValue === "number" && Number.isFinite(b.priceValue)) return b.priceValue;
  const m = String(b.price ?? "").match(/£\s*([\d,.]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/**
 * Same-driver jobs on the same day whose pickups are closer together than
 * CLASH_BUFFER_MINUTES (the app's existing assignment rule).
 *
 * Bookings record a pickup time but no journey length or drop-off time, so
 * this can't prove two jobs overlap — it finds pairs too close to be safe and
 * reports the gap, for the office to judge. Returns id → { other, gap } where
 * gap is minutes from this pickup to the other's (negative = other is earlier).
 */
export function findClashes(bookings) {
  const groups = new Map();
  for (const b of bookings) {
    if (!b.driverId || !b.travelDate) continue;
    if (b.status === "Cancelled" || DONE_STATUSES.includes(b.status)) continue;
    const mins = minutesOf(b.time);
    if (mins == null) continue;
    const k = `${b.driverId}|${b.travelDate}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ b, mins });
  }
  const clashes = new Map();
  for (const list of groups.values()) {
    list.sort((x, y) => x.mins - y.mins);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const gap = cur.mins - prev.mins;
      if (gap < CLASH_BUFFER_MINUTES) {
        if (!clashes.has(prev.b.id)) clashes.set(prev.b.id, { other: cur.b, gap });
        if (!clashes.has(cur.b.id)) clashes.set(cur.b.id, { other: prev.b, gap: -gap });
      }
    }
  }
  return clashes;
}

/**
 * Adds calendar fields to each booking: state, isAirport, fare, minutes, and
 * `flags` — the operational warnings shown on the calendar. `attention` is
 * true when any flag needs the office to act.
 *
 * ctx: { today: YYYY-MM-DD, now: ms, unavailableDriverIds?: (date) => Set }
 */
export function enrichBookings(bookings, ctx) {
  const { today, now = Date.now(), unavailableDriverIds } = ctx;
  const clashes = findClashes(bookings);
  return bookings.map((b) => {
    const state = bookingState(b);
    const past = isPast(b, today);
    const flags = [];
    if (state === "reply") flags.push({ code: "reply", tone: "wait", label: "Awaiting your reply" });
    if (state === "driver" && !past) {
      const t = b.pickupTime ? new Date(b.pickupTime).getTime() : NaN;
      const hours = Number.isNaN(t) ? null : (t - now) / 3600000;
      if (hours != null && hours >= 0 && hours <= 24) {
        flags.push({ code: "urgent", tone: "alert", label: `No driver · pickup in ${formatGap(Math.max(1, Math.round(hours * 60)))}` });
      } else {
        flags.push({ code: "driver", tone: "alert", label: "No driver assigned" });
      }
    }
    const clash = clashes.get(b.id);
    if (clash) {
      const { other, gap } = clash;
      const mins = Math.abs(gap);
      flags.push({
        code: "clash",
        tone: "alert",
        label: `Same driver at ${other.time}, ${formatGap(mins)} ${gap > 0 ? "later" : "earlier"}`,
        detail: `${b.driver} also has ${other.customer || other.id} at ${other.time}, ${formatGap(mins)} ${gap > 0 ? "after" : "before"} this pickup (under the ${CLASH_BUFFER_MINUTES}-min gap).`,
        otherId: other.id,
        gap,
      });
    }
    if (b.driverId && b.travelDate && state !== "cancelled" && state !== "done" && unavailableDriverIds?.(b.travelDate)?.has(b.driverId)) {
      flags.push({ code: "unavailable", tone: "alert", label: `${b.driver} marked this day unavailable` });
    }
    if (minutesOf(b.time) == null && state !== "cancelled" && !past) flags.push({ code: "notime", tone: "wait", label: "No pickup time" });
    if (unpaidCompleted(b)) flags.push({ code: "unpaid", tone: "wait", label: "Completed, not paid" });

    return {
      ...b,
      state,
      past,
      isAirport: isAirportJob(b),
      fare: fareOf(b),
      minutes: minutesOf(b.time),
      flags,
      attention: flags.length > 0,
    };
  });
}

// ── Filtering ───────────────────────────────────────────────────────────────

export const STATUS_FILTERS = {
  all: () => true,
  confirmed: (b) => b.state !== "reply" && b.state !== "cancelled",
  reply: (b) => b.state === "reply",
  driver: (b) => b.state === "driver" && !b.past,
  attention: (b) => b.attention,
};

export function matchesSearch(b, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [b.id, b.customer, b.flight, b.route, b.driver, b.phone, b.pickupLocation, b.dropoffAddress, b.airport]
    .some((v) => v && String(v).toLowerCase().includes(s));
}

/** filters: { status, driver: "all" | "none" | driverId, query, showCancelled } */
export function applyFilters(bookings, { status = "all", driver = "all", query = "", showCancelled = false }) {
  const byStatus = STATUS_FILTERS[status] ?? STATUS_FILTERS.all;
  return bookings.filter((b) => {
    if (b.state === "cancelled" && !showCancelled) return false;
    if (!byStatus(b)) return false;
    if (driver === "none" && b.driverId) return false;
    if (driver !== "all" && driver !== "none" && b.driverId !== driver) return false;
    return matchesSearch(b, query);
  });
}

// ── Grouping and metrics ────────────────────────────────────────────────────

const byTime = (a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999) || String(a.id).localeCompare(String(b.id));

/** date → bookings sorted by pickup time. Undated bookings are left out. */
export function groupByDate(bookings) {
  const map = new Map();
  for (const b of bookings) {
    if (!b.travelDate) continue;
    if (!map.has(b.travelDate)) map.set(b.travelDate, []);
    map.get(b.travelDate).push(b);
  }
  for (const list of map.values()) list.sort(byTime);
  return map;
}

export const inPeriod = (b, p) => Boolean(b.travelDate) && b.travelDate >= p.start && b.travelDate <= p.end;

/** Counts for the summary strip. Cancelled jobs never count. */
export function periodMetrics(bookings) {
  const live = bookings.filter((b) => b.state !== "cancelled");
  let revenue = 0;
  let unpriced = 0;
  for (const b of live) {
    if (b.fare == null) unpriced++;
    else revenue += b.fare;
  }
  return {
    total: live.length,
    confirmed: live.filter(STATUS_FILTERS.confirmed).length,
    reply: live.filter(STATUS_FILTERS.reply).length,
    driver: live.filter(STATUS_FILTERS.driver).length,
    attention: live.filter(STATUS_FILTERS.attention).length,
    airport: live.filter((b) => b.isAirport).length,
    revenue,
    unpriced,
  };
}

/** Per-day dot summary for the month grid. */
export function daySummary(list) {
  const live = list.filter((b) => b.state !== "cancelled");
  const count = (s) => live.filter((b) => b.state === s).length;
  return {
    total: live.length,
    reply: count("reply"),
    driver: live.filter(STATUS_FILTERS.driver).length,
    confirmed: live.filter(STATUS_FILTERS.confirmed).length,
    airport: live.filter((b) => b.isAirport).length,
    attention: live.some((b) => b.attention),
  };
}

/** Jobs per driver on one day, plus the unassigned count, for the day view. */
export function driverLoad(dayBookings) {
  const live = dayBookings.filter((b) => b.state !== "cancelled");
  const map = new Map();
  let unassigned = 0;
  for (const b of live) {
    if (!b.driverId) { unassigned++; continue; }
    if (!map.has(b.driverId)) map.set(b.driverId, { id: b.driverId, name: b.driver, jobs: [] });
    map.get(b.driverId).jobs.push(b);
  }
  const drivers = [...map.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
  return { drivers, unassigned };
}

/** Free time between consecutive timed pickups (shown in the day view when long). */
export function gapBefore(list, index) {
  const cur = list[index];
  const prev = list[index - 1];
  if (!prev || prev.minutes == null || cur.minutes == null) return null;
  return cur.minutes - prev.minutes;
}

// ── Data coverage ───────────────────────────────────────────────────────────

/**
 * Whether the loaded bookings fully cover a period, so the strip never shows a
 * confident number for a range that hasn't been loaded.
 *  windowStart  first date the operational query loads (older = loadEarlier)
 *  hasEarlier   older bookings may still exist
 *  moreForward  later bookings exist beyond the loaded page
 *  lastLoaded   latest travel date loaded
 */
export function coverage(period, { windowStart, hasEarlier, moreForward, lastLoaded }) {
  const missingEarlier = Boolean(hasEarlier && windowStart && period.start < windowStart);
  const missingLater = Boolean(moreForward && lastLoaded && period.end > lastLoaded);
  return { complete: !missingEarlier && !missingLater, missingEarlier, missingLater };
}
