// Office sets a price for a website quote request, and queues the two-tap price text.
// Staff only (checked on the server). The customer's yes / no links are built from the
// business's own website address; nothing is sent by the platform (the office sends the
// text from its own phone).
import { adminClient, getCaller, json } from "@/lib/server/staff";
import { quoteText, parsePrice, smsLink } from "@/lib/operator/quoteText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { quoteId?: unknown; price?: unknown };

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return json({ error: "Not configured on the server." }, 503);
  const caller = await getCaller(req, admin);
  if (!caller) return json({ error: "Not authorised." }, 403);

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return json({ error: "Send the quote and price." }, 400); }
  const quoteId = String(body.quoteId ?? "");
  const parsed = parsePrice(body.price);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return json({ error: "Unknown quote." }, 400);

  const [{ data: quote }, { data: tenant }] = await Promise.all([
    admin.from("quote_requests").select("*").eq("id", quoteId).maybeSingle(),
    admin.from("tenants").select("name, brand").eq("id", caller.tenantId).maybeSingle(),
  ]);
  if (!quote || quote.tenant_id !== caller.tenantId) return json({ error: "Quote not found." }, 404);
  if (quote.status && quote.status !== "new") return json({ error: "This quote is no longer open." }, 409);

  const site = String((tenant?.brand as { site_url?: string } | null)?.site_url ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(site)) {
    return json({ error: "Set this business's website address before sending quote prices." }, 400);
  }

  // Save the price first. The reply links use the same token, so they stay valid if the price is re-sent.
  const { error: saveErr } = await admin.from("quote_requests")
    .update({ quoted_price: parsed.value, quoted_at: new Date().toISOString() })
    .eq("id", quote.id)
    .eq("tenant_id", caller.tenantId);
  if (saveErr) return json({ error: "Couldn't save the price. Try again." }, 500);

  const yesUrl = `${site}/api/booking/quote-response?t=${quote.quote_token}&r=yes`;
  const noUrl = `${site}/api/booking/quote-response?t=${quote.quote_token}&r=no`;
  const message = quoteText({
    businessName: tenant?.name ?? "",
    customerName: quote.customer_name,
    from: quote.airport ?? quote.pickup_location,
    to: quote.destination,
    date: quote.pickup_date,
    time: quote.pickup_time,
    returnDate: quote.return_required ? quote.return_date : null,
    returnTime: quote.return_required ? quote.return_time : null,
    price: parsed.value,
    yesUrl,
    noUrl,
  });

  const row = {
    tenant_id: caller.tenantId,
    booking_id: null,
    quote_request_id: quote.id,
    kind: "quote",
    customer_name: quote.customer_name,
    customer_phone: quote.phone,
    message,
    status: "pending",
    pushed_at: null,
    opened_at: null,
    sent_at: null,
  };
  const { data: existing } = await admin.from("operator_sms_tasks")
    .select("id").eq("quote_request_id", quote.id).eq("kind", "quote").maybeSingle();
  const taskErr = existing
    ? (await admin.from("operator_sms_tasks").update(row).eq("id", existing.id)).error
    : (await admin.from("operator_sms_tasks").insert(row)).error;
  if (taskErr) return json({ error: "Price saved, but the text couldn't be queued. Try again." }, 500);

  const phone = String(quote.phone ?? "").trim();
  return json({
    ok: true,
    price: parsed.value,
    message,
    smsHref: phone ? smsLink(phone, message) : null,
    noPhone: !phone,
  });
}
