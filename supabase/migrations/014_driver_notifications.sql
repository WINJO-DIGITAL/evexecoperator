-- ─── Driver notifications (allocation + 24-hour reminder) ─────────────────────
-- Mirrors the customer notification system, but the recipient is the assigned
-- DRIVER. Two events:
--   1. driver_allocated    — sent the moment a driver is allocated to a job.
--   2. driver_reminder_24h — scheduled for pickup − 24h.
-- Both carry the job details AND the customer's contact info so the driver has
-- everything they need. Delivered through the same notification_queue the
-- customer texts use (channel 'sms', plus 'email' when the driver has one), so
-- the existing processor sends them with no extra wiring.
--
-- Fires on INSERT (booking created with a driver) and on UPDATE of the driver
-- columns (allocation / re-allocation / un-allocation). Re-allocating to a
-- different driver moves the pending reminder to the new driver; un-allocating
-- cancels it.

create or replace function enqueue_driver_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_new_driver uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_old_driver uuid := case when tg_op = 'UPDATE'
                            then coalesce(old.assigned_driver_id, old.driver_id)
                            else null end;
  v_phone     text;
  v_email     text;
  v_pickup    timestamptz;
  v_timetxt   text;
  v_route     text;
  v_cust      text := coalesce(nullif(trim(new.customer_name), ''), 'Customer');
  v_custphone text := nullif(trim(new.customer_phone), '');
  v_alloc     text;
  v_remind    text;
begin
  -- On any change of the assigned driver (including un-assign), drop the old
  -- pending reminder so it doesn't fire for a driver who no longer has the job.
  if tg_op = 'UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue
     where booking_id = new.id and type = 'driver_reminder_24h' and status = 'pending';
  end if;

  -- Nothing to do unless a (newly) different driver is now allocated.
  if v_new_driver is null then return new; end if;
  if tg_op = 'UPDATE' and v_new_driver is not distinct from v_old_driver then return new; end if;

  select nullif(trim(phone), ''), nullif(trim(email), '')
    into v_phone, v_email
    from drivers where id = v_new_driver;
  if v_phone is null and v_email is null then return new; end if;

  -- Effective pickup timestamp: prefer pickup_time, else derive from
  -- travel_date + travel_time (regex-guarded so a malformed time can't throw).
  v_pickup := new.pickup_time;
  if v_pickup is null and new.travel_date is not null
     and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$' then
    v_pickup := (new.travel_date::text || ' ' || new.travel_time)::timestamptz;
  end if;
  v_timetxt := coalesce(
    to_char(v_pickup, 'DD Mon HH24:MI'),
    nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon'), '')
                 || ' ' || coalesce(new.travel_time, '')), '')
  );

  -- Direction-aware route string.
  v_route := case
    when new.direction = 'Destination → Airport'
      then coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Pickup')
           || ' -> ' || coalesce(nullif(new.airport, ''), 'Airport')
    else coalesce(nullif(new.airport, ''), 'Airport')
         || ' -> ' || coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Destination')
  end;

  -- Allocation message (job details + customer info).
  v_alloc := 'EV Exec NEW JOB ' || new.ref || ': ' || v_route
    || coalesce(' on ' || v_timetxt, '')
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone, '')
    || coalesce('. Flight ' || nullif(new.flight_number, ''), '')
    || coalesce('. Pax ' || new.passengers::text, '')
    || coalesce('. Bags ' || nullif(new.luggage, ''), '')
    || coalesce('. Price GBP ' || new.quoted_price::text, '') || '.';

  if v_phone is not null then
    insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
    select gen_random_uuid(), new.id, 'driver_allocated', 'sms', v_phone, v_alloc, 'pending', 0, now(), now()
    where not exists (select 1 from notification_queue q
                       where q.booking_id = new.id and q.type = 'driver_allocated'
                         and q.channel = 'sms' and q.recipient = v_phone and q.status = 'pending');
  end if;
  if v_email is not null then
    insert into notification_queue (id, booking_id, type, channel, recipient, subject, body, html, status, attempts, next_attempt_at, created_at)
    select gen_random_uuid(), new.id, 'driver_allocated', 'email', v_email,
           'New job ' || new.ref || ' — ' || v_route, v_alloc, '<p>' || v_alloc || '</p>',
           'pending', 0, now(), now()
    where not exists (select 1 from notification_queue q
                       where q.booking_id = new.id and q.type = 'driver_allocated'
                         and q.channel = 'email' and q.recipient = v_email and q.status = 'pending');
  end if;

  -- 24-hour reminder (job details + customer info), only if pickup is >24h away.
  if v_pickup is not null and v_pickup - interval '24 hours' > now() then
    v_remind := 'EV Exec REMINDER — Job ' || new.ref || ' tomorrow at '
      || to_char(v_pickup, 'HH24:MI') || ': ' || v_route
      || '. Customer ' || v_cust || coalesce(' ' || v_custphone, '')
      || coalesce('. Flight ' || nullif(new.flight_number, ''), '')
      || coalesce('. Pax ' || new.passengers::text, '')
      || coalesce('. Bags ' || nullif(new.luggage, ''), '') || '.';

    if v_phone is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'driver_reminder_24h', 'sms', v_phone, v_remind,
              'pending', 0, v_pickup - interval '24 hours', now());
    end if;
    if v_email is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, subject, body, html, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'driver_reminder_24h', 'email', v_email,
              'Reminder: job ' || new.ref || ' tomorrow', v_remind, '<p>' || v_remind || '</p>',
              'pending', 0, v_pickup - interval '24 hours', now());
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_driver_notifications on bookings;
create trigger trg_enqueue_driver_notifications
  after insert or update of driver_id, assigned_driver_id on bookings
  for each row execute function enqueue_driver_notifications();
