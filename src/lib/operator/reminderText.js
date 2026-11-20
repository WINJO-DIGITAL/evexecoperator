// The customer reminder the office can send from a booking: the same wording
// the website uses for its own reminders, written for a two-tap text (Messages
// opens with it filled in and the office presses Send). Dates are DD/MM/YYYY,
// times HH:MM UK, as everywhere in EV Exec.
import { fmtDate } from "@/lib/dates";
import { smsHref } from "@/lib/operator/textTasks";

const dayDiff = (from, to) => {
  const a = Date.UTC(...from.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...to.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
};

/** "today", "tomorrow" or "in N days", counted by UK calendar date. */
export function whenText(travelDate, today) {
  const n = dayDiff(today, travelDate);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** The message text for a booking (no greeting name means "there"). */
export function reminderMessage(b, today, { businessName = "EV Exec", contactPhone = null } = {}) {
  const first = (b.customer || "").trim().split(/\s+/)[0] || "there";
  const lines = [
    `Hi ${first}, reminder: your ${businessName} transfer is ${whenText(b.travelDate, today)}.`,
    "",
    b.route && b.route !== "—" ? b.route : null,
    `${fmtDate(b.travelDate)} at ${b.time}`,
    b.driverId && b.driver ? `Your driver is ${b.driver}.` : null,
    contactPhone ? `\nQuestions: ${contactPhone}` : null,
  ].filter((l) => l !== null);
  return lines.join("\n");
}

/** Two-tap sms: link for the reminder, or null when there is nothing to send. */
export function reminderHref(b, today, opts) {
  if (!b?.phone || !b.travelDate || !b.time) return null;
  return smsHref(b.phone, reminderMessage(b, today, opts));
}
