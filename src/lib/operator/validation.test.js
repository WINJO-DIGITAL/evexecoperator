import { describe, it, expect } from "vitest";
import {
  validateBookingPayload,
  validateStatusTransition,
  validateOptionalDate,
  sanitizeText,
  generateBookingRef,
  ValidationError,
  STATUS_TRANSITIONS,
  BOOKING_STATUSES,
} from "./validation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tomorrow() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function validForm(overrides = {}) {
  return {
    customer: "James Whitmore",
    phone: "+44 7700 900000",
    email: "",
    pickup: "Manchester Airport (MAN)",
    dropoff: "Blackpool",
    date: tomorrow(),
    time: "10:00",
    flight: "EK017",
    notes: "",
    price: 160,
    ...overrides,
  };
}

// ─── validateBookingPayload ───────────────────────────────────────────────────

describe("validateBookingPayload", () => {
  it("passes for a fully valid form", () => {
    expect(() => validateBookingPayload(validForm())).not.toThrow();
  });

  it("throws when payload is null", () => {
    expect(() => validateBookingPayload(null)).toThrowError(ValidationError);
  });

  it("throws when customer name is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ customer: "" })));
    expect(err.field).toBe("customer");
  });

  it("throws when customer name is whitespace only", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ customer: "   " })));
    expect(err.field).toBe("customer");
  });

  it("throws when customer name exceeds 120 characters", () => {
    const err = getValidationError(() =>
      validateBookingPayload(validForm({ customer: "A".repeat(121) }))
    );
    expect(err.field).toBe("customer");
  });

  it("throws when phone is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ phone: "" })));
    expect(err.field).toBe("phone");
  });

  it("throws when pickup is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ pickup: "" })));
    expect(err.field).toBe("pickup");
  });

  it("throws when pickup is whitespace only", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ pickup: "   " })));
    expect(err.field).toBe("pickup");
  });

  it("throws when dropoff is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ dropoff: "" })));
    expect(err.field).toBe("dropoff");
  });

  it("throws when dropoff is whitespace only", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ dropoff: "   " })));
    expect(err.field).toBe("dropoff");
  });

  it("passes with a free-text pickup and drop-off (any address)", () => {
    expect(() =>
      validateBookingPayload(validForm({ pickup: "42 Fake Street", dropoff: "Liverpool John Lennon Airport" }))
    ).not.toThrow();
  });

  it("throws when date is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ date: "" })));
    expect(err.field).toBe("date");
  });

  it("throws when time is missing", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ time: "" })));
    expect(err.field).toBe("time");
  });

  it("throws when date+time is not a valid ISO string", () => {
    const err = getValidationError(() =>
      validateBookingPayload(validForm({ date: "not-a-date", time: "10:00" }))
    );
    expect(err.field).toBe("date");
  });

  it("throws when pickup time is more than 24 hours in the past", () => {
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const err = getValidationError(() =>
      validateBookingPayload(
        validForm({
          date: past.toISOString().slice(0, 10),
          time: past.toTimeString().slice(0, 5),
        })
      )
    );
    expect(err.field).toBe("date");
    expect(err.message).toMatch(/past/i);
  });

  it("throws when pickup time is more than 2 years in the future", () => {
    const far = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000);
    const err = getValidationError(() =>
      validateBookingPayload(
        validForm({
          date: far.toISOString().slice(0, 10),
          time: "10:00",
        })
      )
    );
    expect(err.field).toBe("date");
    expect(err.message).toMatch(/future/i);
  });

  it("throws for negative price", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ price: -1 })));
    expect(err.field).toBe("price");
  });

  it("throws for price exceeding £10,000", () => {
    const err = getValidationError(() => validateBookingPayload(validForm({ price: 10001 })));
    expect(err.field).toBe("price");
  });

  it("accepts price of 0 (complimentary transfer)", () => {
    expect(() => validateBookingPayload(validForm({ price: 0 }))).not.toThrow();
  });

  it("accepts null price (TBC)", () => {
    expect(() => validateBookingPayload(validForm({ price: null }))).not.toThrow();
  });

  it("throws when notes exceed 500 characters", () => {
    const err = getValidationError(() =>
      validateBookingPayload(validForm({ notes: "x".repeat(501) }))
    );
    expect(err.field).toBe("notes");
  });

  it("throws when flight number exceeds 12 characters", () => {
    const err = getValidationError(() =>
      validateBookingPayload(validForm({ flight: "TOOLONGFLIGHT1" }))
    );
    expect(err.field).toBe("flight");
  });
});

// ─── validateStatusTransition ─────────────────────────────────────────────────

