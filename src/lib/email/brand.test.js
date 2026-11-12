// Whose emails these are (brand.js): each email carries the booking's own
// business. EV Exec's must read exactly as before; another business must never
// show EV Exec's name, number or licence.
import { describe, it, expect, beforeEach } from "vitest";
import * as C from "./content.js";
import * as S from "./staff.js";
import { _setBrands, fromRow, displayPhone, telNumber, brandFor, EV_EXEC } from "./brand.js";

const EV = "00000000-0000-0000-0000-000000000001";
const COASTAL = "dddddddd-0000-4000-8000-000000000002";
const BARE = "eeeeeeee-0000-4000-8000-000000000003";
// EV Exec exactly as its live row is: the phone has no space.
const EV_ROW = { name: "EV Exec", contact_email: "book@evexec.co.uk", contact_phone: "07721070370", brand: { invoice: { business_name: "EV Exec" } } };
const COASTAL_ROW = {
  name: "Coastal Cars", contact_email: "hello@coastal.test", contact_phone: "+44 7123 456789",
  brand: { licence: "PHO1234", site_url: "https://coastal.test/", tagline: "Airport transfers from Southport", colors: { primary: "#123456", accent: "#FF8800" } },
};
const BARE_ROW = { name: "Bare Business", contact_email: null, contact_phone: null, brand: {} };

const booking = (tenant_id) => ({
  id: "11111111-1111-4111-8111-111111111111", ref: "EVX-BRAND1", customer_name: "Jo Bloggs", customer_phone: "07000000001", customer_email: "jo@example.test",
  travel_date: "2099-03-14", travel_time: "09:30:00", pickup_location: "1 Test Street, Southport", dropoff_address: "Liverpool Airport", airport: "Liverpool Airport",
  status: "Dispatched", payment_status: "Unpaid", quoted_price: 90, passengers: 2, luggage: "2 bags", flight_number: "EZY123", journey_type: "To Airport",
  notes: "", return_journey: false, driver_notes: "", tenant_id,
});
const drv = { full_name: "Sam Driver", phone: "07000000002", vehicle_model: "Tesla Model Y", vehicle_registration: "AB12CDE" };

beforeEach(() => _setBrands({ [EV]: EV_ROW, [COASTAL]: COASTAL_ROW, [BARE]: BARE_ROW }));

const everyEmail = (b) => ({
  requestReceived: C.requestReceived(b, { cancelUrl: "https://x.test/c" }),
  bookingConfirmed: C.bookingConfirmed(b, { payUrl: "https://x.test/p" }),
  bookingUnavailable: C.bookingUnavailable(b),
  paymentReceived: C.paymentReceived({ ...b, payment_status: "Paid", payment_method: "Card" }),
  cashChosen: C.cashChosen({ ...b, payment_method: "Cash" }),
  cancelledByCustomer: C.cancelledByCustomer(b),
  cancelledByUs: C.cancelledByUs(b),
  reminder: C.reminder(b, { type: "24hr", driver: drv }),
  driverOnTheWay: C.driverOnTheWay(b, { driver: drv }),
  driverArrived: C.driverArrived(b, { driver: drv }),
  quoteReceived: C.quoteReceived({ tenant_id: b.tenant_id, customer_name: "Jo", pickup_location: "A", destination: "B", pickup_date: "2099-03-14" }),
  paymentLink: C.paymentLink(b, { url: "https://x.test/pay", amount: 90 }),
  invoice: C.invoice({ tenant_id: b.tenant_id, number: "INV-1", customer_name: "Jo", total: 90, terms: "Pay in 15 days", due: "2099-04-01", status: "Unpaid", journey: "A to B" }),
  journeyReceipt: C.journeyReceipt(b, { amount: 90, driver: drv }),
  staffNewBooking: C.staffNewBooking(b, { acceptUrl: "https://x.test/a", rejectUrl: "https://x.test/r" }),
  staffPayment: C.staffPayment({ ...b, payment_status: "Paid", payment_method: "Card" }, { paid: true }),
  staffCustomerCancelled: C.staffCustomerCancelled(b),
  staffNewQuote: C.staffNewQuote({ tenant_id: b.tenant_id, customer_name: "Jo", phone: "07000000001", email: "j@x.test", pickup_location: "A", destination: "B" }),
  staffDuplicatePayment: C.staffDuplicatePayment(b, { amount: 90, stripeId: "pi_1" }),
  driverNewJob: C.driverNewJob(b),
  driverReminder: C.driverReminder(b, { type: "24h" }),
  driverJobCancelled: C.driverJobCancelled(b),
  driverJobUpdated: C.driverJobUpdated(b),
  driverConfirmPickup: C.driverConfirmPickup(b),
  staffDriverNotConfirmed: C.staffDriverNotConfirmed(b, { driver: drv }),
  teamInvite: S.teamInvite({ tenant_id: b.tenant_id, businessName: "Coastal Cars", inviterName: "Sam", role: "dispatcher", url: "https://x.test/t", newAccount: true }),
  passwordReset: S.passwordReset({ tenant_id: b.tenant_id, businessName: "Coastal Cars", url: "https://x.test/r" }),
  driverInvite: S.driverInvite({ tenant_id: b.tenant_id, businessName: "Coastal Cars", driverName: "Sam Driver", inviterName: "Jo", url: "https://x.test/d", newAccount: true }),
});

