-- ─── Allow the operator app's payment-method values ──────────────────────────
-- The bookings_payment_method_check constraint only permitted 'card' / 'cash'
-- (lowercase, legacy website values). The operator dashboard's payment-method
-- picker — and the Stripe payment-link route — write human-readable values
-- ('Card', 'Card machine', 'Payment link', 'Cash', 'Bank transfer'), which the
-- old constraint rejected, so setting a method or sending a payment link failed.
--
-- Expand the allowed set to include both the legacy lowercase values (so
-- existing rows still validate) and the operator app values. NULL is still
-- allowed implicitly (clearing the method).

alter table bookings drop constraint if exists bookings_payment_method_check;

alter table bookings add constraint bookings_payment_method_check
  check (payment_method = any (array[
    'card', 'cash',                                   -- legacy website values
    'Card', 'Card machine', 'Payment link',           -- operator app values
    'Cash', 'Bank transfer'
  ]));
