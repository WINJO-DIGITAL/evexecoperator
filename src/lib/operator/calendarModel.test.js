import { describe, it, expect } from "vitest";
import {
  addDays, addMonths, startOfWeek, endOfMonth, monthWeeks, weekdayIndex,
  periodFor, stepCursor, monthTitle, longDay, isoWeek,
  bookingState, isAirportJob, fareOf, findClashes, enrichBookings,
  applyFilters, groupByDate, periodMetrics, daySummary, driverLoad, gapBefore,
  coverage, formatGap,
} from "./calendarModel";
import { ukToIso } from "../dates";

const base = (over = {}) => ({
  id: "EV-1", customer: "A Customer", status: "Dispatched", driverId: "d1", driver: "James",
  travelDate: "2026-10-15", time: "09:00", pickupTime: ukToIso("2026-10-15", "09:00"),
  source: "operator", operatorResponse: null, flight: "—", airport: null,
  pickupLocation: "1 High St", dropoffAddress: "2 Low Rd", route: "1 High St → 2 Low Rd",
  price: "£95", priceValue: 95, paymentStatus: "Unpaid", paymentMethod: null,
  ...over,
});

describe("date keys", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // UK clock change day
  });
  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-10-15")).toBe(3); // Thursday
    expect(startOfWeek("2026-10-15")).toBe("2026-10-12");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12"); // Sunday
  });
  it("moves months keeping the day where it exists", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-15", -1)).toBe("2026-09-15");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });
  it("covers a month in whole Monday-first weeks", () => {
    const rows = monthWeeks("2026-10-15");
    expect(rows[0][0]).toBe("2026-09-28");
    expect(rows.at(-1)[6]).toBe("2026-11-01");
    expect(rows.every((r) => r.length === 7)).toBe(true);
  });
  it("writes the month out in navigation headings only", () => {
    expect(monthTitle("2026-10-15")).toBe("October 2026");
    expect(longDay("2026-10-15")).toBe("Thursday 15/10/2026"); // data labels keep DD/MM/YYYY
    expect(periodFor("week", "2026-10-15").title).toBe("12–18 October 2026");
    expect(periodFor("week", "2026-10-01").title).toBe("28 Sep – 4 Oct 2026");
    expect(periodFor("week", "2026-12-31").title).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(periodFor("day", "2026-10-15")).toMatchObject({ title: "Thursday, 15 October 2026", titleShort: "15 October 2026" });
  });
  it("places a period relative to today", () => {
    const today = "2026-10-15";
    expect(periodFor("month", "2026-10-02", today).eyebrow).toBe("This month");
    expect(periodFor("month", "2026-12-02", today).eyebrow).toBe("In 2 months");
    expect(periodFor("week", "2026-10-20", today).eyebrow).toBe("Week 43 · Next week");
    expect(periodFor("day", "2026-10-16", today)).toMatchObject({ eyebrow: "Tomorrow", eyebrowShort: "Friday · Tomorrow" });
    expect(periodFor("day", "2026-10-12", today).eyebrow).toBe("3 days ago");
  });
  it("numbers ISO weeks", () => {
    expect(isoWeek("2026-10-15")).toBe(42);
    expect(isoWeek("2027-01-01")).toBe(53); // 2026 has 53 ISO weeks
    expect(isoWeek("2026-01-01")).toBe(1);
  });
  it("steps the cursor by the view's unit", () => {
    expect(stepCursor("day", "2026-10-15", 1)).toBe("2026-10-16");
    expect(stepCursor("week", "2026-10-15", -1)).toBe("2026-10-08");
    expect(stepCursor("month", "2026-10-15", 1)).toBe("2026-11-15");
    expect(periodFor("list", "2026-10-15")).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
  });
  it("formats gaps", () => {
    expect(formatGap(45)).toBe("45m");
    expect(formatGap(120)).toBe("2h");
    expect(formatGap(135)).toBe("2h 15m");
  });
});

describe("booking state", () => {
  it("agrees with the shared buckets", () => {
    expect(bookingState(base({ source: "website" }))).toBe("reply");
    expect(bookingState(base({ status: "Unassigned", driverId: null }))).toBe("driver");
    expect(bookingState(base({ status: "En Route" }))).toBe("road");
    expect(bookingState(base({ status: "Completed" }))).toBe("done");
    expect(bookingState(base({ status: "Cancelled" }))).toBe("cancelled");
    expect(bookingState(base())).toBe("assigned");
  });
  it("detects airport work from any field", () => {
    expect(isAirportJob(base())).toBe(false);
    expect(isAirportJob(base({ flight: "BA123" }))).toBe(true);
    expect(isAirportJob(base({ dropoffAddress: "Manchester Airport" }))).toBe(true);
    expect(isAirportJob(base({ pickupLocation: "Terminal (LHR)" }))).toBe(true);
  });
  it("reads fares from the raw value, else the display string", () => {
    expect(fareOf(base({ priceValue: 95.5 }))).toBe(95.5);
    expect(fareOf(base({ priceValue: undefined, price: "£1,200" }))).toBe(1200);
    expect(fareOf(base({ priceValue: undefined, price: "TBC" }))).toBe(null);
  });
});

