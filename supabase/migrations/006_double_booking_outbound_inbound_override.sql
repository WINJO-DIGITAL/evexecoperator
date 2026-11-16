-- ─── Double-booking override: outbound → inbound chaining ─────────────────────
-- The driver double-booking guard blocks assigning a driver any active booking
-- within ±3 hours of another. For airport work this wrongly blocks the normal
-- case of a driver doing an OUTBOUND (To Airport) drop-off and an INBOUND
-- (From Airport) pick-up immediately after.
--
-- This override exempts a same-driver outbound+inbound PAIR inside the 3h window
-- as long as the two pickups are not at the exact same time. Everything else is
-- unchanged: two same-direction jobs in the window, simultaneous jobs, and
-- unknown-direction jobs ("Point to Point") still block.
--
-- Direction is read from `journey_type` first (the reliable source of truth),
-- falling back to `direction`.

CREATE OR REPLACE FUNCTION public.prevent_driver_double_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  conflict_count int;
  new_dir text;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.pickup_time IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('Completed', 'Cancelled') THEN RETURN NEW; END IF;

  new_dir := CASE
    WHEN lower(coalesce(NEW.journey_type,'')) LIKE '%to airport%'   THEN 'to'
    WHEN lower(coalesce(NEW.journey_type,'')) LIKE '%from airport%' THEN 'from'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'destination%'   THEN 'to'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'airport%'       THEN 'from'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'from airport%'  THEN 'from'
    ELSE NULL
  END;

  SELECT count(*) INTO conflict_count
  FROM bookings b
  WHERE b.driver_id  = NEW.driver_id
    AND b.id        != NEW.id
    AND b.status NOT IN ('Completed', 'Cancelled')
    AND b.pickup_time BETWEEN (NEW.pickup_time - INTERVAL '3 hours')
                          AND (NEW.pickup_time + INTERVAL '3 hours')
    AND NOT (
      new_dir IS NOT NULL
      AND b.pickup_time <> NEW.pickup_time
      AND (CASE
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%to airport%'   THEN 'to'
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%from airport%' THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'destination%'   THEN 'to'
        WHEN lower(coalesce(b.direction,''))    LIKE 'airport%'       THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'from airport%'  THEN 'from'
        ELSE NULL
      END) IS NOT NULL
      AND new_dir <> (CASE
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%to airport%'   THEN 'to'
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%from airport%' THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'destination%'   THEN 'to'
        WHEN lower(coalesce(b.direction,''))    LIKE 'airport%'       THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'from airport%'  THEN 'from'
        ELSE NULL
      END)
    );

  IF conflict_count > 0 THEN
    RAISE EXCEPTION
      'Driver already has an active booking within 3 hours of this pickup time. '
      'Resolve or complete the existing booking before reassigning.';
  END IF;

  RETURN NEW;
END;
$function$;
