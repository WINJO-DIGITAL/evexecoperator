-- Every booking must have a travel date AND a travel time — no exceptions.
--
-- Two website bookings had slipped in with null date/time (the public form
-- failed to capture them); they were deleted, then this constraint added so a
-- dateless/timeless job can never enter or persist in the system again.
--
-- This is the universal backstop. The operator app already validates date/time
-- in validateBookingPayload(); this CHECK also rejects website inserts and any
-- update that would blank the fields — at the database level, for all sources.
alter table public.bookings
  add constraint bookings_require_travel_datetime
  check (
    travel_date is not null
    and nullif(btrim(travel_time), '') is not null
  );
