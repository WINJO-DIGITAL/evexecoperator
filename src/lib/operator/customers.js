// Customers, derived from bookings (there is no separate customer table for
// phone/operator bookings). Bookings are the same customer when they share a
// phone number (UK formats normalised) or an email address, so someone who
// booked once by phone and once online with an email shows up once.

/** UK-normalised digits: "+44 7700 900000" and "07700900000" match. */
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("44")) d = `0${d.slice(2)}`;
  return d.length >= 7 ? d : "";
}
export const normEmail = (e) => {
  const s = String(e || "").trim().toLowerCase();
  return s.includes("@") ? s : "";
};

const priceOf = (b) => Number(String(b.price ?? "").replace(/[^0-9.]/g, "")) || 0;

/**
 * Group shaped bookings (hooks/operator/useBookings) into customers.
 * `today` is the UK date YYYY-MM-DD, for next/last trip.
 */
export function groupCustomers(bookings = [], today) {
  // Union-find over bookings linked by phone or email.
  const parent = bookings.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const seen = new Map();
  bookings.forEach((b, i) => {
    for (const key of [normPhone(b.phone) && `p:${normPhone(b.phone)}`, normEmail(b.email) && `e:${normEmail(b.email)}`]) {
      if (!key) continue;
      if (seen.has(key)) union(seen.get(key), i); else seen.set(key, i);
    }
  });

  const groups = new Map();
  bookings.forEach((b, i) => {
    if (!normPhone(b.phone) && !normEmail(b.email)) return; // can't identify the customer
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(b);
  });

  const customers = [];
  for (const list of groups.values()) {
    const live = list.filter((b) => b.status !== "Cancelled");
    const byNewest = [...list].sort((a, b) => `${b.travelDate ?? ""}${b.time ?? ""}`.localeCompare(`${a.travelDate ?? ""}${a.time ?? ""}`));
    const latest = byNewest[0];
    const pick = (field) => byNewest.map((b) => b[field]).find((v) => v && v !== "—") || "";
    // Past = an earlier date, or done today (completed / no-show).
    const past = live.filter((b) => b.travelDate && (b.travelDate < today || ["Completed", "No Show"].includes(b.status)));
    const upcoming = live.filter((b) => b.travelDate && b.travelDate >= today && !["Completed", "No Show"].includes(b.status))
      .sort((a, b) => `${a.travelDate}${a.time}`.localeCompare(`${b.travelDate}${b.time}`));
    const completed = live.filter((b) => b.status === "Completed");
    customers.push({
      id: `${normPhone(pick("phone"))}|${normEmail(pick("email"))}`,
      name: pick("customer") || "Unknown",
      phone: pick("phone"),
      email: pick("email"),
      bookings: byNewest,
      trips: live.length,
      // Paid = completed and settled (card, bank or cash with the driver).
      spend: completed.filter((b) => b.paymentStatus === "Paid" || b.paymentMethod === "Cash").reduce((s, b) => s + priceOf(b), 0),
      unpaid: completed.filter((b) => b.paymentStatus !== "Paid" && b.paymentMethod !== "Cash").reduce((s, b) => s + priceOf(b), 0),
      lastTrip: past.map((b) => b.travelDate).sort().pop() || null,
      nextTrip: upcoming[0] || null,
      latestId: latest?.id,
    });
  }
  return customers.sort((a, b) => a.name.localeCompare(b.name));
}
