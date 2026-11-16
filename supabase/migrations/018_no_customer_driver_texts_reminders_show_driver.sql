-- ─── Stop texting customers on driver changes; reveal driver in reminders ─────
-- Reworks customer messaging so swapping drivers never spams the customer:
--   • The "a driver has been assigned" text and the live progress pings
--     (on the way / arrived / on board / completed) are removed.
--   • Customers now get: booking confirmation, a 7-DAY reminder, a 24-HOUR
--     reminder, and a cancellation notice — matching the website.
--   • The driver's name (and vehicle) is revealed ONLY in the 7-day and 24-hour
--     reminders. Because reminders are queued when the booking is made, any
--     later driver/payment change rewrites the pending reminders so they are
--     accurate at send time — without sending the customer anything.
--
-- Drivers: unchanged allocation alert, PLUS a one-off "removed from you" notice
-- when a job is reassigned or unassigned away from them.

-- ── Customer notifications ────────────────────────────────────────────────────
create or replace function enqueue_operator_customer_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_phone      text := nullif(trim(new.customer_phone), '');
  v_name       text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_confirmtxt text;
  v_timetxt    text;
  v_datetxt    text;
  v_pickup_ts  timestamptz;
  v_status     text := lower(coalesce(new.payment_status, ''));
  v_fare       text;
  v_did        uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_dname      text;
  v_dvehicle   text;
  v_dclause    text := '';
  v_reminder7  text;
  v_reminder24 text;
  v_refresh    boolean;
begin
  if coalesce(new.source, 'website') <> 'operator' then return new; end if;
  if v_phone is null then return new; end if;

  -- Effective pickup timestamp (regex-guarded cast).
  v_pickup_ts := new.pickup_time;
  if v_pickup_ts is null and new.travel_date is not null
     and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$' then
    v_pickup_ts := (new.travel_date::text || ' ' || new.travel_time)::timestamptz;
  end if;
  v_timetxt := coalesce(to_char(v_pickup_ts, 'HH24:MI'), nullif(new.travel_time, ''));
  v_datetxt := coalesce(to_char(v_pickup_ts, 'DD Mon'), to_char(new.travel_date, 'DD Mon'));

  -- Fare clause (customer-facing).
  if v_status = 'paid' then
    v_fare := ' Your fare has been paid in advance — nothing to pay the driver.';
  elsif v_status = 'invoiced' then
    v_fare := ' Your fare will be invoiced.';
  elsif new.quoted_price is not null then
    v_fare := ' Please have £' || trim(to_char(new.quoted_price, 'FM999990.00')) || ' ready for your driver.';
  else
    v_fare := '';
  end if;

  -- Driver clause — only ever shown in the reminders.
  if v_did is not null then
    select name, vehicle into v_dname, v_dvehicle from drivers where id = v_did;
    if v_dname is not null then
      v_dclause := ' Your driver will be ' || v_dname
        || coalesce(' in a ' || nullif(v_dvehicle, ''), '') || '.';
    end if;
  end if;

  if v_pickup_ts is not null then
    v_reminder7 := 'EV Exec: your airport transfer is coming up on ' || coalesce(v_datetxt, 'your travel date')
      || coalesce(' at ' || v_timetxt, '') || '. Ref ' || new.ref || '.' || v_dclause || v_fare;
    v_reminder24 := 'EV Exec reminder: your airport transfer is tomorrow'
      || coalesce(' at ' || v_timetxt, '') || '. Ref ' || new.ref || '.' || v_dclause || v_fare;
  end if;

  if tg_op = 'INSERT' then
    v_confirmtxt := coalesce(
      to_char(v_pickup_ts, 'DD Mon HH24:MI'),
      nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon'), '')
                   || ' ' || coalesce(new.travel_time, '')), '')
    );

    -- Booking confirmation (no driver).
    insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
    select gen_random_uuid(), new.id, 'received', 'sms', v_phone,
           'EV Exec: Hi ' || v_name || ', your airport transfer'
             || coalesce(' (' || v_confirmtxt || ')', '') || ' is booked. Ref ' || new.ref || '.',
           'pending', 0, now(), now()
    where not exists (select 1 from notification_queue q
                       where q.booking_id = new.id and q.type = 'received' and q.channel = 'sms')
      and not exists (select 1 from notification_log l
                       where l.booking_id = new.id and l.type = 'received' and l.channel = 'sms');

    -- 7-day reminder.
    if v_pickup_ts is not null and v_pickup_ts - interval '7 days' > now() then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      select gen_random_uuid(), new.id, 'reminder_7d', 'sms', v_phone, v_reminder7,
             'pending', 0, v_pickup_ts - interval '7 days', now()
      where not exists (select 1 from notification_queue q
                         where q.booking_id = new.id and q.type = 'reminder_7d' and q.channel = 'sms');
    end if;

    -- 24-hour reminder.
    if v_pickup_ts is not null and v_pickup_ts - interval '24 hours' > now() then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      select gen_random_uuid(), new.id, 'reminder_24h', 'sms', v_phone, v_reminder24,
             'pending', 0, v_pickup_ts - interval '24 hours', now()
      where not exists (select 1 from notification_queue q
                         where q.booking_id = new.id and q.type = 'reminder_24h' and q.channel = 'sms');
    end if;

  elsif tg_op = 'UPDATE' then
    -- The ONLY status text kept is cancellation (safety); all other status
    -- pings — including "driver assigned" — are gone.
    if new.status is distinct from old.status
       and new.status = 'Cancelled' and old.status <> 'Completed' then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'status_update', 'sms', v_phone,
              'EV Exec: your booking ' || new.ref || ' has been cancelled. Please contact us if this is unexpected.',
              'pending', 0, now(), now());
    end if;

    -- Keep the pending reminders accurate for driver / fare changes — silently.
    v_refresh := (new.payment_status is distinct from old.payment_status)
              or (coalesce(new.assigned_driver_id, new.driver_id)
                  is distinct from coalesce(old.assigned_driver_id, old.driver_id));
    if v_refresh then
      if v_reminder7 is not null then
        update notification_queue set body = v_reminder7
         where booking_id = new.id and type = 'reminder_7d' and channel = 'sms' and status = 'pending';
      end if;
      if v_reminder24 is not null then
        update notification_queue set body = v_reminder24
         where booking_id = new.id and type = 'reminder_24h' and channel = 'sms' and status = 'pending';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_operator_customer_notifications on bookings;