describe("validateStatusTransition", () => {
  it("allows Dispatched → En Route", () => {
    expect(() => validateStatusTransition("Dispatched", "En Route")).not.toThrow();
  });

  it("allows En Route → Passenger On Board", () => {
    expect(() =>
      validateStatusTransition("En Route", "Passenger On Board")
    ).not.toThrow();
  });

  it("allows Passenger On Board → Completed", () => {
    expect(() =>
      validateStatusTransition("Passenger On Board", "Completed")
    ).not.toThrow();
  });

  it("allows any non-terminal status → Cancelled", () => {
    const nonTerminal = ["Unassigned", "Dispatched", "En Route", "Passenger On Board"];
    for (const from of nonTerminal) {
      expect(() => validateStatusTransition(from, "Cancelled")).not.toThrow();
    }
  });

  it("allows Unassigned → Unassigned / Missed Call Recovery", () => {
    expect(() =>
      validateStatusTransition("Unassigned", "Unassigned / Missed Call Recovery")
    ).not.toThrow();
  });

  it("throws when transitioning from terminal Completed", () => {
    expect(() => validateStatusTransition("Completed", "Dispatched")).toThrowError(
      ValidationError
    );
  });

  it("throws when transitioning from terminal Cancelled", () => {
    expect(() => validateStatusTransition("Cancelled", "En Route")).toThrowError(
      ValidationError
    );
  });

  it("allows a one-step reverse (operator correction: En Route → Dispatched)", () => {
    expect(() => validateStatusTransition("En Route", "Dispatched")).not.toThrow();
  });

  it("allows reversing a completed job back a step (Completed → Passenger On Board)", () => {
    expect(() => validateStatusTransition("Completed", "Passenger On Board")).not.toThrow();
  });

  it("still throws on a multi-step skip-back (En Route → Unassigned)", () => {
    expect(() => validateStatusTransition("En Route", "Unassigned")).toThrowError(
      ValidationError
    );
  });

  it("defers to the DB for a driver-only source state (Arrived → En Route)", () => {
    expect(() => validateStatusTransition("Arrived", "En Route")).not.toThrow();
  });

  it("throws on skip-ahead transition (Dispatched → Completed)", () => {
    expect(() => validateStatusTransition("Dispatched", "Completed")).toThrowError(
      ValidationError
    );
  });

  it("silently passes when `from` is null (new record)", () => {
    expect(() => validateStatusTransition(null, "Dispatched")).not.toThrow();
  });

  it("includes allowed statuses in error message", () => {
    let message = "";
    try {
      validateStatusTransition("Dispatched", "Completed");
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/En Route/);
    expect(message).toMatch(/Cancelled/);
  });
});

// ─── validateOptionalDate ─────────────────────────────────────────────────────

describe("validateOptionalDate", () => {
  it("returns a valid YYYY-MM-DD date unchanged", () => {
    expect(validateOptionalDate("2027-01-01", "Licence expiry")).toBe("2027-01-01");
  });

  it("trims whitespace before validating", () => {
    expect(validateOptionalDate("  2027-01-01  ", "Licence expiry")).toBe("2027-01-01");
  });

  it("returns null for an empty string", () => {
    expect(validateOptionalDate("", "Licence expiry")).toBeNull();
  });

  it("returns null for null", () => {
    expect(validateOptionalDate(null, "Licence expiry")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(validateOptionalDate(undefined, "Licence expiry")).toBeNull();
  });

  it("throws ValidationError with the field label for an invalid date string", () => {
    expect(() => validateOptionalDate("not-a-date", "Licence expiry")).toThrowError(
      ValidationError
    );
    expect(() => validateOptionalDate("not-a-date", "Licence expiry")).toThrow(
      /Licence expiry/
    );
  });

  it("throws for a date string not matching YYYY-MM-DD", () => {
    expect(() => validateOptionalDate("01/01/2027", "Insurance expiry")).toThrow(
      /Insurance expiry/
    );
  });
});

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe("sanitizeText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ", 50)).toBe("hello");
  });

  it("truncates to maxLen after trimming", () => {
    expect(sanitizeText("abcdef", 3)).toBe("abc");
  });

  it("returns the original value for non-strings", () => {
    expect(sanitizeText(null, 10)).toBeNull();
    expect(sanitizeText(42, 10)).toBe(42);
  });

  it("handles an empty string", () => {
    expect(sanitizeText("", 10)).toBe("");
  });
});

// ─── generateBookingRef ───────────────────────────────────────────────────────

describe("generateBookingRef", () => {
  it("returns a string matching EVX-XXXXXXXXX format", () => {
    const ref = generateBookingRef();
    expect(ref).toMatch(/^EVX-[A-Z0-9]{7,12}$/);
  });

  it("generates unique refs on successive calls", () => {
    const refs = new Set(Array.from({ length: 1000 }, () => generateBookingRef()));
    expect(refs.size).toBe(1000);
  });
});

// ─── Status coverage check ────────────────────────────────────────────────────

describe("STATUS_TRANSITIONS coverage", () => {
  it("has a transition entry for every status in BOOKING_STATUSES", () => {
    for (const status of BOOKING_STATUSES) {
      expect(STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });

  it("all allowed targets are themselves valid statuses", () => {
    for (const [, targets] of Object.entries(STATUS_TRANSITIONS)) {
      for (const t of targets) {
        expect(BOOKING_STATUSES).toContain(t);
      }
    }
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function getValidationError(fn) {
  let caught;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ValidationError);
  return caught;
}
