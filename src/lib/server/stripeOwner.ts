// The platform's Stripe account (STRIPE_SECRET_KEY) is one business's own
// account (EV Exec's). Card payments for any OTHER business must never be taken
// into it: the money would land with the wrong business. Until a business has its
// own connected Stripe account, only the account owner's business sends card
// payment links; the others take cash or bank transfer.
// Same rule as the website (evexec lib/payments.js cardPaymentsAllowed).

export const stripeOwnerTenant = (): string =>
  process.env.STRIPE_PLATFORM_TENANT_ID || "00000000-0000-0000-0000-000000000001";

export const cardPaymentsAllowed = (tenantId: string | null | undefined): boolean =>
  !tenantId || tenantId === stripeOwnerTenant();
