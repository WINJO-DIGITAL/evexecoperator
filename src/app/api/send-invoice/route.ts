import { createClient } from "@supabase/supabase-js";
import { invoice as invoiceEmail } from "@/lib/email/content.js";
import { loadBrand } from "@/lib/server/brands";

// Emails an invoice PDF to the customer via Resend.
//
// The browser renders the on-screen invoice to a PDF and posts it here as
// base64; this route verifies the caller is a signed-in operator, then hands
// the PDF to Resend as an attachment on a short branded email. Kept server-side
// so the Resend API key never reaches the client.
//
// Required env (set in Vercel project settings):
//   RESEND_API_KEY               — re_… from resend.com (Domains → Add domain, verify evexec.co.uk)
//   NEXT_PUBLIC_SUPABASE_URL      — already configured
//   NEXT_PUBLIC_SUPABASE_ANON_KEY — already configured (used to verify the caller's JWT)
// Optional:
//   INVOICE_FROM                 — sender, default "EV Exec <book@evexec.co.uk>"
//                                  (the domain must be verified in Resend)
//   INVOICE_REPLY_TO             — reply-to, default "book@evexec.co.uk"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FROM = process.env.INVOICE_FROM ?? "EV Exec <book@evexec.co.uk>";
const REPLY_TO = process.env.INVOICE_REPLY_TO ?? "book@evexec.co.uk";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req: Request) {
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ error: "Server not configured.", configured: false }, 503);
  }
  if (!RESEND_API_KEY) {
    return json(
      {
        error:
          "Emailing invoices isn't set up yet. Add RESEND_API_KEY (and verify your sender domain in Resend) in the Vercel project settings.",
        configured: false,
      },
      503
    );
  }

  // ── Verify the caller is a signed-in operator (anon key validates the JWT) ──
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json({ error: "Not authorised." }, 401);

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Not authorised." }, 401);

  // Signed in isn't enough: website customers have logins on the same
  // project. Only operator staff may send email from the business address.
  // tenant_users is readable for the caller's own rows (RLS), so the caller's
  // token is enough to check.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: roles } = await asCaller
    .from("tenant_users")
    .select("role, tenant_id")
    .eq("user_id", userData.user.id)
    .in("role", ["super_admin", "operator_admin", "dispatcher"])
    .limit(1);
  if (!roles?.length) return json({ error: "Not authorised." }, 403);
  // The invoice email is for the sender's own business (a platform admin, with
  // no business of their own, sends as the default one).
  const senderTenantId = roles[0].tenant_id ?? undefined;
  await loadBrand(asCaller, senderTenantId);

  // ── Parse + validate the payload ───────────────────────────────────────────
  let body: {
    to?: string; customerName?: string; number?: string; total?: string;
    pdfBase64?: string; invoiceId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const to = (body.to ?? "").trim();
  const number = (body.number ?? "").trim() || "Invoice";
  const total = (body.total ?? "").trim();
  const name = (body.customerName ?? "").trim();
  const pdfBase64 = (body.pdfBase64 ?? "").replace(/^data:.*;base64,/, "").trim();

  if (!isEmail(to)) return json({ error: "This invoice has no valid customer email address." }, 422);
  if (!pdfBase64) return json({ error: "Could not build the invoice PDF." }, 422);
  // Guard against oversized attachments (Resend caps ~40MB; keep well under).
  if (pdfBase64.length > 8_000_000) return json({ error: "The invoice PDF is too large to email." }, 422);

  // ── Send via Resend ────────────────────────────────────────────────────────
  // Same email layout as the website (src/lib/email, copied from evexec).
  const amount = Number(total.replace(/[^0-9.]/g, ""));
  const mail = invoiceEmail({
    tenant_id: senderTenantId,
    number, customer_name: name, total: Number.isFinite(amount) && amount > 0 ? amount : null,
    terms: "Payment is due within 15 days of the invoice date. Bank transfer (BACS) is preferred. Any questions, just reply to this email.",
  });
  const filename = `${number.replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [{ filename, content: pdfBase64 }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.message || j?.error || "";
    } catch {
      /* ignore */
    }
    return json({ error: `Email provider rejected the send${detail ? `: ${detail}` : "."}` }, 502);
  }

  return json({ ok: true });
}
