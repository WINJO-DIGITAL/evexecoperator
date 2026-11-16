import { describe, it, expect } from "vitest";
import { bookingResponseText } from "./bookingResponseText";

const EV = { name: "EV Exec", phone: "07721 070370", site: "https://www.evexec.co.uk" };
const OTHER = { name: "Coastal Cars", phone: "07123 456789", site: "https://coastal.test" };
const NOTHING = { name: "", phone: "", site: "" };
const base = { first: "Jo", ref: "EVX-1", when: "14/03/2099 09:30", payUrl: "https://www.evexec.co.uk/booking?id=abc" };

// The wording EV Exec's customers have always received (before the text became per business).
const oldAccepted = (needsPay: boolean, free: string) =>
  `EV Exec: Hi Jo, your booking EVX-1 (14/03/2099 09:30) is confirmed.${needsPay ? ` Pay by card or choose cash: ${base.payUrl}` : ""} ${free ? `${free} ` : ""}Terms: evexec.co.uk/terms#cancellation Questions: 07721 070370`;
const oldRejected = `EV Exec: Hi Jo, unfortunately EV Exec cannot accommodate your requested journey (14/03/2099 09:30, Ref EVX-1). We apologise for the inconvenience. No payment has been taken. Questions: 07721 070370`;

describe("bookingResponseText", () => {
  it.each([
    [true, "Free cancellation until 12:00 on 12/03/2099."],
    [true, ""],
    [false, "Free cancellation until 12:00 on 12/03/2099."],
    [false, ""],
  ])("EV Exec's confirmation text is exactly as before (pay=%s, free=%j)", (needsPayment, freeCancellation) => {
    expect(bookingResponseText({ ...base, accepted: true, brand: EV, needsPayment, freeCancellation })).toBe(oldAccepted(needsPayment, freeCancellation));
  });

  it("EV Exec's 'not available' text is exactly as before", () => {
    expect(bookingResponseText({ ...base, accepted: false, brand: EV, needsPayment: true, freeCancellation: "" })).toBe(oldRejected);
  });

  it("another business's texts carry its own name, number and website, never EV Exec's", () => {
    const yes = bookingResponseText({ ...base, accepted: true, brand: OTHER, needsPayment: true, freeCancellation: "" });
    const no = bookingResponseText({ ...base, accepted: false, brand: OTHER, needsPayment: true, freeCancellation: "" });
    expect(yes).toMatch(/^Coastal Cars: Hi Jo/);
    expect(yes).toMatch(/Terms: coastal\.test\/terms#cancellation Questions: 07123 456789$/);
    expect(no).toMatch(/^Coastal Cars: Hi Jo, unfortunately Coastal Cars cannot accommodate/);
    for (const t of [yes, no]) expect(t).not.toMatch(/EV Exec|07721|070370/);
  });

  it("a business with no name, number or website leaves them out cleanly", () => {
    const yes = bookingResponseText({ ...base, accepted: true, brand: NOTHING, needsPayment: false, freeCancellation: "" });
    const no = bookingResponseText({ ...base, accepted: false, brand: NOTHING, needsPayment: false, freeCancellation: "" });
    expect(yes).toBe("Hi Jo, your booking EVX-1 (14/03/2099 09:30) is confirmed.");
    expect(no).toBe("Hi Jo, unfortunately we cannot accommodate your requested journey (14/03/2099 09:30, Ref EVX-1). We apologise for the inconvenience. No payment has been taken.");
  });
});
