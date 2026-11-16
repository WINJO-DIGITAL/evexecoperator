import { describe, it, expect } from "vitest";
import { checkFees, formatFee, penceToPounds, poundsToPence } from "./fees";

describe("fee amounts", () => {
  it("converts pounds to pence and back", () => {
    expect(poundsToPence("49")).toBe(4900);
    expect(poundsToPence("£999.00")).toBe(99900);
    expect(poundsToPence("1,250.50")).toBe(125050);
    expect(penceToPounds(4900)).toBe("49.00");
    expect(formatFee(99900)).toBe("£999.00");
  });
  it("blank means use the default; text that is not an amount is refused", () => {
    expect(poundsToPence("")).toBeNull();
    expect(poundsToPence("  ")).toBeNull();
    for (const bad of ["abc", "-5", "1.234", "49p", "1e3"]) expect(Number.isNaN(poundsToPence(bad))).toBe(true);
  });
  it("zero is a real amount (free), not blank", () => {
    expect(poundsToPence("0")).toBe(0);
    expect(checkFees({ monthly: "0", setup: "0", allowBlank: true })).toMatchObject({ error: null, monthly: 0, setup: 0 });
  });
});

describe("checkFees", () => {
  it("accepts a business rate with a blank set-up fee", () => {
    expect(checkFees({ monthly: "25", setup: "", allowBlank: true })).toMatchObject({ error: null, monthly: 2500, setup: null });
  });
  it("needs both default fees", () => {
    expect(checkFees({ monthly: "49", setup: "", allowBlank: false }).error).toMatch(/required/);
  });
  it("refuses amounts above the limits", () => {
    expect(checkFees({ monthly: "10000.01", setup: "1", allowBlank: false }).error).toMatch(/monthly fee/);
    expect(checkFees({ monthly: "1", setup: "100000.01", allowBlank: false }).error).toMatch(/set-up fee/);
  });
  it("refuses something that is not an amount", () => {
    expect(checkFees({ monthly: "lots", setup: "1", allowBlank: true }).error).toMatch(/pounds/);
  });
});
