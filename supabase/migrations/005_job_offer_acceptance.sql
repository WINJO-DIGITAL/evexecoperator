-- ─── Job offer / acceptance loop (P0 #2) ──────────────────────────────────────
-- Best-in-market driver apps OFFER a job and require explicit Accept/Decline
-- (with a timeout + auto-reassign) before it's truly dispatched. Today the flow
-- jumps straight to "Dispatched" with no driver acknowledgement.
--
-- DESIGN: this is layered ORTHOGONALLY on top of the existing booking `status`
-- state machine — we deliberately do NOT add values to the constrained `status`
-- enum (the website, driver app and operator all depend on it). The offer lives
-- in its own columns, so the Unassigned → Dispatched → … flow is untouched and
-- non-breaking. The driver app sets offer_status on accept/decline; the operator
-- dashboard surfaces it and can re-offer/reassign on decline or expiry.

alter table bookings add column if not exists offer_status        text
  check (offer_status in ('pending', 'accepted', 'declined', 'expired'));
alter table bookings add column if not exists offered_at          timestamptz;
alter table bookings add column if not exists offer_responded_at  timestamptz;
alter table bookings add column if not exists offer_expires_at    timestamptz;

create index if not exists idx_bookings_offer_status on bookings(offer_status);
