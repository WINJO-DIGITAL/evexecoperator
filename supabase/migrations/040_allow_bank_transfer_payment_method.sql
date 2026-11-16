-- The operator payment-method picker now offers only "Cash" and "Bank Transfer".
-- The existing check constraint allowed "Bank transfer" (lowercase t) but not the
-- new "Bank Transfer", so add it. Everything else is kept so historical rows
-- (cash/Cash) and the separate Stripe "Payment link" flow still validate.
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method = any (array[
    'card','cash','Card','Card machine','Payment link','Cash','Bank transfer','Bank Transfer'
  ]));
