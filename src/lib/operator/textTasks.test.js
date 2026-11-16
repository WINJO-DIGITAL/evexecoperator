import { describe, it, expect } from "vitest";
import { textTasksFrom, smsHref } from "./textTasks";

const booking = (o = {}) => ({ ref: "EVX-1", travel_date: "2026-10-20", travel_time: "09:30", status: "Dispatched", ...o });

describe("textTasksFrom", () => {
  it("merges office tasks and partner reminders, oldest first", () => {
    const list = textTasksFrom(
      [{ id: "o1", kind: "confirmation", customer_name: "Amy", customer_phone: "07700", message: "m1", status: "pending", created_at: "2026-10-15T09:00:00Z", booking_id: "b1", bookings: booking() }],
      [{ id: "d1", reminder_type: "7day", customer_name: "Ben", customer_phone: "07711", message: "m2", status: "pending", created_at: "2026-10-14T09:00:00Z", booking_id: "b2", travel_date: "2026-10-21", travel_time: "06:00", drivers: { name: "Marks Taxi" }, bookings: booking() }],
      "2026-10-15",
    );
    expect(list.map((t) => t.key)).toEqual(["dr-d1", "op-o1"]);
    expect(list[0]).toMatchObject({ label: "Week-ahead reminder", partner: "Marks Taxi", travelDate: "2026-10-21", table: "driver_sms_reminders" });
    expect(list[1]).toMatchObject({ label: "Booking confirmation", partner: null, table: "operator_sms_tasks" });
  });

  it("drops texts for past or finished jobs, but keeps cancellation notices", () => {
    const list = textTasksFrom(
      [
        { id: "past", kind: "confirmation", bookings: booking({ travel_date: "2026-10-05" }) },
        { id: "done", kind: "confirmation", bookings: booking({ status: "Completed" }) },
        { id: "cx", kind: "cancellation", bookings: booking({ status: "Cancelled" }) },
        { id: "gone", kind: "confirmation", bookings: null },
      ],
      [],
      "2026-10-15",
    );
    expect(list.map((t) => t.id)).toEqual(["cx"]);
  });
});

describe("smsHref", () => {
  it("keeps only digits and + in the number and encodes the message", () => {
    expect(smsHref("07700 900 000", "Hi & bye")).toBe("sms:07700900000?&body=Hi%20%26%20bye");
  });
});
