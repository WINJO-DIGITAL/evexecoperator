import { describe, it, expect } from 'vitest';
import { bookingConfirmed } from './content.js';
import { freeCancellationLine, policyVersion, chargeStarts, pickupInstant, ukStamp } from './cancellation.js';

// Same rules as evexec/lib/cancellation.js; these mirror its unit tests.
const booking = (extra = {}) => ({
  id: 'x', ref: 'EVX-1', customer_name: 'Ann Lee', journey_type: 'To Airport', pickup_location: 'Lytham',
  airport: 'Manchester Airport', dropoff_address: 'Manchester Airport', travel_date: '2026-11-03', travel_time: '03:30',
  quoted_price: 90, operator_response: 'accepted', status: 'Dispatched', payment_status: 'Unpaid',
  created_at: '2026-10-17T09:00:00Z', ...extra,
});

describe('cancellation deadlines', () => {
  it('works out each charge start in UK time', () => {
    const starts = chargeStarts('3', pickupInstant('2026-11-03', '03:30')).map((s) => `${ukStamp(s.from)} ${s.pct}`);
    expect(starts).toEqual(['03:30 on 01/11/2026 25', '03:30 on 02/11/2026 50', '01:30 on 03/11/2026 100']);
  });

  it('holds old unaccepted bookings to version 1 and new ones to the current version', () => {
    expect(policyVersion(booking({ created_at: '2026-10-01T09:00:00Z' }))).toBe('1');
    expect(policyVersion(booking())).toBe('3');
    expect(policyVersion(booking({ notes: 'Accepted cancellation policy v2 at 16:00 on 16/10/2026.' }))).toBe('2');
  });

  it('gives a one-line text sentence', () => {
    expect(freeCancellationLine(booking(), new Date('2026-10-20T10:00:00Z'))).toBe('Free cancellation until 03:30 on 01/11/2026.');
    expect(freeCancellationLine(booking(), new Date('2026-11-02T10:00:00Z'))).toBe('Cancellation charges now apply.');
    expect(freeCancellationLine({})).toBe('');
  });

  it('adds a Cancellation section to the booking confirmed email', () => {
    const early = bookingConfirmed(booking(), { now: new Date('2026-10-20T10:00:00Z') }).text;
    expect(early).toContain('Free cancellation until: 03:30 on 01/11/2026');
    expect(early).toContain('Full fare from: 01:30 on 03/11/2026, or once your driver sets off');
    const late = bookingConfirmed(booking(), { now: new Date('2026-11-02T10:00:00Z') }).text;
    expect(late).toContain('If you cancel now: 50% of the fare');
    const quoted = bookingConfirmed(booking({ airport: null, quoted_price: 650 })).text;
    expect(quoted).toContain('As set out in your quote');
  });
});
