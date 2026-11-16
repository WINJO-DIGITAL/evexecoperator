-- ─── Driver fare on the 24h reminder (gated by payment status) ────────────────
-- Refines the driver notifications from 014:
--   • The allocation alert no longer shows the price.
--   • The 24-hour reminder now carries a fare line so the driver knows what to
--     collect — UNLESS the fare was paid in advance:
--       Unpaid    → "Fare to collect GBP 150.00."
--       Invoiced  → "Fare: invoiced to account — do not collect."
--       Paid      → "Fare: PAID in advance — nothing to collect."
--   • Because the reminder is queued at allocation (often days ahead), a later
--     change to the booking's payment status rewrites the pending reminder so it
--     is accurate at send time. Marking the fare paid in the operator app
--     therefore removes the price from the reminder the driver eventually gets.

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
  -- On any change of the assigned driver (including un-assign), drop the old
  -- pending reminder so it doesn't fire for a driver who no longer has the job.
  if tg_op = 'UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue
     where booking_id = new.id and type = 'driver_reminder_24h' and status = 'pending';
  end if;

  if v_new_driver is null then return new; end if;
  -- Act only when the driver changed or the payment status changed.
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone), ''), nullif(trim(email), '')
    into v_phone, v_email
    from drivers where id = v_new_driver;
  if v_phone is null and v_email is null then return new; end if;

  -- Effective pickup timestamp (regex-guarded cast).
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

  -- Fare clause for the reminder — the whole point of this migration.
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

  ---------------------------------------------------------------------------
  -- CASE 1: a (new) driver was allocated — send the allocation alert (no
  -- price) and (re)schedule the 24h reminder.
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- CASE 2: same driver, payment status changed — rewrite the pending
  -- reminder so it reflects the new fare status at send time.
  ---------------------------------------------------------------------------
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
