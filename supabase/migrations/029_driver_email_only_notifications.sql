-- Notification policy update.
--   Operators : in-app push only (unchanged — operators never received SMS).
--   Drivers   : driver-app push + email only (no SMS).
--   Customers : email with SMS fallback for all messages (see migration 030).
--
-- enqueue_driver_notifications now only ever enqueues EMAIL for drivers; the
-- instant "new job" alert is the existing driver-app push. If a driver has no
-- email on file they simply rely on that push. Any driver SMS still sitting in
-- the queue is cancelled so nothing texts them going forward.
--
-- (Full function body applied via the driver_email_only_notifications migration;
-- the only change from the previous version is that every notif_pick_channel /
-- SMS branch for drivers is replaced by an email-only insert gated on the
-- driver's email address.)
create or replace function public.enqueue_driver_notifications()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_new_driver uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_old_driver uuid := case when tg_op='UPDATE' then coalesce(old.assigned_driver_id, old.driver_id) else null end;
  v_driver_changed boolean := (tg_op='INSERT' and v_new_driver is not null) or (tg_op='UPDATE' and v_new_driver is distinct from v_old_driver);
  v_pay_changed boolean := (tg_op='UPDATE' and new.payment_status is distinct from old.payment_status);
  v_phone text; v_email text; v_route text;
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_daymon  text := case when new.travel_date is not null then to_char(new.travel_date,'DD Mon') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_daymon,'') || ' ' || coalesce(v_time5,'')), '');
  v_sched   timestamptz := coalesce(
              new.pickup_time,
              case when new.travel_date is not null and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$'
                   then (new.travel_date::text || ' ' || new.travel_time)::timestamp at time zone 'Europe/London'
                   else null end);
  v_cust text := coalesce(nullif(trim(new.customer_name),''),'Customer');
  v_custphone text := nullif(trim(new.customer_phone),'');
  v_status text := lower(coalesce(new.payment_status,''));
  v_fare text; v_alloc text; v_remind text;
begin
  if tg_op='UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;
  if v_new_driver is null then return new; end if;
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone),''), nullif(trim(email),'') into v_phone, v_email from drivers where id=v_new_driver;
  -- Email only for drivers (plus the driver-app push); no SMS.
  if v_email is null then return new; end if;

  v_route := case when new.direction='Destination → Airport'
    then coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup') || ' -> ' || coalesce(nullif(new.airport,''),'Airport')
    else coalesce(nullif(new.airport,''),'Airport') || ' -> ' || coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination') end;

  if v_status='paid' then v_fare := ' Fare: PAID in advance — nothing to collect.';
  elsif v_status='invoiced' then v_fare := ' Fare: invoiced to account — do not collect.';
  elsif new.quoted_price is not null then v_fare := ' Fare to collect GBP ' || trim(to_char(new.quoted_price,'FM999990.00')) || '.';
  else v_fare := ' Fare: TBC.'; end if;

  v_remind := 'EV Exec REMINDER — Job ' || new.ref || ' tomorrow at ' || coalesce(nullif(v_time5,''),'the booked time') || ': ' || v_route
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
    || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.' || v_fare;

  if v_driver_changed then
    v_alloc := 'EV Exec NEW JOB ' || new.ref || ': ' || v_route || coalesce(' on ' || v_timetxt,'')
      || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
      || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.';

    insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
    select gen_random_uuid(),new.id,'driver_allocated','email',v_email,'New job '||new.ref||' — '||v_route,v_alloc,'<p>'||v_alloc||'</p>','pending',0,now(),now()
    where not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='driver_allocated' and q.status='pending');

    if v_sched is not null and v_sched - interval '24 hours' > now() then
      insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
      values (gen_random_uuid(),new.id,'driver_reminder_24h','email',v_email,'Reminder: job '||new.ref||' tomorrow',v_remind,'<p>'||v_remind||'</p>','pending',0,v_sched - interval '24 hours',now());
    end if;

  elsif v_pay_changed then
    update notification_queue set body=v_remind, html=case when channel='email' then '<p>'||v_remind||'</p>' else html end
     where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;

  return new;
end;
$function$;

update public.notification_queue
   set status = 'cancelled'
 where channel = 'sms' and status = 'pending'
   and type in ('driver_allocated','driver_reminder_24h');
