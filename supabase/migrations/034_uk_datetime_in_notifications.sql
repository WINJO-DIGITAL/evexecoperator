-- Notification date/time formatting → UK, time-first.
--
-- Combined booking date+time in customer confirmations and driver allocations
-- now reads "02:00 12/07/2027" (HH:MM DD/MM/YYYY) instead of "12 Jul 02:00".
-- Only the v_timetxt formatting changes in each trigger; all other behaviour is
-- identical to migrations 032 (customer) and 031 (driver). The operator Web Push
-- text is formatted the same way in src/app/api/push/dispatch/route.ts.

create or replace function public.enqueue_operator_customer_notifications()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_phone   text := nullif(trim(new.customer_phone), '');
  v_email   text := nullif(trim(new.customer_email), '');
  v_name    text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
  v_sched   timestamptz := coalesce(
              new.pickup_time,
              case when new.travel_date is not null and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$'
                   then (new.travel_date::text || ' ' || new.travel_time)::timestamp at time zone 'Europe/London'
                   else null end);
  v_status  text := lower(coalesce(new.payment_status, ''));
  v_fare    text;
  v_did     uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_dname text; v_dfirst text; v_dvehicle text; v_dplate text;
  v_dclause text := '';
  v_reminder text; v_msg text; v_conf text; v_ch text;
  v_is_operator boolean := coalesce(new.source, 'website') = 'operator';
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  if v_status = 'paid' then v_fare := ' Your fare has been paid in advance — nothing to pay the driver.';
  elsif v_status = 'invoiced' then v_fare := ' Your fare will be invoiced.';
  elsif new.quoted_price is not null then v_fare := ' Please have £' || trim(to_char(new.quoted_price,'FM999990.00')) || ' ready for your driver.';
  else v_fare := ''; end if;

  if v_did is not null then
    select name, vehicle, plate into v_dname, v_dvehicle, v_dplate from drivers where id = v_did;
    v_dfirst := split_part(trim(coalesce(v_dname,'')),' ',1);
    if nullif(v_dfirst,'') is not null then
      v_dclause := ' Your driver, ' || v_dfirst || ', will be in a ' || coalesce(nullif(trim(v_dvehicle),''),'vehicle')
        || coalesce(' (registration ' || nullif(trim(v_dplate),'') || ')','') || '.';
    end if;
  end if;

  if nullif(v_time5,'') is not null then
    v_reminder := 'EV Exec reminder: your airport transfer is tomorrow at ' || v_time5 || '.' || v_dclause
      || ' Ref ' || new.ref || '.' || v_fare;
  end if;

  if tg_op = 'INSERT' then
    if v_is_operator and v_ch is not null then
      v_conf := 'EV Exec: Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';
      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received') then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your EV Exec airport transfer is booked (Ref '||new.ref||')',v_conf,'<p>'||v_conf||'</p>','pending',0,now(),now());
        else
          insert into notification_queue (id,booking_id,type,channel,recipient,body,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','sms',v_phone,v_conf,'pending',0,now(),now());
        end if;
      end if;
    end if;

    if v_sched is not null and v_sched - interval '24 hours' > now() and v_reminder is not null and v_ch is not null then
      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='reminder_24h') then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'reminder_24h','email',v_email,'Reminder: your EV Exec transfer is tomorrow',v_reminder,'<p>'||v_reminder||'</p>','pending',0,v_sched - interval '24 hours',now());
        else
          insert into notification_queue (id,booking_id,type,channel,recipient,body,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'reminder_24h','sms',v_phone,v_reminder,'pending',0,v_sched - interval '24 hours',now());
        end if;
      end if;
    end if;

  elsif tg_op = 'UPDATE' then
    if new.status = 'Cancelled' and old.status is distinct from 'Cancelled' then
      delete from notification_queue
        where booking_id = new.id and type = 'reminder_24h' and status = 'pending';
    end if;

    if new.status is distinct from old.status then
      if new.status='En Route' and old.status='Dispatched' then
        v_msg := 'EV Exec: your driver is on the way. Ref '||new.ref||'.';
      elsif new.status='Arrived' and old.status='En Route' then
        v_msg := 'EV Exec: your driver has arrived at the pickup point. Ref '||new.ref||'.';
      elsif new.status='Cancelled' and old.status<>'Completed'
            and not (new.operator_response = 'rejected'
                     and old.operator_response is distinct from new.operator_response) then
        v_msg := 'EV Exec: your booking '||new.ref||' has been cancelled. Please contact us if this is unexpected.';
      else v_msg := null; end if;

      if v_msg is not null and v_ch is not null then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','email',v_email,'Update on your EV Exec transfer (Ref '||new.ref||')',v_msg,'<p>'||v_msg||'</p>','pending',0,now(),now());
        else
          insert into notification_queue (id,booking_id,type,channel,recipient,body,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','sms',v_phone,v_msg,'pending',0,now(),now());
        end if;
      end if;
    end if;

    if (new.payment_status is distinct from old.payment_status
        or coalesce(new.assigned_driver_id,new.driver_id) is distinct from coalesce(old.assigned_driver_id,old.driver_id))
       and v_reminder is not null then
      update notification_queue
         set body = v_reminder,
             html = case when channel='email' then '<p>'||v_reminder||'</p>' else html end
       where booking_id=new.id and type='reminder_24h' and status='pending';
    end if;
  end if;

  return new;
end;
$function$;

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
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
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
  if v_email is null then return new; end if;  -- drivers: email only (plus push)

  v_route := case
    when nullif(new.pickup_location,'') is not null and nullif(new.dropoff_address,'') is not null
      then new.pickup_location || ' -> ' || new.dropoff_address
    when new.direction='Destination → Airport'
      then coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup') || ' -> ' || coalesce(nullif(new.airport,''),'Airport')
    else coalesce(nullif(new.airport,''),'Airport') || ' -> ' || coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination')
  end;

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
