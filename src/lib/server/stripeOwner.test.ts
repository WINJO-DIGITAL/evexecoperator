import { describe, it, expect, afterEach } from "vitest";
import { cardPaymentsAllowed, stripeOwnerTenant } from "./stripeOwner";

const EV = "00000000-0000-0000-0000-000000000001";
const OTHER = "dddddddd-0000-4000-8000-000000000002";

describe("cardPaymentsAllowed", () => {
  afterEach(() => { delete process.env.STRIPE_PLATFORM_TENANT_ID; });

  it("allows only the Stripe account owner's business, or a booking with no business", () => {
    expect(stripeOwnerTenant()).toBe(EV);
    expect(cardPaymentsAllowed(EV)).toBe(true);
    expect(cardPaymentsAllowed(null)).toBe(true);
    expect(cardPaymentsAllowed(undefined)).toBe(true);
    expect(cardPaymentsAllowed(OTHER)).toBe(false);
  });

  it("follows STRIPE_PLATFORM_TENANT_ID when it is set", () => {
    process.env.STRIPE_PLATFORM_TENANT_ID = OTHER;
    expect(cardPaymentsAllowed(OTHER)).toBe(true);
    expect(cardPaymentsAllowed(EV)).toBe(false);
  });
});
