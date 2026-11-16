import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv, bookingsToCsv } from "./csv";
import type { DbBooking } from "./database.types";

describe("escapeCsvField", () => {
  it("returns an empty string for null or undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("returns plain values unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(true)).toBe("true");
  });

  it("wraps and escapes values containing commas", () => {
    expect(escapeCsvField("Smith, John")).toBe('"Smith, John"');
  });

  it("wraps and doubles embedded quotes", () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("wraps values containing newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and fields with commas", () => {
    const csv = toCsv([
      ["A", "B"],
      ["1", "2, 3"],
    ]);
    expect(csv).toBe('A,B\r\n1,"2, 3"');
  });
});

function makeBooking(overrides: Partial<DbBooking> = {}): DbBooking {
  return {
    id: "1",
    ref: "EV1001",
    customer_name: "Jane Doe",
    customer_phone: "07123456789",
    customer_email: "jane@example.com",
    flight_number: "BA123",
    direction: "Airport → Destination",
    airport: "Heathrow",
    dropoff_address: "Central London",
    travel_date: "2026-07-01",
    travel_time: "09:30:00",
    pickup_time: "2026-07-01T09:30:00.000Z",
    driver_id: null,
    quoted_price: 85,
    status: "Unassigned",
    payment_status: "Unpaid",
    priority: false,
    notes: null,
    updated_at: null,
    created_at: null,
    drivers: null,
    ...overrides,
  };
}

describe("bookingsToCsv", () => {
  it("includes the header row", () => {
    const csv = bookingsToCsv([]);
    expect(csv).toBe("Ref,Date,Time,Customer,Phone,Email,Pickup,Dropoff,Flight,Driver,Price,Status,Payment Status");
  });

  it("formats a booking row, trimming seconds from travel_time", () => {
    const csv = bookingsToCsv([makeBooking()]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe("EV1001,2026-07-01,09:30,Jane Doe,07123456789,jane@example.com,Heathrow,Central London,BA123,,85,Unassigned,Unpaid");
  });

  it("uses the joined driver name when present", () => {
    const csv = bookingsToCsv([makeBooking({ drivers: { name: "Alex Driver" } })]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toContain("Alex Driver");
  });

  it("escapes addresses containing commas", () => {
    const csv = bookingsToCsv([makeBooking({ dropoff_address: "10 Downing St, London" })]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toContain('"10 Downing St, London"');
  });
});