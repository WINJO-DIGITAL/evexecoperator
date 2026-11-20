// What the Settings → Payments screen needs: the state of a business's Stripe
// account, and starting (or continuing) its onboarding. Pure of HTTP and of
// Stripe's network details so it can be tested with fakes.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConnectError, connectConfigured, createConnectedAccount, createOnboardingLink, readAccountStatus,
  type ConnectStatus,
} from "@/lib/server/stripeConnect";

export type ConnectView = {
  configured: boolean;        // the platform key is set
  canManage: boolean;         // the caller is an admin of this business
  connected: boolean;         // the business has a connected Stripe account
  ready: boolean;             // it can take card payments
  detailsSubmitted: boolean;
  requirementsDue: string[];
};

type Deps = {
  create: typeof createConnectedAccount;
  link: typeof createOnboardingLink;
  read: typeof readAccountStatus;
  configured: () => boolean;
};
const real: Deps = { create: createConnectedAccount, link: createOnboardingLink, read: readAccountStatus, configured: connectConfigured };

type Row = { id: string; name: string | null; contact_email: string | null; stripe_connect_account_id: string | null; stripe_connect_charges_enabled: boolean | null; stripe_connect_details_submitted: boolean | null };

// Reads the business with the caller's own access when the service key is refused,
// as the staff check does. A real failure is reported as one, not as "not found".
async function loadTenant(db: SupabaseClient, tenantId: string): Promise<Row> {
  const { data, error } = await db.from("tenants")
    .select("id, name, contact_email, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_details_submitted")
    .eq("id", tenantId).maybeSingle();
  if (error) {
    console.error("stripe-connect: could not read the business:", error.message);
    throw new ConnectError("Couldn't load your business's details just now. Please try again.", 503);
  }
  if (!data) throw new ConnectError("Business not found.", 404);
  return data as Row;
}

async function save(admin: SupabaseClient, tenantId: string, s: ConnectStatus) {
  const { error } = await admin.from("tenants").update({
    stripe_connect_account_id: s.accountId,
    stripe_connect_charges_enabled: s.chargesEnabled,
    stripe_connect_details_submitted: s.detailsSubmitted,
    stripe_connect_checked_at: new Date().toISOString(),
  }).eq("id", tenantId);
  if (error) throw new ConnectError("Could not save the Stripe status.", 500);
}

/** The state for the screen. Re-reads Stripe when the business has an account. */
export async function connectState(
  admin: SupabaseClient, caller: { tenantId: string; isAdmin: boolean; db?: SupabaseClient }, deps: Deps = real,
): Promise<ConnectView> {
  const configured = deps.configured();
  const t = await loadTenant(caller.db ?? admin, caller.tenantId);
  let ready = t.stripe_connect_charges_enabled === true;
  let detailsSubmitted = t.stripe_connect_details_submitted === true;
  let due: string[] = [];
  if (configured && t.stripe_connect_account_id) {
    try {
      const s = await deps.read(t.stripe_connect_account_id);
      ready = s.chargesEnabled; detailsSubmitted = s.detailsSubmitted; due = s.requirementsDue;
      // Saving the refreshed state is best-effort: the screen is right even if it can't be stored now.
      await save(admin, caller.tenantId, s).catch((e) => console.error("stripe-connect: could not store the refreshed status:", e?.message ?? e));
    } catch { /* show the last saved state if Stripe can't be reached */ }
  }
  return { configured, canManage: caller.isAdmin, connected: !!t.stripe_connect_account_id, ready, detailsSubmitted, requirementsDue: due };
}

/** Create the connected account if there is none, then a hosted onboarding link. */
export async function startOnboarding(
  admin: SupabaseClient, caller: { tenantId: string; isAdmin: boolean; db?: SupabaseClient }, urls: { returnUrl: string; refreshUrl: string }, deps: Deps = real,
): Promise<{ url: string }> {
  if (!caller.isAdmin) throw new ConnectError("Only an admin can connect Stripe.", 403);
  if (!deps.configured()) throw new ConnectError("Stripe is not set up on this platform yet.", 503);
  const t = await loadTenant(caller.db ?? admin, caller.tenantId);
  let accountId = t.stripe_connect_account_id;
  if (!accountId) {
    const created = await deps.create({ tenantId: t.id, businessName: t.name || "Business", email: t.contact_email || undefined });
    await save(admin, caller.tenantId, created);
    accountId = created.accountId;
  }
  return { url: await deps.link(accountId, urls.returnUrl, urls.refreshUrl) };
}
