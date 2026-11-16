import { describe, it, expect } from "vitest";
import { textTasksFrom } from "./textTasks";

const quoteRow = (over = {}) => ({
  id: "t1", kind: "quote", customer_name: "Sam", customer_phone: "07700 900123", message: "Hi", status: "pending",
  created_at: "2026-11-14T10:00:00Z", booking_id: null, bookings: null,
  quote_request_id: "q1", quote_requests: { status: "new", pickup_date: "2099-12-08" }, ...over,
});

describe("quote price texts on Texts to send", () => {
  it("shows an open quote's price text, labelled as a price quote", () => {
    const [t] = textTasksFrom([quoteRow()], [], "2026-11-14");
    expect(t.label).toBe("Price quote");
    expect(t.phone).toBe("07700 900123");
  });
  it("drops it once the quote is converted or dismissed", () => {
    expect(textTasksFrom([quoteRow({ quote_requests: { status: "converted", pickup_date: "2099-12-08" } })], [], "2026-11-14")).toHaveLength(0);
    expect(textTasksFrom([quoteRow({ quote_requests: { status: "dismissed", pickup_date: "2099-12-08" } })], [], "2026-11-14")).toHaveLength(0);
  });
  it("drops it once the journey date has passed", () => {
    expect(textTasksFrom([quoteRow({ quote_requests: { status: "new", pickup_date: "2020-01-01" } })], [], "2026-11-14")).toHaveLength(0);
  });
});
