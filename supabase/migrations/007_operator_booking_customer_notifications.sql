-- ─── Customer texts for manually-entered operator bookings ────────────────────
-- Bookings created in the operator dashboard were NOT getting the customer
-- confirmation ("update") or 24-hour reminder texts: those are enqueued by the
-- website's booking flow, and the operator path only inserts into `bookings`.
-- There is no DB-level enqueue, so manual bookings were silently skipped.
--
-- Fix: a trigger that enqueues the SAME notification_queue rows the existing
-- processor already sends (received/sms + reminder_24h/sms are both present in
-- notification_log, proving the processor delivers them). Gated to
-- source='operator' so website bookings are never double-texted.

alter table bookings add column if not exists source text not null default 'website';

create or replace function enqueue_operator_customer_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_phone   text := nullif(trim(new.customer_phone), '');
  v_name    text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_timetxt text;
begin
  if coalesce(new.source, 'website') <> 'operator' then return new; end if;
  if v_phone is null then return new; end if;

  -- travel_date is a date, travel_time is text, pickup_time is timestamptz.
  v_timetxt := coalesce(
    to_char(new.pickup_time, 'DD Mon HH24:MI'),
    nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon'), '')
                 || ' ' || coalesce(new.travel_time, '')), '')
  );

  -- Confirmation / "update" text, sent immediately.
  insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
  select gen_random_uuid(), new.id, 'received', 'sms', v_phone,
         'EV Exec: Hi ' || v_name || ', your airport transfer'
           || coalesce(' (' || v_timetxt || ')', '') || ' is booked. Ref ' || new.ref || '.',
         'pending', 0, now(), now()
  where not exists (select 1 from notification_queue q
                     where q.booking_id = new.id and q.type = 'received' and q.channel = 'sms')
    and not exists (select 1 from notification_log l
                     where l.booking_id = new.id and l.type = 'received' and l.channel = 'sms');

  -- 24-hour reminder, scheduled for pickup − 24h (only if still in the future).
  if new.pickup_time is not null and new.pickup_time - interval '24 hours' > now() then
    insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
    select gen_random_uuid(), new.id, 'reminder_24h', 'sms', v_phone,
           'EV Exec reminder: your airport transfer is tomorrow at '
             || to_char(new.pickup_time, 'HH24:MI') || '. Ref ' || new.ref || '.',
           'pending', 0, new.pickup_time - interval '24 hours', now()
    where not exists (select 1 from notification_queue q
                       where q.booking_id = new.id and q.type = 'reminder_24h' and q.channel = 'sms');
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_operator_customer_notifications on bookings;
create trigger trg_enqueue_operator_customer_notifications
  after insert on bookings
  for each row execute function enqueue_operator_customer_notifications();
