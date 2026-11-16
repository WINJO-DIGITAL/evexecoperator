-- ─── Let operators reverse a status; keep customer pings forward-only ─────────
-- Two changes:
--  1. enforce_booking_status_transition now also allows the REVERSE of each
--     forward edge (plus reinstating a cancelled job), so an operator can step a
--     job back to correct a mistake. Every existing FORWARD edge is preserved, so
--     the driver app's live updates are unaffected.
--  2. The customer "your driver is on the way" / "has arrived" pings now fire
--     ONLY on a forward move into those states — so reversing a job (e.g.
--     On Board -> En Route) never re-texts the customer. (Confirmation, the
--     24h reminder with driver + fare, cancellation and payment sync unchanged.)

-- ── Status transition guard: forward (driver) + reverse (operator correction) ──
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  allowed text[];
begin
  if new.status = old.status then return new; end if;

  case old.status
    when 'Unassigned' then
      allowed := array['Dispatched', 'Cancelled', 'Unassigned / Missed Call Recovery'];
    when 'Unassigned / Missed Call Recovery' then
      allowed := array['Dispatched', 'Cancelled', 'Unassigned'];
    when 'Dispatched' then
      allowed := array['En Route', 'Cancelled', 'Unassigned'];                       -- + reverse
    when 'En Route' then
      allowed := array['Arrived', 'Passenger On Board', 'Cancelled', 'Dispatched'];  -- + reverse
    when 'Arrived' then
      allowed := array['Passenger On Board', 'Cancelled', 'En Route'];               -- + reverse
    when 'Passenger On Board' then
      allowed := array['Completed', 'Arrived', 'Cancelled', 'En Route'];             -- + reverse
    when 'Completed' then
      allowed := array['Cancelled', 'Passenger On Board'];                           -- + reverse
    when 'Cancelled' then
      allowed := array['Unassigned'];                                                -- reinstate
    else
      return new;
  end case;

  if not (new.status = any(allowed)) then
    raise exception 'Invalid status transition: % to %. Allowed: %',
      old.status, new.status, array_to_string(allowed, ', ');
  end if;

  return new;
end;
$function$;

-- ── Customer notifications: forward-only progress pings ───────────────────────
create or replace function enqueue_operator_customer_notifications()
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
  v_status    text := lower(coalesce(new.payment_status, ''));
  v_fare      text;
  v_did       uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_dname     text;
  v_dfirst    text;
  v_dvehicle  text;
  v_dplate    text;
  v_dclause   text := '';
  v_reminder  text;
  v_msg       text;
begin
  if coalesce(new.source, 'website') <> 'operator' then return new; end if;
  if v_phone is null then return new; end if;

  v_pickup_ts := new.pickup_time;
  if v_pickup_ts is null
     and new.travel_date is not null
     and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$' then
    v_pickup_ts := (new.travel_date::text || ' ' || new.travel_time)::timestamptz;
  end if;

  if v_status = 'paid' then
    v_fare := ' Your fare has been paid in advance — nothing to pay the driver.';
  elsif v_status = 'invoiced' then
    v_fare := ' Your fare will be invoiced.';
  elsif new.quoted_price is not null then
    v_fare := ' Please have £' || trim(to_char(new.quoted_price, 'FM999990.00')) || ' ready for your driver.';
  else
    v_fare := '';
  end if;

  if v_did is not null then
    select name, vehicle, plate into v_dname, v_dvehicle, v_dplate from drivers where id = v_did;
    v_dfirst := split_part(trim(coalesce(v_dname, '')), ' ', 1);
    if nullif(v_dfirst, '') is not null then
      v_dclause := ' Your driver, ' || v_dfirst || ', will be in a '
        || coalesce(nullif(trim(v_dvehicle), ''), 'vehicle')
        || coalesce(' (registration ' || nullif(trim(v_dplate), '') || ')', '') || '.';
    end if;
  end if;

  if v_pickup_ts is not null then
    v_reminder := 'EV Exec reminder: your airport transfer is tomorrow at '
      || to_char(v_pickup_ts, 'HH24:MI') || '.' || v_dclause
      || ' Ref ' || new.ref || '.' || v_fare;
  end if;

  if tg_op = 'INSERT' then
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
      select gen_random_uuid(), new.id, 'reminder_24h', 'sms', v_phone, v_reminder,
             'pending', 0, v_pickup_ts - interval '24 hours', now()
      where not exists (select 1 from notification_queue q
                         where q.booking_id = new.id and q.type = 'reminder_24h' and q.channel = 'sms');
    end if;

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      -- Forward-only: reversing a job (old status is a LATER state) sends nothing.
      if new.status = 'En Route' and old.status = 'Dispatched' then
        v_msg := 'EV Exec: your driver is on the way. Ref ' || new.ref || '.';
      elsif new.status = 'Arrived' and old.status = 'En Route' then
        v_msg := 'EV Exec: your driver has arrived at the pickup point. Ref ' || new.ref || '.';
      elsif new.status = 'Cancelled' and old.status <> 'Completed' then
        v_msg := 'EV Exec: your booking ' || new.ref || ' has been cancelled. Please contact us if this is unexpected.';
      else
        v_msg := null;
      end if;

      if v_msg is not null then
        insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
        values (gen_random_uuid(), new.id, 'status_update', 'sms', v_phone, v_msg, 'pending', 0, now(), now());
      end if;
    end if;

    if (new.payment_status is distinct from old.payment_status
        or coalesce(new.assigned_driver_id, new.driver_id)
           is distinct from coalesce(old.assigned_driver_id, old.driver_id))
       and v_reminder is not null then
      update notification_queue
         set body = v_reminder
       where booking_id = new.id and type = 'reminder_24h' and channel = 'sms' and status = 'pending';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_operator_customer_notifications on bookings;
create trigger trg_enqueue_operator_customer_notifications
  after insert or update of status, payment_status, driver_id, assigned_driver_id on bookings
  for each row execute function enqueue_operator_customer_notifications();
