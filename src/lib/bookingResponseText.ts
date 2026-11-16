type Brand = { name: string; phone: string; site: string };

/**
 * The two-tap text sent when no email could be delivered: the booking is
 * confirmed, or the journey is not available. It carries the business's own
 * name, website and phone (whatever it does not have is left out).
 */
export function bookingResponseText(p: {
  accepted: boolean;
  brand: Brand;
  first: string;
  ref: string;
  when: string;
  payUrl: string;
  needsPayment: boolean;
  freeCancellation: string; // e.g. "Free cancellation until 12:00 on 01/01/2027." or ""
}): string {
  const { brand } = p;
  const sender = brand.name ? `${brand.name}: ` : "";
  const questions = brand.phone ? ` Questions: ${brand.phone}` : "";
  if (!p.accepted) {
    return `${sender}Hi ${p.first}, unfortunately ${brand.name || "we"} cannot accommodate your requested journey (${p.when}, Ref ${p.ref}). We apologise for the inconvenience. No payment has been taken.${questions}`;
  }
  const terms = brand.site ? `Terms: ${brand.site.replace(/^https?:\/\/(www\.)?/i, "")}/terms#cancellation` : "";
  return `${sender}Hi ${p.first}, your booking ${p.ref} (${p.when}) is confirmed.${p.needsPayment ? ` Pay by card or choose cash: ${p.payUrl}` : ""} ${p.freeCancellation ? `${p.freeCancellation} ` : ""}${terms}${questions}`
    .replace(/ +$/, "")
    .replace(/  +/g, " ");
}