create trigger trg_enqueue_operator_customer_notifications
  after insert or update of status, payment_status, driver_id, assigned_driver_id on bookings
  for each row execute function enqueue_operator_customer_notifications();


-- ── Driver notifications (add "removed from you" notice) ──────────────────────
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
  v_driver_changed boolean := (tg_op = 'INSERT' and v_new_driver is not null)
                              or (tg_op = 'UPDATE' and v_new_driver is distinct from v_old_driver);
  v_pay_changed boolean := (tg_op = 'UPDATE' and new.payment_status is distinct from old.payment_status);
  v_phone     text;
  v_email     text;
  v_ophone    text;
  v_oemail    text;
  v_pickup    timestamptz;
  v_timetxt   text;
  v_route     text;
  v_cust      text := coalesce(nullif(trim(new.customer_name), ''), 'Customer');
  v_custphone text := nullif(trim(new.customer_phone), '');
  v_status    text := lower(coalesce(new.payment_status, ''));
  v_fare      text;
  v_alloc     text;
  v_remind    text;
  v_removed   text;
begin
  v_route := case
    when new.direction = 'Destination → Airport'
      then coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Pickup')
           || ' -> ' || coalesce(nullif(new.airport, ''), 'Airport')
    else coalesce(nullif(new.airport, ''), 'Airport')
         || ' -> ' || coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Destination')
  end;

  -- On any change of the assigned driver: drop the old pending reminder and tell
  -- the old driver the job is off them.
  if tg_op = 'UPDATE' and v_old_driver is not null and v_new_driver is distinct from v_old_driver then
    delete from notification_queue
     where booking_id = new.id and type = 'driver_reminder_24h' and status = 'pending';

    select nullif(trim(phone), ''), nullif(trim(email), '') into v_ophone, v_oemail
      from drivers where id = v_old_driver;
    v_removed := 'EV Exec: Job ' || new.ref || ' (' || v_route
      || ') has been removed from you — you no longer need to cover it.';
    if v_ophone is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'driver_unassigned', 'sms', v_ophone, v_removed, 'pending', 0, now(), now());
    end if;
    if v_oemail is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, subject, body, html, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'driver_unassigned', 'email', v_oemail,
              'Job ' || new.ref || ' removed', v_removed, '<p>' || v_removed || '</p>', 'pending', 0, now(), now());
    end if;
  end if;

  if v_new_driver is null then return new; end if;
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone), ''), nullif(trim(email), '') into v_phone, v_email
    from drivers where id = v_new_driver;
  if v_phone is null and v_email is null then return new; end if;

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

  if v_status = 'paid' then
    v_fare := ' Fare: PAID in advance — nothing to collect.';
  elsif v_status = 'invoiced' then
    v_fare := ' Fare: invoiced to account — do not collect.';
  elsif new.quoted_price is not null then
    v_fare := ' Fare to collect GBP ' || trim(to_char(new.quoted_price, 'FM999990.00')) || '.';
  else
    v_fare := ' Fare: TBC.';
  end if;

  v_remind := 'EV Exec REMINDER — Job ' || new.ref || ' tomorrow at '
    || coalesce(to_char(v_pickup, 'HH24:MI'), 'the booked time') || ': ' || v_route
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone, '')
    || coalesce('. Flight ' || nullif(new.flight_number, ''), '')
    || coalesce('. Pax ' || new.passengers::text, '')
    || coalesce('. Bags ' || nullif(new.luggage, ''), '')
    || '.' || v_fare;

  if v_driver_changed then
    v_alloc := 'EV Exec NEW JOB ' || new.ref || ': ' || v_route
      || coalesce(' on ' || v_timetxt, '')
      || '. Customer ' || v_cust || coalesce(' ' || v_custphone, '')
      || coalesce('. Flight ' || nullif(new.flight_number, ''), '')
      || coalesce('. Pax ' || new.passengers::text, '')
      || coalesce('. Bags ' || nullif(new.luggage, ''), '') || '.';

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

    if v_pickup is not null and v_pickup - interval '24 hours' > now() then
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

  elsif v_pay_changed then
    update notification_queue
       set body = v_remind,
           html = case when channel = 'email' then '<p>' || v_remind || '</p>' else html end
     where booking_id = new.id and type = 'driver_reminder_24h' and status = 'pending';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_driver_notifications on bookings;
create trigger trg_enqueue_driver_notifications
  after insert or update of driver_id, assigned_driver_id, payment_status on bookings
  for each row execute function enqueue_driver_notifications();
