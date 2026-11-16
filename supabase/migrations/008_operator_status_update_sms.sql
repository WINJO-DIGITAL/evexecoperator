-- ─── Customer SMS on status changes for operator bookings ─────────────────────
-- Extends enqueue_operator_customer_notifications() to also send a customer SMS
-- when an operator booking changes status (driver assigned / on the way /
-- arrived / on board / completed / cancelled). Still gated to source='operator'
-- and uses the proven sms channel; type='status_update'.
--
-- Note: the live booking status machine includes an 'Arrived' state (between
-- En Route and Passenger On Board) that the operator repo's BookingStatus type
-- does not yet list.

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
  v_msg     text;
begin
  if coalesce(new.source, 'website') <> 'operator' then return new; end if;
  if v_phone is null then return new; end if;

  if tg_op = 'INSERT' then
    v_timetxt := coalesce(
      to_char(new.pickup_time, 'DD Mon HH24:MI'),
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

    if new.pickup_time is not null and new.pickup_time - interval '24 hours' > now() then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      select gen_random_uuid(), new.id, 'reminder_24h', 'sms', v_phone,
             'EV Exec reminder: your airport transfer is tomorrow at '
               || to_char(new.pickup_time, 'HH24:MI') || '. Ref ' || new.ref || '.',
             'pending', 0, new.pickup_time - interval '24 hours', now()
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

    if v_msg is not null then
      insert into notification_queue (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
      values (gen_random_uuid(), new.id, 'status_update', 'sms', v_phone, v_msg, 'pending', 0, now(), now());
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_operator_customer_notifications on bookings;
create trigger trg_enqueue_operator_customer_notifications
  after insert or update of status on bookings
  for each row execute function enqueue_operator_customer_notifications();
