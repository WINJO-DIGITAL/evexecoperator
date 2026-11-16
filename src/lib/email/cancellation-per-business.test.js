import { describe, it, expect, beforeEach } from "vitest";
import { _setBrands } from "./brand.js";
import { freeCancellationLine, chargeStarts, bandsFor, pickupInstant } from "./cancellation.js";

// The Operator app's copy of the charge rules must match the website's: an
// operator's own bands on the current terms, fixed bands otherwise.
const COASTAL = "dddddddd-0000-4000-8000-000000000002";
const EV = "00000000-0000-0000-0000-000000000001";
const booking = (over = {}) => ({
  travel_date: "2026-12-01", travel_time: "12:00", status: "Dispatched", operator_response: "accepted",
  source: "website", quoted_price: 100, payment_status: "Unpaid", terms_version: "4", tenant_id: COASTAL, ...over,
});
// The charge percentages that start after the free period, in order.
const schedule = (b, version = b.terms_version || "4") => {
  const pickup = pickupInstant(b.travel_date, b.travel_time);
  return chargeStarts(version, pickup, bandsFor(b, version)).map((s) => s.pct);
};

const OWN = { standard: [{ hours: 72, pct: 0 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 }] };

beforeEach(() => {
  _setBrands({
    [EV]: { name: "EV Exec", brand: {} },
    [COASTAL]: { name: "Coastal Cars", brand: { legal: { policy: OWN } } },
  });
});

describe("an operator's own bands", () => {
  it("set the charges for its bookings on the current terms", () => {
    expect(schedule(booking())).toEqual([50, 75, 100]);
  });

  it("set the free-cancellation deadline in the confirmation text", () => {
    expect(freeCancellationLine(booking(), new Date("2026-11-20T00:00:00Z"))).toBe("Free cancellation until 12:00 on 28/11/2026.");
  });

  it("are not used for bookings on an older terms version", () => {
    expect(schedule(booking({ terms_version: "3" }), "3")).toEqual([25, 50, 100]);
  });

  it("are not used for EV Exec, or for a booking with no business", () => {
    expect(schedule(booking({ tenant_id: EV }))).toEqual([25, 50, 100]);
    expect(schedule(booking({ tenant_id: null }))).toEqual([25, 50, 100]);
  });

  it("are ignored if the first band is not free, and the standard bands are used", () => {
    _setBrands({ [COASTAL]: { name: "X", brand: { legal: { policy: { standard: [
      { hours: 72, pct: 10 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 },
    ] } } } } });
    expect(schedule(booking())).toEqual([25, 50, 100]);
  });
});
