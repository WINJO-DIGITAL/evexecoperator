-- ─── Driver live location tracking (P0 #1) ────────────────────────────────────
-- Backs real-time driver tracking: the driver app upserts the driver's current
-- position (~every 10s on an active job); the operator dashboard and customer
-- pages subscribe via Supabase Realtime to derive live ETAs and a live map.
--
-- One row per driver (driver_id is the PK) = the driver's CURRENT location.
-- Upsert on conflict keeps it a single moving point rather than an audit trail.
-- (A history table can be added later if breadcrumbs/replay are needed.)

create table if not exists driver_locations (
  driver_id    uuid primary key references drivers(id) on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  heading      double precision check (heading >= 0 and heading < 360),
  speed        double precision check (speed >= 0),
  accuracy     double precision check (accuracy >= 0),
  booking_ref  text,
  updated_at   timestamptz not null default now()
);

create index if not exists idx_driver_locations_updated_at on driver_locations(updated_at desc);

-- Keep updated_at fresh on every upsert even if the client omits it.
create or replace function touch_driver_location_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists driver_locations_touch on driver_locations;
create trigger driver_locations_touch
  before insert or update on driver_locations
  for each row execute function touch_driver_location_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Matches the project convention (see 002_rls_policies.sql):
--   service_role  → unrestricted
--   authenticated → full read/write (operators)
--   anon          → read (operator/customer realtime) + write (driver app upsert)
-- The driver app and operator both connect with the anon key, so anon needs
-- insert/update here to record positions.
alter table driver_locations enable row level security;

create policy "driver_locations_service_bypass" on driver_locations
  for all to service_role using (true) with check (true);

create policy "driver_locations_authenticated_all" on driver_locations
  for all to authenticated using (true) with check (true);

create policy "driver_locations_anon_select" on driver_locations
  for select to anon using (true);

create policy "driver_locations_anon_insert" on driver_locations
  for insert to anon with check (true);

create policy "driver_locations_anon_update" on driver_locations
  for update to anon using (true) with check (true);

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Publish to the realtime publication so postgres_changes subscriptions fire.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table driver_locations;
  end if;
end $$;
