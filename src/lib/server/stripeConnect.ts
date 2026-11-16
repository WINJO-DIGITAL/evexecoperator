// Stripe Connect for operators (design: evexec/docs/payments/stripe-connect-design.md).
//
// Each operator connects its OWN Stripe account (a connected account) through
// Stripe-hosted onboarding. Payments are taken directly on that account and the
// operator pays Stripe's fees, so the platform never holds the money. No
// application fee is taken (owner decision 12/11/2026).
//
// Uses the PLATFORM's secret key (STRIPE_PLATFORM_SECRET_KEY, the Winjo Digital
// Stripe account) and nothing else; never the EV Exec account's STRIPE_SECRET_KEY.
// Server only: the key is never stored in the database or sent to the browser.
// Without the key, every function here refuses ("not configured") and nothing
// is called.

const STRIPE_API = "https://api.stripe.com/v1";

export type ConnectStatus = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
};

type Fetch = typeof fetch;

// The parts of Stripe's account and account-link responses we read.
type StripeBody = {
  id?: string; url?: string; charges_enabled?: boolean; details_submitted?: boolean; payouts_enabled?: boolean;
  requirements?: { currently_due?: unknown[] }; error?: { message?: string };
};

export const connectKey = (): string => (process.env.STRIPE_PLATFORM_SECRET_KEY ?? "").trim();
export const connectConfigured = (): boolean => /^sk_(test|live)_/.test(connectKey());

export class ConnectError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

async function call(f: Fetch, method: "GET" | "POST", path: string, form?: Record<string, string>) {
  const key = connectKey();
  if (!/^sk_(test|live)_/.test(key)) throw new ConnectError("Stripe is not set up on this platform yet.", 503);
  const res = await f(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as StripeBody;
  if (!res.ok) throw new ConnectError(body?.error?.message || `Stripe error ${res.status}`, res.status >= 500 ? 502 : 400);
  return body;
}

const status = (a: StripeBody): ConnectStatus => ({
  accountId: String(a.id),
  chargesEnabled: a.charges_enabled === true,
  detailsSubmitted: a.details_submitted === true,
  payoutsEnabled: a.payouts_enabled === true,
  requirementsDue: Array.isArray(a.requirements?.currently_due) ? a.requirements.currently_due.map(String) : [],
});

/**
 * A new connected account for a business. Behaves like a Standard account:
 * full Stripe Dashboard, the operator pays Stripe's fees, Stripe is liable for
 * its negative balances and collects its identity information.
 */
export async function createConnectedAccount(
  p: { tenantId: string; businessName: string; email?: string; country?: string },
  f: Fetch = fetch,
): Promise<ConnectStatus> {
  const form: Record<string, string> = {
    country: p.country || "GB",
    "controller[stripe_dashboard][type]": "full",
    "controller[fees][payer]": "account",
    "controller[losses][payments]": "stripe",
    "controller[requirement_collection]": "stripe",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "business_profile[name]": p.businessName.slice(0, 100),
    "metadata[tenant_id]": p.tenantId,
  };
  if (p.email) form.email = p.email;
  return status(await call(f, "POST", "/accounts", form));
}

/** A one-time Stripe-hosted onboarding link for the connected account. */
export async function createOnboardingLink(
  accountId: string, returnUrl: string, refreshUrl: string, f: Fetch = fetch,
): Promise<string> {
  const a = await call(f, "POST", "/account_links", {
    account: accountId, return_url: returnUrl, refresh_url: refreshUrl, type: "account_onboarding",
  });
  if (typeof a.url !== "string") throw new ConnectError("Stripe did not return an onboarding link.");
  return a.url;
}

/** What Stripe currently says about the connected account. */
export async function readAccountStatus(accountId: string, f: Fetch = fetch): Promise<ConnectStatus> {
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw new ConnectError("That is not a Stripe account id.", 400);
  return status(await call(f, "GET", `/accounts/${accountId}`));
}
