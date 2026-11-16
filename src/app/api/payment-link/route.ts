import { createClient } from "@supabase/supabase-js";
import { paymentLink } from "@/lib/email/content.js";
import { brandFor } from "@/lib/email/brand.js";
import { loadBrand } from "@/lib/server/brands";
import { userFromToken } from "@/lib/server/staff";
import { stripeContext, type StripeContext } from "@/lib/server/stripeAccount";
import { when } from "@/lib/email/template.js";

// Generates a Stripe payment link for a booking and sends it to the customer.
//
// - Email (Resend), in the shared EV Exec email design, when the booking has
//   an email address.
// - A two-tap text: the response carries an `sms:` link with the message
//   already written, which the operator opens from their own phone and sends.
//   No Twilio: nothing is queued for an SMS provider.
//
// Runs server-side because it needs the Stripe secret key and the Supabase
// service-role key. Gated to authenticated operators: the browser sends its
// Supabase access token as a Bearer header and we verify it before doing
// anything chargeable.
//
// Required env (set in Vercel project settings):
//   STRIPE_SECRET_KEY            — the account owner's (EV Exec) own Stripe key
//   STRIPE_PLATFORM_SECRET_KEY   — the platform key for operators' connected accounts (see stripeAccount.ts)
//   SUPABASE_SERVICE_ROLE_KEY    — service role key (server only, never NEXT_PUBLIC)
//   NEXT_PUBLIC_SUPABASE_URL     — already configured for the client
// Optional:
//   RESEND_API_KEY               — to email the link (otherwise text only)
//   INVOICE_FROM / INVOICE_REPLY_TO — sender / reply-to, as booking-response
//   NEXT_PUBLIC_SITE_URL         — base for Stripe success/cancel redirects

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://evexecoperator.vercel.app";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
import { senderFor } from "@/lib/server/sender";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isReturnLeg = (notes: unknown) => /^Return leg created automatically/i.test(String(notes ?? ""));

type CheckoutSession = {
  id?: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  error?: { message?: string };
};

