import { describe, expect, it } from "vitest";
import { ukDateOf, ukHourOf, ukToIso } from "./dates";

describe("UK clock helpers", () => {
  it("reads summer (BST) times as UTC+1", () => {
    expect(ukToIso("2026-10-15", "09:00")).toBe("2026-10-15T08:00:00.000Z");
    expect(ukToIso("2026-07-01", "00:30:00")).toBe("2026-06-30T23:30:00.000Z");
  });
  it("reads winter (GMT) times as UTC", () => {
    expect(ukToIso("2026-12-01", "04:30")).toBe("2026-12-01T04:30:00.000Z");
  });
  it("handles the days the clocks change", () => {
    expect(ukToIso("2026-10-25", "03:00")).toBe("2026-10-25T03:00:00.000Z"); // after clocks go back
    expect(ukToIso("2026-03-29", "03:00")).toBe("2026-03-29T02:00:00.000Z"); // after clocks go forward
  });
  it("returns null for missing or bad input", () => {
    expect(ukToIso(null, "09:00")).toBeNull();
    expect(ukToIso("2026-10-15", "")).toBeNull();
    expect(ukToIso("15/10/2026", "09:00")).toBeNull();
  });
  it("gives the UK date and hour of a moment", () => {
    expect(ukDateOf("2026-06-30T23:30:00Z")).toBe("2026-07-01");
    expect(ukHourOf("2026-06-30T23:30:00Z")).toBe(0);
    expect(ukHourOf("2026-12-01T04:30:00Z")).toBe(4);
    expect(ukDateOf(null)).toBeNull();
  });
});
