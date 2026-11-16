// The price text sent to a customer who asked for a quote (Today → Texts to send,
// then Open Messages and Send from the office's own phone). One place for the wording.
// Dates are DD/MM/YYYY and times are 24-hour HH:MM (house style); plain strings are
// rearranged, never parsed as dates.

export function ddmmyyyy(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function hhmm(t) {
  return String(t || "").slice(0, 5);
}

export function quotePrice(n) {
  const v = Number(n);
  return Number.isInteger(v) ? `£${v}` : `£${v.toFixed(2)}`;
}

/** Accepts "170", "£170", "170.5" or "1,250.00". Returns { value } or { error }. */
export function parsePrice(raw) {
  const s = String(raw ?? "").trim().replace(/^£/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: "Enter the price in pounds, for example 170 or 170.50." };
  const v = Math.round(Number(s) * 100) / 100;
  if (v < 1 || v > 10000) return { error: "The price must be between £1 and £10,000." };
  return { value: v };
}

export function firstName(full) {
  return String(full || "").trim().split(/\s+/)[0] || "there";
}

/** The text itself. yesUrl / noUrl are the customer's reply links. */
export function quoteText({ businessName, customerName, from, to, date, time, returnDate, returnTime, price, yesUrl, noUrl }) {
  const route = [from, to].filter(Boolean).join(" to ") || "your journey";
  const when = [ddmmyyyy(date), hhmm(time) && `at ${hhmm(time)}`].filter(Boolean).join(" ");
  const back = returnDate ? ` with the return on ${ddmmyyyy(returnDate)}${hhmm(returnTime) ? ` at ${hhmm(returnTime)}` : ""}` : "";
  const lines = [
    `Hello ${firstName(customerName)}, thank you for your enquiry${businessName ? ` with ${businessName}` : ""}.`,
    "",
    `For ${route}${when ? ` on ${when}` : ""}${back}, we can do it for ${quotePrice(price)}.`,
    "",
    `To go ahead, tap: ${yesUrl}`,
    `Not going ahead, tap: ${noUrl}`,
    "Or leave it and we will not take it any further.",
  ];
  return lines.join("\n");
}

/** sms: link with the message pre-written (same format as the other two-tap texts). */
export function smsLink(phone, message) {
  return `sms:${String(phone || "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(message || "")}`;
}

/** A timestamp as UK date and 24-hour time (Europe/London), e.g. { date: "14/11/2026", time: "18:30" }. */
export function ukStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.day}/${parts.month}/${parts.year}`, time: `${parts.hour}:${parts.minute}` };
}
