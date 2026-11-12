import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConnectError, connectConfigured, createConnectedAccount, createOnboardingLink, readAccountStatus } from "./stripeConnect";

const original = process.env.STRIPE_PLATFORM_SECRET_KEY;
beforeEach(() => { process.env.STRIPE_PLATFORM_SECRET_KEY = "sk_test_abc123"; });
afterEach(() => { if (original === undefined) delete process.env.STRIPE_PLATFORM_SECRET_KEY; else process.env.STRIPE_PLATFORM_SECRET_KEY = original; });

function fakeStripe(reply: unknown, ok = true, status = 200) {
  const calls: { url: string; method?: string; headers: any; body?: string }[] = [];
  const f = (async (url: any, init: any) => {
    calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: init?.body });
    return { ok, status, json: async () => reply } as Response;
  }) as typeof fetch;
  return { f, calls };
}

describe("Stripe Connect helper", () => {
  it("is off without a platform key, and only accepts a real-looking key", () => {
    delete process.env.STRIPE_PLATFORM_SECRET_KEY;
    expect(connectConfigured()).toBe(false);
    process.env.STRIPE_PLATFORM_SECRET_KEY = "pk_test_nope";
    expect(connectConfigured()).toBe(false);
    process.env.STRIPE_PLATFORM_SECRET_KEY = "sk_test_ok";
    expect(connectConfigured()).toBe(true);
  });

  it("calls nothing without a key", async () => {
    delete process.env.STRIPE_PLATFORM_SECRET_KEY;
    const { f, calls } = fakeStripe({});
    await expect(createConnectedAccount({ tenantId: "t", businessName: "Acme" }, f)).rejects.toBeInstanceOf(ConnectError);
    expect(calls).toHaveLength(0);
  });

  it("creates a Standard-equivalent account that pays its own fees and takes no platform fee", async () => {
    const { f, calls } = fakeStripe({ id: "acct_123", charges_enabled: false, details_submitted: false });
    const s = await createConnectedAccount({ tenantId: "ten-1", businessName: "Acme Cars", email: "a@acme.invalid" }, f);
    expect(s).toMatchObject({ accountId: "acct_123", chargesEnabled: false });
    const body = new URLSearchParams(calls[0].body);
    expect(calls[0].url).toBe("https://api.stripe.com/v1/accounts");
    expect(calls[0].headers.Authorization).toBe("Bearer sk_test_abc123");
    expect(body.get("controller[stripe_dashboard][type]")).toBe("full");
    expect(body.get("controller[fees][payer]")).toBe("account");
    expect(body.get("controller[losses][payments]")).toBe("stripe");
    expect(body.get("controller[requirement_collection]")).toBe("stripe");
    expect(body.get("capabilities[card_payments][requested]")).toBe("true");
    expect(body.get("metadata[tenant_id]")).toBe("ten-1");
    expect([...body.keys()].some((k) => k.includes("application_fee"))).toBe(false);
  });

  it("creates a hosted onboarding link", async () => {
    const { f, calls } = fakeStripe({ url: "https://connect.stripe.com/setup/e/abc" });
    const url = await createOnboardingLink("acct_123", "https://app/return", "https://app/refresh", f);
    expect(url).toBe("https://connect.stripe.com/setup/e/abc");
    const body = new URLSearchParams(calls[0].body);
    expect(body.get("type")).toBe("account_onboarding");
    expect(body.get("account")).toBe("acct_123");
  });

  it("reads status and what is still due", async () => {
    const { f } = fakeStripe({ id: "acct_123", charges_enabled: true, details_submitted: true, payouts_enabled: true, requirements: { currently_due: ["external_account"] } });
    expect(await readAccountStatus("acct_123", f)).toEqual({
      accountId: "acct_123", chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: true, requirementsDue: ["external_account"],
    });
  });

  it("refuses an id that is not a Stripe account id, and surfaces Stripe's message", async () => {
    await expect(readAccountStatus("../customers")).rejects.toMatchObject({ status: 400 });
    const { f } = fakeStripe({ error: { message: "Invalid API Key" } }, false, 401);
    await expect(readAccountStatus("acct_123", f)).rejects.toThrow("Invalid API Key");
  });
});
