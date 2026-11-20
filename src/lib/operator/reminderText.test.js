import { describe, it, expect } from "vitest";
import { whenText, reminderMessage, reminderHref } from "./reminderText";

const b = { customer: "Olivia Bennett", route: "12 Harbour View → Manchester Airport (MAN)", travelDate: "2026-11-25", time: "06:15", phone: "07700 900101", driverId: "d1", driver: "Daniel Price" };

describe("reminder wording", () => {
  it("counts by UK calendar date", () => {
    expect(whenText("2026-11-25", "2026-11-25")).toBe("today");
    expect(whenText("2026-11-25", "2026-11-24")).toBe("tomorrow");
    expect(whenText("2026-11-25", "2026-11-20")).toBe("in 5 days");
  });
  it("writes the date DD/MM/YYYY and time HH:MM with the driver and phone", () => {
    const m = reminderMessage(b, "2026-11-24", { contactPhone: "01253 000000" });
    expect(m).toContain("Hi Olivia, reminder: your EV Exec transfer is tomorrow.");
    expect(m).toContain("25/11/2026 at 06:15");
    expect(m).toContain("Your driver is Daniel Price.");
    expect(m).toContain("Questions: 01253 000000");
    expect(m).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it("needs a phone number, date and time to make a link", () => {
    expect(reminderHref({ ...b, phone: null }, "2026-11-24")).toBeNull();
    expect(reminderHref(b, "2026-11-24")).toMatch(/^sms:07700900101\?&body=/);
  });
});