describe("flags", () => {
  const today = "2026-10-15";
  const now = new Date(ukToIso(today, "06:00")).getTime();

  it("flags same-driver jobs inside the clash buffer, both ways", () => {
    const a = base({ id: "A", time: "09:00" });
    const b = base({ id: "B", time: "10:00" });
    const c = base({ id: "C", time: "13:00" });
    const clashes = findClashes([a, b, c]);
    expect(clashes.get("A")).toMatchObject({ other: { id: "B" }, gap: 60 });
    expect(clashes.get("B")).toMatchObject({ other: { id: "A" }, gap: -60 });
    expect(clashes.has("C")).toBe(false);
    const [ea, eb] = enrichBookings([a, b], { today, now });
    expect(ea.flags[0]).toMatchObject({ code: "clash", otherId: "B", label: "Same driver at 10:00, 1h later" });
    expect(eb.flags[0].label).toBe("Same driver at 09:00, 1h earlier");
    expect(eb.flags[0].detail).toBe("James also has A Customer at 09:00, 1h before this pickup (under the 90-min gap).");
  });

  it("marks an unassigned job within 24h as urgent", () => {
    const [b] = enrichBookings([base({ status: "Unassigned", driverId: null, driver: "Unassigned" })], { today, now });
    expect(b.flags.map((f) => f.code)).toEqual(["urgent"]);
    expect(b.flags[0].label).toBe("No driver · pickup in 3h");
    expect(b.attention).toBe(true);
  });

  it("marks a later unassigned job as needing a driver", () => {
    const [b] = enrichBookings([base({ status: "Unassigned", driverId: null, travelDate: "2026-10-20", pickupTime: ukToIso("2026-10-20", "09:00") })], { today, now });
    expect(b.flags.map((f) => f.code)).toEqual(["driver"]);
  });

  it("raises driver unavailability, missing time and unpaid work", () => {
    const off = () => new Set(["d1"]);
    const [x] = enrichBookings([base()], { today, now, unavailableDriverIds: off });
    expect(x.flags.map((f) => f.code)).toContain("unavailable");
    const [y] = enrichBookings([base({ time: "—", pickupTime: null, travelDate: "2026-10-16" })], { today, now });
    expect(y.flags.map((f) => f.code)).toContain("notime");
    const [z] = enrichBookings([base({ status: "Completed" })], { today, now });
    expect(z.flags.map((f) => f.code)).toEqual(["unpaid"]);
  });

  it("leaves a clean assigned job alone", () => {
    const [b] = enrichBookings([base({ travelDate: "2026-10-16" })], { today, now });
    expect(b.flags).toEqual([]);
    expect(b.attention).toBe(false);
  });
});

describe("filters, grouping, metrics", () => {
  const today = "2026-10-15";
  const now = new Date(ukToIso(today, "06:00")).getTime();
  const list = enrichBookings([
    base({ id: "A", time: "11:00" }),
    base({ id: "B", time: "07:30", source: "website", flight: "EZY1" }),
    base({ id: "C", status: "Unassigned", driverId: null, driver: "Unassigned", priceValue: null, price: "TBC", travelDate: "2026-10-16", pickupTime: ukToIso("2026-10-16", "08:00"), time: "08:00" }),
    base({ id: "D", status: "Cancelled" }),
  ], { today, now });

  it("hides cancelled unless asked, and filters by status, driver and search", () => {
    expect(applyFilters(list, {}).map((b) => b.id)).toEqual(["A", "B", "C"]);
    expect(applyFilters(list, { showCancelled: true }).length).toBe(4);
    expect(applyFilters(list, { status: "reply" }).map((b) => b.id)).toEqual(["B"]);
    expect(applyFilters(list, { status: "driver" }).map((b) => b.id)).toEqual(["C"]);
    expect(applyFilters(list, { driver: "none" }).map((b) => b.id)).toEqual(["C"]);
    expect(applyFilters(list, { query: "ezy" }).map((b) => b.id)).toEqual(["B"]);
  });

  it("groups by date in pickup order", () => {
    const g = groupByDate(list);
    expect(g.get("2026-10-15").map((b) => b.id)).toEqual(["B", "D", "A"]);
    expect(gapBefore(g.get("2026-10-15"), 1)).toBe(90);
  });

  it("counts a period honestly", () => {
    const m = periodMetrics(list);
    expect(m).toMatchObject({ total: 3, confirmed: 2, reply: 1, driver: 1, airport: 1, revenue: 190, unpriced: 1 });
    expect(daySummary(list.filter((b) => b.travelDate === today))).toMatchObject({ total: 2, reply: 1, confirmed: 1, airport: 1, attention: true });
  });

  it("summarises driver load", () => {
    const load = driverLoad(list);
    expect(load.unassigned).toBe(1);
    expect(load.drivers[0]).toMatchObject({ id: "d1", name: "James" });
    expect(load.drivers[0].jobs.length).toBe(2);
  });
});

describe("coverage", () => {
  const month = periodFor("month", "2026-09-10");
  it("reports a period that starts before the loaded window", () => {
    expect(coverage(month, { windowStart: "2026-10-01", hasEarlier: true })).toMatchObject({ complete: false, missingEarlier: true });
    expect(coverage(month, { windowStart: "2026-10-01", hasEarlier: false }).complete).toBe(true);
  });
  it("reports a period past the last loaded page", () => {
    const nov = periodFor("month", "2026-11-10");
    expect(coverage(nov, { moreForward: true, lastLoaded: "2026-11-05" }).missingLater).toBe(true);
    expect(coverage(nov, { moreForward: false, lastLoaded: "2026-11-05" }).complete).toBe(true);
  });
});
