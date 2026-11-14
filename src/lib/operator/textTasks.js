// Customer texts the office sends from its own phone (two taps: Open Messages,
// then Mark as sent). Two sources:
//   - operator_sms_tasks: office handoffs (booking confirmations etc. for
//     customers with no email, cancellations before a driver was assigned)
//   - driver_sms_reminders for jobs given to a trusted partner, who has no
//     Driver App, so their customers' reminder texts come to the office.

const KIND_LABEL = {
  confirmation: "Booking confirmation",
  rejection: "Booking unavailable",
  cancellation: "Cancellation",
  cancelled: "Cancellation",
  "7day": "Week-ahead reminder",
  "24hr": "Day-before reminder",
  "24hr_return": "Day-before reminder",
  en_route: "Driver on the way",
  arrived: "Driver arrived",
  quote: "Price quote",
};

const DONE = ["Completed", "Cancelled"];
const CANCEL_KINDS = ["cancellation", "cancelled", "rejection"];

/**
 * One list, oldest first, without texts that no longer make sense: the
 * booking's date has passed, or the job is finished (a cancellation notice
 * still shows for a cancelled booking).
 */
export function textTasksFrom(opRows, partnerRows, todayUk) {
  const keep = (kind, b) => {
    if (!b) return false;
    if (b.travel_date && b.travel_date < todayUk) return false;
    if (DONE.includes(b.status) && !CANCEL_KINDS.includes(kind)) return false;
    return true;
  };
  // A price quote belongs to a quote request, not a booking: it stays until the quote is
  // converted or dismissed, and is judged by its own date.
  const quoteAsBooking = (r) => {
    const q = r.quote_requests;
    if (!q) return null;
    if (q.status && q.status !== "new") return null;
    return { travel_date: q.pickup_date, status: "Quote" };
  };
  const opsKept = (opRows ?? []).filter((r) => (r.quote_request_id ? !!quoteAsBooking(r) && keep(r.kind, quoteAsBooking(r)) : keep(r.kind, r.bookings)));
  const ops = opsKept.map((r) => ({
    key: `op-${r.id}`, table: "operator_sms_tasks", id: r.id, kind: r.kind,
    label: KIND_LABEL[r.kind] ?? "Customer text", partner: null,
    customer: r.customer_name || "Customer", phone: r.customer_phone, message: r.message,
    status: r.status, createdAt: r.created_at, bookingId: r.booking_id,
    ref: r.bookings?.ref ?? null, travelDate: r.bookings?.travel_date ?? r.quote_requests?.pickup_date ?? null, travelTime: r.bookings?.travel_time ?? null,
  }));
  const partner = (partnerRows ?? []).filter((r) => keep(r.reminder_type, r.bookings)).map((r) => ({
    key: `dr-${r.id}`, table: "driver_sms_reminders", id: r.id, kind: r.reminder_type,
    label: KIND_LABEL[r.reminder_type] ?? "Customer text", partner: r.drivers?.name ?? null,
    customer: r.customer_name || "Customer", phone: r.customer_phone, message: r.message,
    status: r.status, createdAt: r.created_at, bookingId: r.booking_id,
    ref: r.bookings?.ref ?? null, travelDate: r.travel_date ?? r.bookings?.travel_date ?? null,
    travelTime: r.travel_time ?? r.bookings?.travel_time ?? null,
  }));
  return [...ops, ...partner].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** sms: link with the message pre-written (same format as the payment-link text). */
export function smsHref(phone, message) {
  return `sms:${String(phone || "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(message || "")}`;
}
