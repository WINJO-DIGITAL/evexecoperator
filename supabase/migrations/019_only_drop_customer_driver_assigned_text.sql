-- ─── Revert 018; make ONLY the requested change ───────────────────────────────
-- 018 changed too much. This restores the notification behaviour that was in
-- place before it (migrations 015 + 016) and makes the single change the user
-- asked for: the customer is NOT texted when a driver is allocated.
--
-- Everything else is exactly as before:
--   • Customer still gets: booking confirmation, 24-hour reminder (with the
--     fare line), and the live status pings — on the way / arrived / on board /
--     completed / cancelled.  (No 7-day reminder, no driver name in reminders.)
--   • ONLY the "a driver has been assigned" customer text is removed, so
--     assigning or swapping drivers never texts the customer.
--   • Driver notifications are unchanged from 015: allocation alert + 24-hour
--     reminder (fare gated by payment). No "removed from you" notice.

-- ── Customer notifications: 016 behaviour, minus the 'Dispatched' text ────────
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

  if v_pickup_ts is not null then
    v_reminder := 'EV Exec reminder: your airport transfer is tomorrow at '
      || to_char(v_pickup_ts, 'HH24:MI') || '. Ref ' || new.ref || '.' || v_fare;
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
      -- NOTE: no 'Dispatched' case — the customer is NOT told a driver was
      -- assigned. Every other live status ping is unchanged.
      v_msg := case new.status
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

    if new.payment_status is distinct from old.payment_status and v_reminder is not null then
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
  after insert or update of status, payment_status on bookings
  for each row execute function enqueue_operator_customer_notifications();


-- ── Driver notifications: restore 015 exactly (no "removed from you" notice) ──
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
  v_pickup    timestamptz;
  v_timetxt   text;
  v_route     text;
  v_cust      text := coalesce(nullif(trim(new.customer_name), ''), 'Customer');
  v_custphone text := nullif(trim(new.customer_phone), '');
  v_status    text := lower(coalesce(new.payment_status, ''));
  v_fare      text;
  v_alloc     text;
  v_remind    text;
begin
  if tg_op = 'UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue
     where booking_id = new.id and type = 'driver_reminder_24h' and status = 'pending';
  end if;

  if v_new_driver is null then return new; end if;
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone), ''), nullif(trim(email), '')
    into v_phone, v_email
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

  v_route := case
    when new.direction = 'Destination → Airport'
      then coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Pickup')
           || ' -> ' || coalesce(nullif(new.airport, ''), 'Airport')
    else coalesce(nullif(new.airport, ''), 'Airport')
         || ' -> ' || coalesce(nullif(new.dropoff_address, ''), nullif(new.pickup_location, ''), 'Destination')
  end;

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
