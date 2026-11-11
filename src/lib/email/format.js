// Booking helpers the emails need (same rules as evexec/lib/format.js).

const PRICES = {
  'Manchester Airport': { oneWay: 90, return: 160 },
  'Liverpool Airport': { oneWay: 95, return: 170 },
  'Leeds Bradford Airport': { oneWay: 135, return: 250 },
  'Birmingham Airport': { oneWay: 215, return: 410 },
  'Newcastle Airport': { oneWay: 250, return: 480 },
};
const isReturnLeg = (b) => /^Return leg created automatically/i.test(String(b.notes || ''));

export function getStops(b) {
  if (Array.isArray(b.additional_stops) && b.additional_stops.length) return b.additional_stops;
  return String(b.notes || '').split('\n').filter((l) => /^Stop \d+:/i.test(l))
    .map((l) => l.replace(/^Stop \d+:\s*/i, '').trim()).filter(Boolean);
}

// True when the airport is on the published price list (not a quoted job).
export function onPriceList(b) {
  return Boolean(PRICES[b.airport]);
}

export function getPrice(b) {
  const p = Number(b.price ?? b.quoted_price);
  if (Number.isFinite(p) && p > 0) return p;
  const t = PRICES[b.airport];
  return t ? (b.return_journey ? t.return : t.oneWay) : null;
}

export function paymentLine(b) {
  if (isReturnLeg(b)) {
    const m = String(b.notes).match(/Outbound ref:\s*(\S+)/i);
    return m ? `Included with booking ${m[1].replace(/[.,]$/, '')}` : 'Included with your outbound booking';
  }
  const method = String(b.payment_method || '').trim().toLowerCase();
  const status = String(b.payment_status || '').trim().toLowerCase();
  const bank = method === 'bank transfer' || method === 'bank_transfer';
  if (status === 'paid') {
    if (method === 'card' || method === 'payment link') return 'Paid by card';
    if (method === 'cash') return 'Paid in cash';
    if (bank) return 'Paid by bank transfer';
    return 'Paid';
  }
  if (method === 'cash') return 'Cash on the day';
  if (bank) return 'Bank transfer (payment pending)';
  if (method === 'payment link') return 'Payment link sent (payment pending)';
  if (method === 'card') return 'Card payment pending';
  return 'Payment required';
}

export function needsPayment(b) {
  const s = String(b.payment_status || '').toLowerCase();
  return s !== 'paid' && s !== 'invoiced' && !isReturnLeg(b) && Boolean(getPrice(b));
}
