import { describe, expect, it } from "vitest";
import { connectState, startOnboarding } from "./connectFlow";
import { ConnectError } from "./stripeConnect";

function fakeAdmin(row: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
  const admin: any = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); Object.assign(row, patch); return { error: null }; } }),
    }),
  };
  return { admin, updates };
}
const row = (extra = {}) => ({ id: "t1", name: "Acme Cars", contact_email: "a@acme.invalid", stripe_connect_account_id: null, stripe_connect_charges_enabled: false, stripe_connect_details_submitted: false, ...extra });
const status = (o = {}) => ({ accountId: "acct_1", chargesEnabled: false, detailsSubmitted: false, payoutsEnabled: false, requirementsDue: [], ...o });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
const deps = (o: any = {}) => ({
  configured: () => true,
  create: async () => status(),
  link: async () => "https://connect.stripe.com/setup/x",
  read: async () => status(),
  ...o,
});

describe("startOnboarding", () => {
  it("only an admin can connect Stripe", async () => {
    const { admin } = fakeAdmin(row());
    await expect(startOnboarding(admin, { tenantId: "t1", isAdmin: false }, { returnUrl: "r", refreshUrl: "r" }, deps())).rejects.toMatchObject({ status: 403 });
  });
  it("is refused until the platform key is set", async () => {
    const { admin } = fakeAdmin(row());
    await expect(startOnboarding(admin, { tenantId: "t1", isAdmin: true }, { returnUrl: "r", refreshUrl: "r" }, deps({ configured: () => false }))).rejects.toMatchObject({ status: 503 });
  });
  it("creates the connected account once, saves its id, and returns the hosted link", async () => {
    const r = row(); const { admin, updates } = fakeAdmin(r);
    let created = 0;
    const d = deps({ create: async () => { created++; return status({ accountId: "acct_new" }); } });
    const out = await startOnboarding(admin, { tenantId: "t1", isAdmin: true }, { returnUrl: "r", refreshUrl: "r" }, d);
    expect(out.url).toContain("connect.stripe.com");
    expect(created).toBe(1);
    expect(updates[0]).toMatchObject({ stripe_connect_account_id: "acct_new" });
    // second time: reuses the account
    await startOnboarding(admin, { tenantId: "t1", isAdmin: true }, { returnUrl: "r", refreshUrl: "r" }, d);
    expect(created).toBe(1);
  });
});

describe("connectState", () => {
  it("not connected yet", async () => {
    const { admin } = fakeAdmin(row());
    expect(await connectState(admin, { tenantId: "t1", isAdmin: true }, deps())).toMatchObject({ configured: true, canManage: true, connected: false, ready: false });
  });
  it("re-reads Stripe and records that the account can now take payments", async () => {
    const r = row({ stripe_connect_account_id: "acct_1" }); const { admin, updates } = fakeAdmin(r);
    const v = await connectState(admin, { tenantId: "t1", isAdmin: false }, deps({ read: async () => status({ chargesEnabled: true, detailsSubmitted: true }) }));
    expect(v).toMatchObject({ connected: true, ready: true, detailsSubmitted: true, canManage: false });
    expect(updates[0]).toMatchObject({ stripe_connect_charges_enabled: true });
  });
  it("shows the last saved state when Stripe can't be reached", async () => {
    const r = row({ stripe_connect_account_id: "acct_1", stripe_connect_charges_enabled: true, stripe_connect_details_submitted: true });
    const { admin } = fakeAdmin(r);
    const v = await connectState(admin, { tenantId: "t1", isAdmin: true }, deps({ read: async () => { throw new ConnectError("down"); } }));
    expect(v.ready).toBe(true);
  });
  it("does not call Stripe when the platform key is not set", async () => {
    const r = row({ stripe_connect_account_id: "acct_1" }); const { admin } = fakeAdmin(r);
    let called = 0;
    const v = await connectState(admin, { tenantId: "t1", isAdmin: true }, deps({ configured: () => false, read: async () => { called++; return status(); } }));
    expect(called).toBe(0);
    expect(v.configured).toBe(false);
  });
});