async function stripeSession(id: string, ctx: StripeContext, action = ""): Promise<CheckoutSession | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}${action}`, {
      method: action ? "POST" : "GET",
      headers: ctx.headers,
    });
    return res.ok ? ((await res.json()) as CheckoutSession) : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A new Stripe Checkout Session for the booking. Paid sessions are recorded by
// the website's Stripe webhook via metadata[booking_ref].
async function createCheckout(
  booking: { ref: string; tenant_id?: string | null },
  unitAmount: number,
  email: string,
  ctx: StripeContext,
): Promise<CheckoutSession> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "gbp");
  form.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  form.set(
    "line_items[0][price_data][product_data][name]",
    `${brandFor(booking.tenant_id).name ? `${brandFor(booking.tenant_id).name} ` : ""}airport transfer — Ref ${booking.ref}`
  );
  form.set("client_reference_id", booking.ref);
  form.set("metadata[booking_ref]", booking.ref);
  // Pre-fill the Stripe checkout email; if "Successful payment" receipts are
  // enabled in the Stripe Dashboard, Stripe also emails its own receipt.
  if (isEmail(email)) form.set("customer_email", email);
  form.set("success_url", `${SITE_URL}/payment-complete?ref=${encodeURIComponent(booking.ref)}`);
  form.set("cancel_url", `${SITE_URL}/payment-cancelled?ref=${encodeURIComponent(booking.ref)}`);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      ...ctx.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const created = (await stripeRes.json().catch(() => ({}))) as CheckoutSession;
  return stripeRes.ok ? created : { error: created.error ?? {} };
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      {
        error:
          "Payment links aren't set up yet. Add SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings.",
        configured: false,
      },
      503
    );
  }

  // ── Verify the caller is a signed-in operator ──────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return json({ error: "Not authorised." }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authedUser = await userFromToken(admin, token);
  if (!authedUser) return json({ error: "Not authorised." }, 401);

  // Signed in isn't enough (website customers have logins on this project):
  // the caller must be staff, and below, of the business that owns the booking.
  const { data: roles } = await admin
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", authedUser.id)
    .in("role", ["super_admin", "operator_admin", "dispatcher"]);
  const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
  const staffTenants = new Set((roles ?? []).map((r) => r.tenant_id).filter(Boolean));
  if (!isSuper && staffTenants.size === 0) return json({ error: "Not authorised." }, 403);

  // ── Resolve the booking ────────────────────────────────────────────────────
  let ref: string | undefined;
  try {
    const parsed = (await req.json()) as { ref?: string };
    ref = typeof parsed?.ref === "string" ? parsed.ref.trim() : undefined;
  } catch {
    /* fall through to validation below */
  }
  if (!ref) return json({ error: "Missing booking ref." }, 400);

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("*")
    .eq("ref", ref)
    .single();

  if (bErr || !booking) return json({ error: "Booking not found." }, 404);
  if (!isSuper && !staffTenants.has(booking.tenant_id)) return json({ error: "Booking not found." }, 404);
  await loadBrand(admin, booking.tenant_id); // this business's name and number for the email and text
  const brand = brandFor(booking.tenant_id);
  // The business's own Stripe account (EV Exec's own, or an operator's connected account once
  // Stripe says it can take card payments). Otherwise refused: money never goes to another
  // business's account.
  // Reading or closing a checkout that already exists only needs the account to be known,
  // so an operator whose account has since become unready can still close an open link.
  // Creating a NEW checkout needs the account to be ready (checked just before it is made).
  const ctx = await stripeContext(admin, booking.tenant_id, { requireReady: false });
  const canTakePayments = !!(await stripeContext(admin, booking.tenant_id));
  if (!ctx) {
    return json({ error: `${brand.name || "This business"} cannot take card payments online yet. Ask the customer to pay by cash or bank transfer.` }, 422);
  }

  const phone = (booking.customer_phone ?? "").trim();
  const email = (booking.customer_email ?? "").trim();
  if (!phone && !isEmail(email)) {
    return json({ error: "This booking has no customer email or phone number." }, 422);
  }

  if (String(booking.payment_status ?? "").toLowerCase() === "paid") {
    return json({ error: "This booking is already paid." }, 409);
  }
  if (isReturnLeg(booking.notes)) {
    return json({ error: "This is the return leg of a return booking. It is paid with its outbound booking." }, 422);
  }

  const amount = Number(booking.price ?? booking.quoted_price ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "This booking has no price to charge." }, 422);
  }
  const unitAmount = Math.round(amount * 100); // pence

  // ── The booking's checkout so far ──────────────────────────────────────────
  // One payable checkout per booking. Sending the link again reuses the open
  // one for the same amount; any other open checkout (an old amount, or one the
  // customer started on the booking page) is closed first, so the customer can
  // never pay the same booking twice.
  let session: CheckoutSession | null = null;
  if (booking.stripe_session_id) {
    const prev = await stripeSession(booking.stripe_session_id, ctx);
    if (prev?.payment_status === "paid") {
      return json({ error: "This booking has already been paid. The payment is being recorded." }, 409);
    }
    const ours = prev?.metadata?.booking_ref === booking.ref || prev?.metadata?.bookingId === booking.id;
    // An open link is only reused while the account can take payments; otherwise it is closed.
    if (prev?.status === "open" && ours && prev.amount_total === unitAmount && prev.url && canTakePayments) {
      session = prev;
    } else if (prev?.status === "open" && prev.id) {
      await stripeSession(prev.id, ctx, "/expire");
    }
  }

  if (!session) {
    if (!canTakePayments) {
      return json({ error: `${brand.name || "This business"} cannot take card payments online yet. Ask the customer to pay by cash or bank transfer.` }, 422);
    }
    const created = await createCheckout(booking, unitAmount, email, ctx);
    if (!created.url) {
      return json({ error: created.error?.message ?? "Stripe could not create the payment link." }, 502);
    }
    session = created;
    await admin
      .from("bookings")
      .update({ stripe_session_id: created.id, payment_method: "Payment link" })
      .eq("id", booking.id);
  }


  // ── Email (Resend) ──────────────────────────────────────────────────────────
  let emailed = false;
  let emailError = "";
  if (isEmail(email) && RESEND_API_KEY) {
    const mail = paymentLink(booking, { url: session.url, amount });
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...senderFor(booking.tenant_id),
          to: [email],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      emailed = res.ok;
      if (!res.ok) {
        try { const j = await res.json(); emailError = j?.message || j?.error || ""; } catch { /* ignore */ }
      }
    } catch (e) {
      emailError = (e as Error)?.message ?? "email send failed";
    }
  } else if (isEmail(email)) {
    emailError = "Email is not set up (RESEND_API_KEY missing).";
  }

  // ── Two-tap text: the operator sends it from their own phone ────────────────
  let smsHref: string | null = null;
  if (phone) {
    const first = String(booking.customer_name ?? "").trim().split(/\s+/)[0] || "there";
    const whenText = when(booking.travel_date, booking.travel_time);
    const body =
      `Hi ${first}, here is the secure card payment link (£${amount.toFixed(2)}) for your ${brand.name ? `${brand.name} ` : ""}transfer` +
      `${whenText ? ` on ${whenText}` : ""} (Ref ${booking.ref}): ${session.url} ` +
      `${brand.phone ? `Any questions, call ${brand.phone}. ` : ""}Thank you${brand.name ? `, ${brand.name}` : ""}`;
    smsHref = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
  }

  return json({
    url: session.url,
    emailed,
    emailTo: emailed ? email : null,
    emailError: emailError || null,
    smsHref,
  });
}
