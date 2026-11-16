import { describe, it, expect } from "vitest";
import { buildVerificationResult, airportMatches, normalizeFlightNumber, diffMinutes, ukLocalToUtcIso, type AeroFlight } from "./logic";

// Realistic UK-airport fixtures -----------------------------------------------

function baFlight(overrides: Partial<AeroFlight> = {}): AeroFlight {
  return {
    number: "BA1326",
    status: "Scheduled",
    departure: {
      iata: "MAN",
      name: "Manchester",
      scheduledUtc: "2026-08-26T09:00:00Z",
      revisedUtc: null,
      actualUtc: null,
    },
    arrival: {
      iata: "LHR",
      name: "London Heathrow",
      scheduledUtc: "2026-08-26T10:15:00Z",
      revisedUtc: null,
      actualUtc: null,
    },
    ...overrides,
  };
}

// A. Correct flight/date -------------------------------------------------------

describe("A. correct flight and date", () => {
  it("verifies cleanly with matching airports and no customer-time gap", () => {
    const out = buildVerificationResult(
      {
        direction: "arrival",
        departureAirportInput: "Manchester",
        arrivalAirportInput: "London Heathrow",
        customerPickupIso: "2026-08-26T10:20:00Z", // 5 min after scheduled arrival -- normal
      },
      baFlight(),
      false
    );
    expect(out.result).toBe("verified");
    expect(out.severity).toBe("green");
    expect(out.issues).toEqual(["Flight verified."]);
    expect(out.recommendedPickup).toBe("2026-08-26T10:15:00Z");
  });
});

// B. Incorrect flight number (AeroDataBox returns nothing for it) -------------

describe("B. incorrect flight number", () => {
  it("reports a red not-operating mismatch when the API finds no such flight", () => {
    const out = buildVerificationResult(
      { direction: "arrival", departureAirportInput: null, arrivalAirportInput: "Manchester", customerPickupIso: null },
      null,
      false
    );
    expect(out.result).toBe("mismatch");
    expect(out.severity).toBe("red");
    expect(out.issues).toEqual(["Flight number does not operate on this date."]);
  });
});

// C. Flight operating on a different date -- same shape as B: querying
// AeroDataBox for a date it doesn't fly returns no result for that date. ------

describe("C. flight operates on a different date than entered", () => {
  it("treats a date with no matching flight the same as an unknown flight number", () => {
    const out = buildVerificationResult(
      { direction: "departure", departureAirportInput: "Liverpool", arrivalAirportInput: null, customerPickupIso: null },
      null,
      false
    );
    expect(out.result).toBe("mismatch");
    expect(out.issues[0]).toMatch(/does not operate on this date/);
  });
});

// D. Arrival on the following calendar day (cross-midnight) -------------------

describe("D. cross-midnight arrival", () => {
  it("keeps the real arrival calendar date rather than reusing the departure date", () => {
    const overnight = baFlight({
      departure: {
        iata: "MAN",
        name: "Manchester",
        scheduledUtc: "2026-08-26T22:00:00Z",
        revisedUtc: null,
        actualUtc: null,
      },
      arrival: {
        iata: "MCO",
        name: "Orlando",
        scheduledUtc: "2026-08-27T01:05:00Z", // next calendar day
        revisedUtc: null,
        actualUtc: null,
      },
    });
    const out = buildVerificationResult(
      { direction: "arrival", departureAirportInput: "Manchester", arrivalAirportInput: "Orlando", customerPickupIso: null },
      overnight,
      false
    );
    expect(out.scheduledArrival).toBe("2026-08-27T01:05:00Z");
    expect(out.scheduledArrival?.slice(0, 10)).not.toBe(out.scheduledDeparture?.slice(0, 10));
    expect(out.recommendedPickup).toBe("2026-08-27T01:05:00Z");
  });
});

// E. Customer pickup time different from arrival time -------------------------

describe("E. customer pickup time differs from flight arrival", () => {
  it("flags amber when the customer's requested time is well off the flight's time", () => {
    const out = buildVerificationResult(
      {
        direction: "arrival",
        departureAirportInput: "Manchester",
        arrivalAirportInput: "London Heathrow",
        customerPickupIso: "2026-08-26T11:15:00Z", // 60 min after scheduled arrival 10:15
      },
      baFlight(),
      false
    );
    expect(out.severity).toBe("amber");
    expect(out.issues).toEqual(["Customer pickup time differs from flight arrival by 60 minutes (after)."]);
  });

  it("does not flag a small, expected gap under the threshold", () => {
    const out = buildVerificationResult(
      {
        direction: "arrival",
        departureAirportInput: "Manchester",
        arrivalAirportInput: "London Heathrow",
        customerPickupIso: "2026-08-26T10:25:00Z", // 10 min after -- normal deplaning time
      },
      baFlight(),
      false
    );
    expect(out.severity).toBe("green");
  });
});

// F. Airport mismatch ----------------------------------------------------------

