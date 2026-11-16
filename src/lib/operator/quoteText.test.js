import { describe, it, expect } from "vitest";
import { parsePrice, quoteText, ddmmyyyy, quotePrice, smsLink } from "./quoteText";

describe("parsePrice", () => {
  it("accepts pounds with or without the sign and commas", () => {
    expect(parsePrice("170")).toEqual({ value: 170 });
    expect(parsePrice("£170")).toEqual({ value: 170 });
    expect(parsePrice("1,250.5")).toEqual({ value: 1250.5 });
  });
  it("rejects nonsense, zero and amounts over the limit", () => {
    expect(parsePrice("")).toHaveProperty("error");
    expect(parsePrice("abc")).toHaveProperty("error");
    expect(parsePrice("0")).toHaveProperty("error");
    expect(parsePrice("10001")).toHaveProperty("error");
    expect(parsePrice("12.345")).toHaveProperty("error");
  });
});

describe("quoteText", () => {
  const base = { businessName: "EV Exec", customerName: "Sam Jones", from: "Manchester Airport", to: "Kirkham", date: "2026-12-08", time: "18:30:00", price: 170, yesUrl: "https://example.test/quote-response?t=a&r=yes", noUrl: "https://example.test/quote-response?t=a&r=no" };

  it("uses first name, the route, DD/MM/YYYY, 24-hour time, the price and both links", () => {
    const t = quoteText(base);
    expect(t).toMatch(/^Hello Sam, thank you for your enquiry with EV Exec\./);
    expect(t).toContain("For Manchester Airport to Kirkham on 08/12/2026 at 18:30, we can do it for £170.");
    expect(t).toContain("To go ahead, tap: https://example.test/quote-response?t=a&r=yes");
    expect(t).toContain("Not going ahead, tap: https://example.test/quote-response?t=a&r=no");
    expect(t).toContain("Or leave it and we will not take it any further.");
    expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("adds the return trip and shows pence only when there are some", () => {
    const t = quoteText({ ...base, returnDate: "2026-12-10", returnTime: "17:45:00", price: 162.5 });
    expect(t).toContain("with the return on 10/12/2026 at 17:45");
    expect(t).toContain("£162.50");
  });

  it("still reads well with missing details", () => {
    const t = quoteText({ ...base, customerName: "", from: "", to: "", date: "", time: "" });
    expect(t).toContain("Hello there,");
    expect(t).toContain("For your journey, we can do it for £170.");
  });
});

describe("helpers", () => {
  it("formats dates and money", () => {
    expect(ddmmyyyy("2026-01-05")).toBe("05/01/2026");
    expect(quotePrice(170)).toBe("£170");
  });
  it("builds a two-tap sms link", () => {
    expect(smsLink("07700 900123", "Hi there")).toBe("sms:07700900123?&body=Hi%20there");
  });
});
