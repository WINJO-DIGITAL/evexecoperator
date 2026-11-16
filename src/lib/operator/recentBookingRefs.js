// Tracks booking refs this browser tab just created, so the new-booking alert
// doesn't notify an operator about a booking they made themselves (they already
// get the "Booking created" toast). Entries expire after a short window.

const created = new Map(); // ref -> timestamp(ms)

export function markBookingCreated(ref) {
  if (ref) created.set(ref, Date.now());
}

export function wasBookingJustCreated(ref, windowMs = 30000) {
  if (!ref) return false;
  const t = created.get(ref);
  if (!t) return false;
  if (Date.now() - t > windowMs) {
    created.delete(ref);
    return false;
  }
  return true;
}