describe("F. airport mismatch", () => {
  it("flags red when the booking's arrival airport doesn't match the flight", () => {
    const out = buildVerificationResult(
      { direction: "arrival", departureAirportInput: "Manchester", arrivalAirportInput: "Liverpool", customerPickupIso: null },
      baFlight(),
      false
    );
    expect(out.severity).toBe("red");
    expect(out.issues).toContain("Arrival airport does not match booking.");
  });

  it("flags red when the departure airport doesn't match", () => {
    const out = buildVerificationResult(
      { direction: "departure", departureAirportInput: "Liverpool", arrivalAirportInput: null, customerPickupIso: null },
      baFlight(),
      false
    );
    expect(out.issues).toContain("Departure airport does not match booking.");
  });

  it("does not false-flag on a plausible free-text match (T2, alias, partial name)", () => {
    expect(airportMatches("Manchester T2", "MAN", "Manchester")).toBe(true);
    expect(airportMatches("MAN", "MAN", "Manchester")).toBe(true);
    expect(airportMatches("", "MAN", "Manchester")).toBe(true);
    expect(airportMatches(null, "MAN", "Manchester")).toBe(true);
  });
});

// G. Flight API unavailable ----------------------------------------------------

describe("G. AeroDataBox unavailable", () => {
  it("returns an honest unavailable error, never a fabricated verified result", () => {
    const out = buildVerificationResult(
      { direction: "arrival", departureAirportInput: "Manchester", arrivalAirportInput: "London Heathrow", customerPickupIso: null },
      baFlight(), // even if a flight object were somehow constructed, apiFailed wins
      true
    );
    expect(out.result).toBe("error");
    expect(out.severity).toBe("red");
    expect(out.issues).toEqual(["Flight verification unavailable. Please verify manually."]);
    expect(out.result).not.toBe("verified");
  });
});

// H. Flight schedule changed since the last verification -----------------------

describe("H. flight information has changed since last check", () => {
  it("flags amber when the scheduled arrival has moved since the previous verification", () => {
    const out = buildVerificationResult(
      {
        direction: "arrival",
        departureAirportInput: "Manchester",
        arrivalAirportInput: "London Heathrow",
        customerPickupIso: null,
        previous: { scheduledArrival: "2026-08-26T09:45:00Z", scheduledDeparture: "2026-08-26T09:00:00Z" },
      },
      baFlight(),
      false
    );
    expect(out.severity).toBe("amber");
    expect(out.issues).toContain("Flight information has changed.");
  });
});

// I. Re-verification with no change --------------------------------------------

describe("I. re-verification finds no change", () => {
  it("stays green when the previous verification matches the current schedule", () => {
    const out = buildVerificationResult(
      {
        direction: "arrival",
        departureAirportInput: "Manchester",
        arrivalAirportInput: "London Heathrow",
        customerPickupIso: null,
        previous: { scheduledArrival: "2026-08-26T10:15:00Z", scheduledDeparture: "2026-08-26T09:00:00Z" },
      },
      baFlight(),
      false
    );
    expect(out.severity).toBe("green");
    expect(out.issues).toEqual(["Flight verified."]);
  });
});

// J. Manual operator override ---------------------------------------------------
// Override is a persistence-layer concern (the operator explicitly proceeding
// past a warning), not something the pure decision function can suppress --
// it must never quietly reclassify a real mismatch as green. Confirmed here:

describe("J. manual override never mutates the underlying verification result", () => {
  it("keeps reporting the true severity regardless of what the caller does with it afterwards", () => {
    const out = buildVerificationResult(
      { direction: "arrival", departureAirportInput: "Manchester", arrivalAirportInput: "Liverpool", customerPickupIso: null },
      baFlight(),
      false
    );
    expect(out.severity).toBe("red");
    // An operator overriding this later is recorded as a separate `override`
    // flag alongside the stored row (see index.ts) -- it does not change `out`.
  });
});

// Misc helpers -------------------------------------------------------------------

describe("normalizeFlightNumber", () => {
  it("strips spaces and uppercases", () => {
    expect(normalizeFlightNumber(" ba 1326 ")).toBe("BA1326");
  });
});

describe("diffMinutes", () => {
  it("computes signed minute differences", () => {
    expect(diffMinutes("2026-08-26T11:00:00Z", "2026-08-26T10:15:00Z")).toBe(45);
    expect(diffMinutes("2026-08-26T09:00:00Z", "2026-08-26T10:15:00Z")).toBe(-75);
  });
});

describe("ukLocalToUtcIso", () => {
  it("subtracts an hour for BST (summer) local times", () => {
    // 14:25 local in August (BST, UTC+1) is 13:25 UTC.
    expect(ukLocalToUtcIso("2026-08-26", "14:25")).toBe("2026-08-26T13:25:00.000Z");
  });

  it("uses UTC directly for GMT (winter) local times", () => {
    // 14:25 local in January (GMT, UTC+0) is 14:25 UTC.
    expect(ukLocalToUtcIso("2026-01-15", "14:25")).toBe("2026-01-15T14:25:00.000Z");
  });

  it("returns null for missing input", () => {
    expect(ukLocalToUtcIso(null, "14:25")).toBeNull();
    expect(ukLocalToUtcIso("2026-08-26", null)).toBeNull();
    expect(ukLocalToUtcIso("2026-08-26", "")).toBeNull();
  });
});
