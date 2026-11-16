-- Performance-advisor cleanup (semantics-preserving).
--
-- 1. Covering indexes for the 4 unindexed foreign keys. These also back the RLS
--    quals that filter on the same columns, so they're genuinely used.
-- 2. auth_rls_initplan: every policy that called auth.uid()/auth.email()/
--    auth.role() per row is recreated with the call wrapped in a scalar
--    subquery — (select auth.uid()) — so Postgres evaluates it once per query.
--    Access is byte-for-byte identical.
-- 3. Duplicate driver policies merged. Verified BOTH driver identity models are
--    in live use (one driver keyed by auth.uid()=drivers.id, one by
--    email=auth.email()), so the two policies are OR-merged into one — no login
--    loses access, and the "multiple permissive policies" warnings clear.
--
-- Not touched on purpose: the staff (private.is_staff()) and *_insert policies —
-- they aren't flagged and carry the operator app's access, so they're left as-is.

-- ── 1. Foreign-key covering indexes ──────────────────────────────────────────
create index if not exists idx_booking_expenses_booking_id on public.booking_expenses (booking_id);
create index if not exists idx_booking_photos_driver_id     on public.booking_photos (driver_id);
create index if not exists idx_bookings_user_id             on public.bookings (user_id);
create index if not exists idx_push_subscriptions_user_id   on public.push_subscriptions (user_id);

-- ── 2 & 3. RLS policies: wrap auth.* in subselects; merge duplicate driver policies ──

-- booking_expenses
drop policy if exists driver_own_expenses on public.booking_expenses;
create policy driver_own_expenses on public.booking_expenses for all to public
  using      (exists (select 1 from bookings b where b.id = booking_expenses.booking_id and b.assigned_driver_id = (select auth.uid())))
  with check (exists (select 1 from bookings b where b.id = booking_expenses.booking_id and b.assigned_driver_id = (select auth.uid())));

-- booking_photos
drop policy if exists "driver read own booking photos"   on public.booking_photos;
drop policy if exists "driver insert own booking photos" on public.booking_photos;
drop policy if exists "driver delete own booking photos" on public.booking_photos;
create policy "driver read own booking photos"   on public.booking_photos for select to public using ((select auth.uid()) = driver_id);
create policy "driver insert own booking photos" on public.booking_photos for insert to public with check ((select auth.uid()) = driver_id);
create policy "driver delete own booking photos" on public.booking_photos for delete to public using ((select auth.uid()) = driver_id);

-- bookings: customer self-read (wrap) + merge the three driver SELECT policies + merge the two driver UPDATE policies
drop policy if exists customers_see_own_bookings          on public.bookings;
drop policy if exists "Drivers read assigned bookings"    on public.bookings;
drop policy if exists drivers_see_assigned_bookings       on public.bookings;
drop policy if exists drivers_see_available_bookings      on public.bookings;
drop policy if exists "Drivers update assigned booking status" on public.bookings;
drop policy if exists drivers_update_assigned_bookings    on public.bookings;

create policy customers_see_own_bookings on public.bookings for select to authenticated
  using (user_id = (select auth.uid()));

create policy bookings_driver_select on public.bookings for select to public
  using (
       (assigned_driver_id = (select auth.uid()))
    or (assigned_driver_id in (select id from drivers where email = (select auth.email())))
    or ((exists (select 1 from drivers where id = (select auth.uid()))) and assigned_driver_id is null and status = any (array['pending'::text,'accepted'::text]))
  );

create policy bookings_driver_update on public.bookings for update to public
  using (
       (assigned_driver_id = (select auth.uid()))
    or (assigned_driver_id in (select id from drivers where email = (select auth.email())))
  )
  with check (
       (assigned_driver_id = (select auth.uid()))
    or (assigned_driver_id in (select id from drivers where email = (select auth.email())))
  );

-- driver_messages
drop policy if exists "driver read own messages"   on public.driver_messages;
drop policy if exists "driver insert own messages" on public.driver_messages;
create policy "driver read own messages"   on public.driver_messages for select to public using ((select auth.uid()) = driver_id);
create policy "driver insert own messages" on public.driver_messages for insert to public with check (((select auth.uid()) = driver_id) and (from_driver = true));

-- driver_shifts
drop policy if exists "driver read own shifts" on public.driver_shifts;
create policy "driver read own shifts" on public.driver_shifts for select to public using ((select auth.uid()) = driver_id);

-- driver_unavailable_dates
drop policy if exists driver_own_unavailability on public.driver_unavailable_dates;
create policy driver_own_unavailability on public.driver_unavailable_dates for all to public
  using ((select auth.uid()) = driver_id) with check ((select auth.uid()) = driver_id);

-- drivers: merge the two driver self-read policies and the two self-update policies
drop policy if exists "Drivers read own record"   on public.drivers;
drop policy if exists drivers_select_own          on public.drivers;
drop policy if exists "Drivers update own record" on public.drivers;
drop policy if exists drivers_update_own          on public.drivers;
create policy drivers_self_select on public.drivers for select to public
  using ((email = (select auth.email())) or ((select auth.uid()) = id));
create policy drivers_self_update on public.drivers for update to public
  using ((email = (select auth.email())) or ((select auth.uid()) = id))
  with check ((email = (select auth.email())) or ((select auth.uid()) = id));

-- missed_calls
drop policy if exists service_role_only_missed_calls on public.missed_calls;
create policy service_role_only_missed_calls on public.missed_calls for all to public
  using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- notification_log
drop policy if exists "service role only" on public.notification_log;
create policy "service role only" on public.notification_log for all to public
  using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- notification_queue
drop policy if exists service_role_full_access_notification_queue on public.notification_queue;
create policy service_role_full_access_notification_queue on public.notification_queue for all to public
  using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- profiles
drop policy if exists "Users can view own profile"   on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can view own profile"   on public.profiles for select to public using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.profiles for insert to public with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update to public using ((select auth.uid()) = id);

-- push_subscriptions
drop policy if exists driver_own_subs on public.push_subscriptions;
create policy driver_own_subs on public.push_subscriptions for all to public
  using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));

-- saved_addresses
drop policy if exists "Users manage their own saved addresses" on public.saved_addresses;
create policy "Users manage their own saved addresses" on public.saved_addresses for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
