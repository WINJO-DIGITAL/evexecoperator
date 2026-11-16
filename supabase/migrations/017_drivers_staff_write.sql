-- ─── Let staff manage drivers (RLS) ───────────────────────────────────────────
-- The drivers table had SELECT and "own record" UPDATE policies, but no policy
-- allowing staff to INSERT / UPDATE / DELETE drivers — so the operator app's
-- Add Driver failed with "new row violates row-level security policy for table
-- drivers". This mirrors the staff_all_* policy already used on bookings and
-- invoices: full access for authenticated staff (private.is_staff()).

drop policy if exists staff_all_drivers on public.drivers;
create policy staff_all_drivers on public.drivers
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());
