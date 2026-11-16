-- ─── Allow operators to cancel a job even after it's Completed ────────────────
-- enforce_booking_status_transition() treated 'Completed' as terminal (no
-- onward transitions), so an operator could not cancel/void a job that had
-- already been marked complete. Allow 'Completed' → 'Cancelled' while keeping
-- every other rule (and 'Cancelled' itself) unchanged. Applied to live Supabase.

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
      allowed := array['Dispatched', 'Cancelled'];
    when 'Dispatched' then
      allowed := array['En Route', 'Cancelled'];
    when 'En Route' then
      allowed := array['Arrived', 'Passenger On Board', 'Cancelled'];
    when 'Arrived' then
      allowed := array['Passenger On Board', 'Cancelled'];
    when 'Passenger On Board' then
      allowed := array['Completed', 'Arrived', 'Cancelled'];
    when 'Completed' then
      -- Operators may cancel/void a job even after it was marked complete.
      allowed := array['Cancelled'];
    when 'Cancelled' then
      allowed := array[]::text[];
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
