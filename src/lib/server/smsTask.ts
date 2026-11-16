// Adds a customer text to the office's "Texts to send" list (operator_sms_tasks).
// A booking has one task per kind, and the "we've received your request" text and
// the "booking confirmed" text are both kind "confirmation". So when the booking
// is accepted, an earlier "received" text is replaced by the confirmed text and put
// back to pending (unsent); an identical text is left alone, so a retry never
// duplicates it. Returns true when a text is waiting for the office to send.

type Row = { id: string; message: string };
type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake / Supabase query builder; typed loosely on purpose
  from: (table: string) => any; // supabase-js query builder
};

export async function queueCustomerText(
  admin: Admin,
  t: { tenantId: unknown; bookingId: unknown; kind: string; name: string | null; phone: string; message: string },
): Promise<boolean> {
  const { data: existing } = await admin
    .from("operator_sms_tasks")
    .select("id,message")
    .eq("booking_id", t.bookingId)
    .eq("kind", t.kind)
    .maybeSingle();
  const row = existing as Row | null;
  if (row) {
    if (row.message === t.message) return true; // already waiting (or already handled)
    const { error } = await admin
      .from("operator_sms_tasks")
      .update({
        message: t.message, customer_name: t.name, customer_phone: t.phone,
        status: "pending", pushed_at: null, opened_at: null, sent_at: null,
      })
      .eq("id", row.id);
    return !error;
  }
  const { error } = await admin.from("operator_sms_tasks").insert({
    tenant_id: t.tenantId, booking_id: t.bookingId, kind: t.kind,
    customer_name: t.name, customer_phone: t.phone, message: t.message, status: "pending",
  });
  return !error;
}

/**
 * Whether the customer's text goes to the office list. A confirmed booking always
 * gets one when a phone number is on file, alongside the email (the office sends
 * it from their own phone). A "journey unavailable" text is only needed when the
 * email could not be sent.
 */
export function wantsCustomerText(p: { accepted: boolean; emailed: boolean; phone: string }): boolean {
  if (!p.phone) return false;
  return p.accepted ? true : !p.emailed;
}
