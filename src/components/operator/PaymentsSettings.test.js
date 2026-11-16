import { describe, expect, it } from "vitest";
import { paymentsStatus } from "./PaymentsSettings";

describe("paymentsStatus", () => {
  it("says card payments are not available until the platform is set up", () => {
    expect(paymentsStatus({ configured: false }).title).toMatch(/not available yet/);
  });
  it("offers to connect when there is no account", () => {
    expect(paymentsStatus({ configured: true, connected: false, ready: false }).title).toBe("Connect your Stripe account");
  });
  it("asks the operator to finish when started but not submitted", () => {
    expect(paymentsStatus({ configured: true, connected: true, detailsSubmitted: false, ready: false }).title).toBe("Finish setting up Stripe");
  });
  it("says Stripe is checking once details are sent", () => {
    expect(paymentsStatus({ configured: true, connected: true, detailsSubmitted: true, ready: false }).title).toMatch(/checking your details/);
  });
  it("says card payments are on when ready", () => {
    const s = paymentsStatus({ configured: true, connected: true, detailsSubmitted: true, ready: true });
    expect(s.tone).toBe("good");
    expect(s.body).toMatch(/own Stripe account/);
  });
});
