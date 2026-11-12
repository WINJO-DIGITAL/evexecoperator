import { brandFor } from "@/lib/email/brand.js";

// Who an email is from and where replies go, per business.
//
// The sending ADDRESS is the platform's (INVOICE_FROM, one verified domain).
// The display name is the business's own name, and replies go to the business's
// own contact email, so a customer's reply reaches the business they dealt with.
// The default business (EV Exec) keeps its configured INVOICE_REPLY_TO; any other
// business with no contact email gets no reply-to at all (never EV Exec's inbox).

const CONFIGURED_FROM = (process.env.INVOICE_FROM ?? "EV Exec <book@evexec.co.uk>").trim();
const CONFIGURED_REPLY = (process.env.INVOICE_REPLY_TO ?? "book@evexec.co.uk").trim();
const DEFAULT_TENANT = () => process.env.TENANT_ID || "00000000-0000-0000-0000-000000000001";

export function senderFor(tenantId?: string | null): { from: string; reply_to?: string } {
  const isDefault = !tenantId || tenantId === DEFAULT_TENANT();
  const brand = brandFor(tenantId || undefined);
  const address = (CONFIGURED_FROM.match(/<([^>]+)>/)?.[1] ?? CONFIGURED_FROM).trim();
  const display = String(brand.name || "").replace(/[<>",]/g, "").trim();
  const from = display ? `${display} <${address}>` : CONFIGURED_FROM;
  const reply = (isDefault ? CONFIGURED_REPLY : brand.email || "").trim();
  return reply ? { from, reply_to: reply } : { from };
}