describe("business details", () => {
  it("formats phone numbers the house way and builds tel: numbers", () => {
    expect(displayPhone("07721070370")).toBe("07721 070370");
    expect(displayPhone("+44 7721 070370")).toBe("07721 070370");
    expect(displayPhone("01253 123456")).toBe("01253 123456");
    expect(telNumber("07721 070370")).toBe("+447721070370");
    expect(telNumber("")).toBe("");
  });

  it("EV Exec's live database row gives exactly the built-in EV Exec details", () => {
    const b = fromRow({ id: EV, ...EV_ROW });
    for (const k of ["name", "wordmark", "phone", "email", "licence", "site", "tagline", "primary", "accent"]) expect(b[k]).toBe(EV_EXEC[k]);
  });

  it("another business gets only what its own row holds", () => {
    expect({ ...fromRow({ id: COASTAL, ...COASTAL_ROW }) }).toEqual({
      name: "Coastal Cars", wordmark: "COASTAL CARS", phone: "07123 456789", email: "hello@coastal.test", licence: "PHO1234",
      site: "https://coastal.test", tagline: "Airport transfers from Southport", primary: "#123456", accent: "#FF8800", policy: null,
    });
    const bare = fromRow({ id: BARE, ...BARE_ROW });
    expect([bare.phone, bare.licence, bare.site, bare.tagline]).toEqual(["", "", "", ""]);
  });

  it("a business not read yet gets blank details, never EV Exec's", () => {
    expect(brandFor("ffffffff-0000-4000-8000-0000000000ff").phone).toBe("");
    expect(brandFor(undefined).phone).toBe("07721 070370");
  });
});

describe("EV Exec's emails", () => {
  it("still carry its wordmark, phone, licence and footer", () => {
    const m = C.requestReceived(booking(EV));
    expect(m.html).toMatch(/>EV EXEC<\/a>/);
    expect(m.html).toMatch(/tel:\+447721070370/);
    expect(m.html).toMatch(/Premium airport transfers from Blackpool &amp; the Fylde Coast/);
    expect(m.html).toMatch(/Private hire operator licence PHO0079/);
    expect(m.text).toMatch(/EV Exec · evexec\.co\.uk · 07721 070370/);
  });
});

describe("another business's emails", () => {
  const LEAKS = /EV Exec|EV EXEC|07721|PHO0079|book@evexec|070370/i;

  it("no email type shows EV Exec's details", () => {
    const all = everyEmail(booking(COASTAL));
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(28);
    for (const [name, m] of Object.entries(all)) {
      expect(`${m.subject}\n${m.html}\n${m.text}`, name).not.toMatch(LEAKS);
    }
  });

  it("carry its own name, phone, licence, website and colours", () => {
    const m = C.requestReceived(booking(COASTAL));
    expect(m.html).toMatch(/>COASTAL CARS<\/a>/);
    expect(m.html).toMatch(/href="https:\/\/coastal\.test"/);
    expect(m.html).toMatch(/tel:\+447123456789/);
    expect(m.html).toMatch(/Airport transfers from Southport/);
    expect(m.html).toMatch(/Private hire operator licence PHO1234/);
    expect(m.html).toMatch(/background:#123456/);
    expect(m.html).toMatch(/color:#FF8800/);
  });

  it("staff and driver invites are branded for the inviting business", () => {
    const team = S.teamInvite({ tenant_id: COASTAL, businessName: "Coastal Cars", inviterName: "Sam", role: "dispatcher", url: "https://x.test/t", newAccount: true });
    expect(team.html).toMatch(/>COASTAL CARS<\/a>/);
    expect(team.html).toMatch(/Sent automatically by the Coastal Cars booking system\./);
    const driver = S.driverInvite({ tenant_id: COASTAL, businessName: "Coastal Cars", driverName: "Sam", url: "https://x.test/d", newAccount: true });
    expect(driver.html).toMatch(/Call the office on <a href="tel:\+447123456789"/);
  });

  it("a business without a phone, licence or website leaves them out", () => {
    const cancelled = C.cancelledByUs(booking(BARE));
    expect(cancelled.html).not.toMatch(/Call 07|tel:|undefined|null/);
    expect(cancelled.html).toMatch(/please contact us straight away/);
    expect(C.bookingUnavailable(booking(BARE)).html).not.toMatch(/wa\.me/);
    const m = C.requestReceived(booking(BARE));
    expect(m.html).toMatch(/Questions or changes\? Just reply to this email\./);
    expect(m.html + m.text).not.toMatch(/licence|undefined|null/i);
  });

  it("building for one business does not change the next", () => {
    C.requestReceived(booking(COASTAL));
    const after = C.requestReceived(booking(EV));
    expect(after.html).toMatch(/EV EXEC/);
    expect(after.html).not.toMatch(/COASTAL/);
  });
});
