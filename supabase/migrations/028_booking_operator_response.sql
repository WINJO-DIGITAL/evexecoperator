-- Operator accept/reject of incoming website bookings.
--
-- When a customer books on the website, the operator gets a push notification
-- (trg_operator_new_booking_push) and the job now needs an explicit Accept or
-- Reject in the operator app. operator_response tracks that decision; on accept
-- or reject the operator app notifies the customer (email first via Resend, SMS
-- fallback via the queue) — see src/app/api/booking-response.
alter table public.bookings
  add column if not exists operator_response text
    check (operator_response in ('accepted','rejected')),
  add column if not exists operator_responded_at timestamptz;

-- Backfill existing website bookings so only NEW ones show as awaiting a decision:
-- anything already progressed counts as accepted; already-cancelled as rejected.
update public.bookings
   set operator_response = case when status = 'Cancelled' then 'rejected' else 'accepted' end,
       operator_responded_at = coalesce(updated_at, created_at, now())
 where source = 'website' and operator_response is null;

-- SMS fallback: the /api/booking-response route (anon key) enqueues an SMS for
-- the external notification processor to send. SECURITY DEFINER so it can write
-- the RLS-locked queue; the booking is resolved by ref.
create or replace function public.queue_customer_sms(
  p_ref text, p_recipient text, p_body text, p_type text default 'operator_response')
returns void
language plpgsql security definer set search_path = 'public','pg_temp'
as $$
declare v_id uuid;
begin
  if p_recipient is null or btrim(p_recipient) = '' or p_body is null then return; end if;
  select id into v_id from public.bookings where ref = p_ref;
  insert into public.notification_queue
    (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
  values
    (gen_random_uuid(), v_id, p_type, 'sms', p_recipient, p_body, 'pending', 0, now(), now());
end;
$$;
grant execute on function public.queue_customer_sms(text,text,text,text) to anon, authenticated;
