// Which Stripe account a business's card payments use (design:
// evexec/docs/payments/stripe-connect-design.md, phase 2). Same rules as the
// website's lib/stripeAccount.js.
//
//  - The account OWNER (STRIPE_PLATFORM_TENANT_ID, EV Exec): its own Stripe
//    account (STRIPE_SECRET_KEY), no Stripe-Account header, as before.
//  - Any OTHER business: its own CONNECTED account, reached with the platform key
//    (STRIPE_PLATFORM_SECRET_KEY) and a Stripe-Account header, so the payment is
//    made directly on the operator's account. Only once Stripe says that account
//    can take card payments.
//  - Anything else: null. The caller must refuse; money never goes to a different
//    business's account.
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeOwnerTenant } from "@/lib/server/stripeOwner";

export type StripeContext = {
  kind: "own" | "connected";
  tenantId: string;
  accountId: string | null;
  headers: Record<string, string>;
};

const ownKey = () => (process.env.STRIPE_SECRET_KEY ?? "").trim();
const platformKey = () => (process.env.STRIPE_PLATFORM_SECRET_KEY ?? "").trim();

export async function stripeContext(
  admin: SupabaseClient,
  tenantId: string | null | undefined,
  opts: { requireReady?: boolean } = {},
): Promise<StripeContext | null> {
  const requireReady = opts.requireReady !== false;
  const owner = stripeOwnerTenant();
  if (!tenantId || tenantId === owner) {
    if (!ownKey()) return null;
    return { kind: "own", tenantId: owner, accountId: null, headers: { Authorization: `Bearer ${ownKey()}` } };
  }
  if (!platformKey()) return null;
  const { data } = await admin
    .from("tenants")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", tenantId)
    .limit(1);
  const row = (Array.isArray(data) ? data[0] : null) as { stripe_connect_account_id?: string | null; stripe_connect_charges_enabled?: boolean | null } | null;
  const accountId = row?.stripe_connect_account_id ?? "";
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) return null;
  if (requireReady && row?.stripe_connect_charges_enabled !== true) return null;
  return { kind: "connected", tenantId, accountId, headers: { Authorization: `Bearer ${platformKey()}`, "Stripe-Account": accountId } };
}
