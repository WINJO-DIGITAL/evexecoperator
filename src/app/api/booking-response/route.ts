import { createClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/dates";
import { bookingConfirmed, bookingUnavailable } from "@/lib/email/content.js";
import { freeCancellationLine } from "@/lib/email/cancellation.js";
import { brandFor } from "@/lib/email/brand.js";
import { loadBrand } from "@/lib/server/brands";
import { bookingResponseText } from "@/lib/bookingResponseText";
import { adminClient, getCaller } from "@/lib/server/staff";
import { queueCustomerText, wantsCustomerText } from "@/lib/server/smsTask";

// Notifies a customer that the operator has ACCEPTED or REJECTED their website
// booking. Email first (via Resend). If the email can't be sent or there's no
// address, the text is added to Today → "Texts to send" (operator_sms_tasks)
// for the operator to send from their own phone (Twilio is dormant).
//
// Accepted: "Booking confirmed" with the full journey details and, at the
// bottom, the Payment section: a Pay Now link to the booking's page on the
// website, where the customer pays by card (Stripe) or chooses cash. Same
// content as the website's own booking-confirmed email (evexec/lib/notify.js).
// Rejected: EV Exec cannot accommodate the journey, with an apology. No
// payment link.
//
// The caller must be staff (checked with the service role); the booking is read
// as that operator (RLS), so only their own business's bookings are found.
//
// Env (Vercel project settings):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — already set
//   RESEND_API_KEY  — re_… (verify evexec.co.uk in Resend); optional, falls back to SMS
//   INVOICE_FROM / INVOICE_REPLY_TO — reused as the sender / reply-to
//   EVEXEC_SITE_URL — optional, the website (default https://www.evexec.co.uk)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
import { senderFor } from "@/lib/server/sender";

type Booking = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const time5 = (t: unknown) => {
  const m = str(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "TBC";
};
const isReturnLeg = (b: Booking) => /^Return leg created automatically/i.test(str(b.notes));
const price = (b: Booking) => {
  const p = Number(b.price ?? b.quoted_price);
  return !isReturnLeg(b) && Number.isFinite(p) && p > 0 ? `£${p.toFixed(2)}` : "";
};

const needsPayment = (b: Booking) => {
  const s = str(b.payment_status).toLowerCase();
  return s !== "paid" && s !== "invoiced" && Boolean(price(b));
};

export async function POST(req: Request) {
  if (!SUPABASE_URL || !ANON_KEY) return json({ error: "not configured" }, 503);

  // Verify the caller is a signed-in operator (anon key validates the JWT).
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json({ error: "Not authorised." }, 401);
  // Send the caller's JWT on every request so the booking read and the
  // queue_customer_sms RPC run as the authenticated operator.
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Not authorised." }, 401);
  const admin = adminClient();
  if (!admin) return json({ error: "not configured" }, 503);
  if (!(await getCaller(req, admin))) return json({ error: "Not authorised." }, 403);

  let body: { ref?: string; decision?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  const ref = (body.ref ?? "").trim();
  const decision = (body.decision ?? "").trim();
  if (decision !== "accepted" && decision !== "rejected") return json({ error: "Invalid decision." }, 422);
  if (!ref) return json({ error: "Missing booking ref." }, 400);
  const accepted = decision === "accepted";

  const { data: b } = await db.from("bookings").select("*").eq("ref", ref).maybeSingle();
  if (!b) return json({ ok: false, channel: null, error: "Booking not found." }, 200);

  const first = str(b.customer_name).split(/\s+/)[0] || "there";
  const email = str(b.customer_email);
  const phone = str(b.customer_phone);
  const when = `${fmtDate(str(b.travel_date) || null)} ${time5(b.travel_time)}`.trim();

  // The business's own name and number go in the texts and the email.
  await loadBrand(admin, str(b.tenant_id) || null);
  const brand = brandFor(str(b.tenant_id) || undefined);
  // The business's own website. A business with no website gets no pay link (its customers are told to contact it instead).
  const siteOwn = (brand.site || "").replace(/\/$/, "");
  const payUrl = siteOwn ? `${siteOwn}/booking?id=${encodeURIComponent(str(b.id))}` : "";
  const smsText = bookingResponseText({
    accepted, brand, first, ref, when, payUrl,
    needsPayment: needsPayment(b) && !!payUrl, freeCancellation: freeCancellationLine(b) || "",
  });

  // ── Email first ────────────────────────────────────────────────────────────
  let emailed = false;
  let emailError = "";
  if (RESEND_API_KEY && email && isEmail(email)) {
    // Same email as the website sends (src/lib/email, copied from evexec).
    const mail = accepted ? bookingConfirmed(b, { payUrl }) : bookingUnavailable(b);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...senderFor(str(b.tenant_id) || undefined),
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
  }

  // ── Text: two-tap, sent from the operator's own phone. A confirmed booking always
  // gets one when there is a phone number (alongside the email); a "journey
  // unavailable" text only when the email could not be sent. ──────────────────
  let smsQueued = false;
  if (wantsCustomerText({ accepted, emailed, phone })) {
    // Replaces an earlier "we've received your request" text for this booking, so the
    // customer is sent the confirmation (see src/lib/server/smsTask.ts).
    smsQueued = await queueCustomerText(admin, {
      tenantId: b.tenant_id, bookingId: b.id, kind: accepted ? "confirmation" : "rejection",
      name: str(b.customer_name) || null, phone, message: smsText,
    });
  }
  const smsHref = smsQueued ? `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(smsText)}` : null;

  const channel = emailed ? "email" : smsQueued ? "text" : null;
  if (!channel) {
    return json({
      ok: false,
      channel: null,
      error: email || phone
        ? `Couldn't reach the customer${emailError ? `: ${emailError}` : "."}`
        : "No email or phone on file for this customer.",
    }, 200);
  }
  return json({ ok: true, channel, emailed, smsQueued, smsHref });
}
