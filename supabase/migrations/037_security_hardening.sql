-- Security hardening (audit follow-up).
--
-- 1. queue_customer_sms: was callable by anon → an unauthenticated request could
--    enqueue an SMS to any number (Twilio toll-fraud / spam). Now authenticated
--    only; /api/booking-response calls it with the operator's JWT.
-- 2. register/unregister_operator_push + get_push_public_key: were anon-callable.
--    Registering a device to the operator push channel leaks customer booking
--    details, so require an authenticated operator (the operator app is signed in
--    when it subscribes).
-- 3. Trigger functions and internal helpers were exposed as PostgREST RPCs. They
--    only make sense inside a trigger / SECURITY DEFINER context, so execute is
--    revoked from every client role. (Triggers fire regardless of EXECUTE grants,
--    and SECURITY DEFINER callers run as the owner, so this is behaviour-neutral.)
-- 4. Drop the duplicate index on bookings(assigned_driver_id).
-- 5. Pin search_path on the remaining flagged functions.
--
-- Intentionally left as-is: get_push_dispatch_bundle stays callable by anon
-- because the /api/push/dispatch route is invoked by a DB trigger with no user
-- session and authenticates with the shared webhook secret (there is no
-- service-role key in the deployment).

-- ── 1. queue_customer_sms → authenticated only ───────────────────────────────
-- Revoke both the explicit anon grant AND the default PUBLIC grant (which also
-- covers anon), then re-grant authenticated explicitly.
revoke execute on function public.queue_customer_sms(text,text,text,text) from public, anon;
grant  execute on function public.queue_customer_sms(text,text,text,text) to authenticated;

-- ── 2. operator push registration → authenticated only ───────────────────────
revoke execute on function public.register_operator_push(text,text,text,text) from public, anon;
grant  execute on function public.register_operator_push(text,text,text,text) to authenticated;
revoke execute on function public.unregister_operator_push(text) from public, anon;
grant  execute on function public.unregister_operator_push(text) to authenticated;
revoke execute on function public.get_push_public_key() from public, anon;
grant  execute on function public.get_push_public_key() to authenticated;

-- ── 3. Trigger functions + internal helpers → no client execute ──────────────
revoke execute on function public.enqueue_driver_notifications()             from public, anon, authenticated;
revoke execute on function public.enqueue_operator_customer_notifications()  from public, anon, authenticated;
revoke execute on function public.notify_operator_new_booking()             from public, anon, authenticated;
revoke execute on function public.notify_driver_job_update()                from public, anon, authenticated;
revoke execute on function public.notif_pick_channel(boolean,boolean,boolean) from public, anon, authenticated;
revoke execute on function public.evexec_esc(text)                          from public, anon, authenticated;
revoke execute on function public.evexec_notification_email(text,text,text,text,jsonb,text) from public, anon, authenticated;

-- ── 4. Drop the duplicate index (identical to idx_bookings_assigned_driver) ───
drop index if exists public.idx_bookings_driver;

-- ── 5. Pin search_path on the remaining flagged functions ────────────────────
alter function public.get_booking_totals(timestamptz)             set search_path = 'public','pg_temp';
alter function public.get_booking_status_breakdown(timestamptz)   set search_path = 'public','pg_temp';
alter function public.sync_booking_driver_assignment_fields()     set search_path = 'public','pg_temp';
alter function public.touch_driver_location_updated_at()          set search_path = 'public','pg_temp';
