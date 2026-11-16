-- ─── 24-hour reminder for manual (operator) bookings ─────────────────────────
-- Operator bookings store the pickup as travel_date + travel_time and do NOT
-- set pickup_time, so the reminder_24h (which was scheduled off pickup_time)
-- never fired for them. Compute an effective pickup timestamp from
-- travel_date + travel_time when pickup_time is null, and schedule the reminder
-- from that. Deliberately does NOT write pickup_time onto the booking, so the
-- client keeps rendering the naive local time (no timezone display shift).
--
-- The travel_time cast is guarded by a regex so a malformed time (e.g. "ASAP")
-- can never raise and break booking creation — it just skips the reminder.
--
-- A manual booking is already confirmed by the operator, so the confirmation
-- text says "is booked" (not "awaiting confirmation") and there is no
-- accept/reject step. Applied to live Supabase and verified: a booking two days
-- out enqueues received + reminder_24h (scheduled 24h before), a malformed time
-- still creates + sends only the confirmation.

create or replace function public.enqueue_operator_customer_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_phone     text := nullif(trim(new.customer_phone), '');
  v_name      text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_timetxt   text;
  v_pickup_ts timestamptz;
  v_msg       text;
begin
  if coalesce(new.source, 'website') <> 'operator' then return new; end if;
  if v_phone is null then return new; end if;

  if tg_op = 'INSERT' then
    v_pickup_ts := new.pickup_time;
    if v_pickup_ts is null
       and new.travel_date is not null
       and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$' then
      v_pickup_ts := (new.travel_date::text || ' ' || new.travel_time)::timestamptz;
    end if;

    v_timetxt := coalesce(
      to_char(v_pickup_ts, 'DD Mon HH24:MI'),
      nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon'), '')
                   || ' ' || coalesce(new.travel_time, '')), '')
    );

    insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
    select gen_random_uuid(), new.id, 'received', 'sms', v_phone,
           'EV Exec: Hi ' || v_name || ', your airport transfer'
             || coalesce(' (' || v_timetxt || ')', '') || ' is booked. Ref ' || new.ref || '.',
           'pending', 0, now(), now()
    where not exists (select 1 from notification_queue q
                       where q.booking_id = new.id and q.type = 'received' and q.channel = 'sms')
      and not exists (select 1 from notification_log l
                       where l.booking_id = new.id and l.type = 'received' and l.channel = 'sms');

    if v_pickup_ts is not null and v_pickup_ts - interval '24 hours' > now() then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      select gen_random_uuid(), new.id, 'reminder_24h', 'sms', v_phone,
             'EV Exec reminder: your airport transfer is tomorrow at '
               || to_char(v_pickup_ts, 'HH24:MI') || '. Ref ' || new.ref || '.',
             'pending', 0, v_pickup_ts - interval '24 hours', now()
      where not exists (select 1 from notification_queue q
                         where q.booking_id = new.id and q.type = 'reminder_24h' and q.channel = 'sms');
    end if;

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_msg := case new.status
      when 'Dispatched'         then 'EV Exec: a driver has been assigned to your transfer. Ref ' || new.ref || '.'
      when 'En Route'           then 'EV Exec: your driver is on the way. Ref ' || new.ref || '.'
      when 'Arrived'            then 'EV Exec: your driver has arrived at the pickup point. Ref ' || new.ref || '.'
      when 'Passenger On Board' then 'EV Exec: you are now on board — enjoy your journey. Ref ' || new.ref || '.'
      when 'Completed'          then 'EV Exec: thank you for travelling with us. Ref ' || new.ref || '.'
      when 'Cancelled'          then 'EV Exec: your booking ' || new.ref || ' has been cancelled. Please contact us if this is unexpected.'
      else null
    end;

    if new.status = 'Cancelled' and old.status = 'Completed' then
      v_msg := null;
    end if;

    if v_msg is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'status_update', 'sms', v_phone, v_msg, 'pending', 0, now(), now());
    end if;
  end if;

  return new;
end;
$function$;
