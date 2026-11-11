// Cancellation policy deadlines for customer emails and texts. Same rules as
// evexec/lib/cancellation.js (the website's source of truth, wording on
// https://www.evexec.co.uk/terms sections 4 and 5); keep the two in step.

export const TERMS_VERSION = '3';
// When version 2 went live. Bookings made after it without a recorded
// acceptance (phone, WhatsApp) are held to the current version.
const TERMS_CUTOVER = '2026-10-16T15:00:00Z';

// Charge (% of the fare) by hours of notice before pickup, first match wins.
const BANDS = {
  '1': [{ minHours: 24, pct: 0 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
  '2': [{ minHours: 48, pct: 0 }, { minHours: 24, pct: 25 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
  '3': [{ minHours: 48, pct: 0 }, { minHours: 24, pct: 25 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
};

export function policyPath(version) {
  return version === '1' ? '/terms-v1' : version === '2' ? '/terms-v2' : '/terms';
}

function acceptedVersion(b) {
  if (b && b.terms_version) return String(b.terms_version);
  const m = String((b && b.notes) || '').match(/Accepted cancellation policy v(\d+)/);
  return m ? m[1] : null;
}

export function policyVersion(b) {
  const v = acceptedVersion(b);
  if (v && BANDS[v]) return v;
  const created = Date.parse((b && b.created_at) || '');
  return Number.isFinite(created) && created >= Date.parse(TERMS_CUTOVER) ? TERMS_VERSION : '1';
}

// UK wall-clock date and time to the real instant (GMT/BST aware).
function londonOffsetMinutes(date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - date.getTime()) / 60000;
}
export function pickupInstant(dateStr, timeStr) {
  const d = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!d) return null;
  const t = String(timeStr || '00:00').match(/^(\d{1,2}):(\d{2})/);
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], t ? +t[1] : 0, t ? +t[2] : 0);
  return new Date(guess - londonOffsetMinutes(new Date(guess)) * 60000);
}

// 'HH:MM on DD/MM/YYYY', UK time.
export function ukStamp(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.hour}:${p.minute} on ${p.day}/${p.month}/${p.year}`;
}

// When each charge starts for a journey picked up at `pickup` (a Date):
// [{ from: Date, pct }], earliest first, the free period excluded.
export function chargeStarts(version, pickup) {
  const bands = BANDS[version] || BANDS[TERMS_VERSION];
  return bands.slice(1).map((band, i) => ({ from: new Date(pickup.getTime() - bands[i].minHours * 3600000), pct: band.pct }));
}

// One sentence for texts about the booking's free-cancellation deadline
// ('' when the pickup date is missing).
export function freeCancellationLine(b, now = new Date()) {
  const pickup = pickupInstant(b.travel_date, b.travel_time);
  if (!pickup) return '';
  const end = chargeStarts(policyVersion(b), pickup)[0].from;
  return end > now ? `Free cancellation until ${ukStamp(end)}.` : 'Cancellation charges now apply.';
}
