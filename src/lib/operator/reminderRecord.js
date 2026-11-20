// Records a customer reminder the office has sent itself ("Mark as Sent"), so the
// automatic text reminder for that booking is skipped (driver_sms_reminders: a
// row marked sent blocks the handoff). Staff may read, update and insert their own
// business's rows (migrations 20261015150000 and 20261120180000).
import { ukDateDaysAgo } from "@/lib/operator/ukDate";

const dayDiff = (from, to) => {
  const p = (s) => s.split("-").map(Number);
  const [y1, m1, d1] = p(from); const [y2, m2, d2] = p(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/** Which automatic reminder this travel date is for: "7day" (5-7 days away), "24hr" (today or tomorrow), or null. */
export function reminderKind(travelDate, today = ukDateDaysAgo(0)) {
  const n = dayDiff(today, travelDate);
  if (n >= 5 && n <= 7) return "7day";
  if (n >= 0 && n <= 1) return "24hr";
  return null;
}

async function bookingRow(db, ref) {
  const { data, error } = await db.from("bookings")
    .select("id, tenant_id, assigned_driver_id, customer_name, customer_phone, travel_date, travel_time")
    .eq("ref", ref).maybeSingle();
  if (error || !data) throw new Error("Couldn't find this booking.");
  return data;
}

/** true when this reminder has already been recorded as sent. */
export async function reminderAlreadySent(db, ref, kind) {
  if (!kind) return false;
  const b = await bookingRow(db, ref);
  const { data } = await db.from("driver_sms_reminders").select("status")
    .eq("booking_id", b.id).eq("reminder_type", kind).maybeSingle();
  return data?.status === "sent";
}

/** Record the reminder as sent: update the automatic row if it exists, otherwise create it as sent. */
export async function markReminderSent(db, ref, kind) {
  const b = await bookingRow(db, ref);
  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await db.from("driver_sms_reminders")
    .update({ status: "sent", sent_at: now })
    .eq("booking_id", b.id).eq("reminder_type", kind).select("id");
  if (upErr) throw new Error("Couldn't record the reminder. Try again.");
  if (updated && updated.length) return;
  const { error: insErr } = await db.from("driver_sms_reminders").insert({
    tenant_id: b.tenant_id,
    booking_id: b.id,
    driver_id: b.assigned_driver_id,
    reminder_type: kind,
    customer_name: b.customer_name ?? null,
    customer_phone: b.customer_phone ?? null,
    travel_date: b.travel_date ?? null,
    travel_time: b.travel_time ?? null,
    message: "Sent by the office",
    status: "sent",
    sent_at: now,
  });
  if (insErr) throw new Error("Couldn't record the reminder. Try again.");
}
