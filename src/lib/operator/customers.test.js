import { describe, it, expect } from "vitest";
import { groupCustomers, normPhone } from "./customers";

const b = (o) => ({ id: Math.random().toString(36).slice(2), customer: "Jane Doe", phone: null, email: null, status: "Completed", price: "£90", paymentStatus: "Paid", travelDate: "2026-10-01", time: "09:00", ...o });

describe("customers", () => {
  it("normalises UK phone formats", () => {
    expect(normPhone("+44 7700 900000")).toBe("07700900000");
    expect(normPhone("07700 900000")).toBe("07700900000");
    expect(normPhone("12")).toBe("");
  });

  it("merges bookings that share a phone or an email (transitively)", () => {
    const list = [
      b({ phone: "+44 7700 900000" }),
      b({ phone: "07700900000", email: "jane@example.com" }),
      b({ email: "JANE@example.com", travelDate: "2026-10-20", status: "Dispatched" }),
      b({ customer: "Tom", phone: "07123456789" }),
    ];
    const cs = groupCustomers(list, "2026-10-14");
    expect(cs).toHaveLength(2);
    const jane = cs.find((c) => c.name === "Jane Doe");
    expect(jane.trips).toBe(3);
    expect(jane.email).toBe("JANE@example.com");
    expect(jane.nextTrip.travelDate).toBe("2026-10-20");
    expect(jane.lastTrip).toBe("2026-10-01");
    expect(jane.spend).toBe(180);
  });

  it("counts unpaid completed trips, but not cash or cancelled ones", () => {
    const cs = groupCustomers([
      b({ phone: "07700900000", paymentStatus: "Unpaid" }),
      b({ phone: "07700900000", paymentStatus: "Unpaid", paymentMethod: "Cash" }),
      b({ phone: "07700900000", status: "Cancelled", paymentStatus: "Unpaid" }),
    ], "2026-10-14");
    expect(cs[0].unpaid).toBe(90);
    expect(cs[0].spend).toBe(90); // the cash trip counts as paid
    expect(cs[0].trips).toBe(2);
  });

  it("a trip completed today is the last trip, not the next", () => {
    const [c] = groupCustomers([b({ phone: "07700900000", travelDate: "2026-10-14" })], "2026-10-14");
    expect(c.lastTrip).toBe("2026-10-14");
    expect(c.nextTrip).toBeNull();
  });

  it("skips bookings with no phone or email", () => {
    expect(groupCustomers([b({})], "2026-10-14")).toHaveLength(0);
  });
});
