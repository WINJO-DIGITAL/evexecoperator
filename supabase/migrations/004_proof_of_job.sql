-- ─── Proof of job (P0 #4) ─────────────────────────────────────────────────────
-- Captures evidence that a job actually happened: passenger-on-board and
-- completion timestamps, plus photo / signature / no-show proofs the driver
-- app uploads. Needed for executive-transfer disputes and billing.
--
-- Additive and non-breaking: new nullable columns + a new table. The operator
-- dashboard reads these to show "Picked up / Completed" times and proof
-- thumbnails; the driver app writes them.

-- Per-booking moment-of-truth timestamps (distinct from the status enum so we
-- keep the actual clock time even if a status is later corrected).
alter table bookings add column if not exists pob_at       timestamptz;
alter table bookings add column if not exists completed_at  timestamptz;

-- Uploaded proofs (image / signature URLs live in storage; we store the URL).
create table if not exists job_proofs (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  kind        text not null
                check (kind in ('pob_photo', 'signature', 'completion_photo', 'no_show_photo')),
  url         text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_job_proofs_booking_id on job_proofs(booking_id);

-- ─── Row Level Security (matches 002 convention) ──────────────────────────────
alter table job_proofs enable row level security;

create policy "job_proofs_service_bypass" on job_proofs
  for all to service_role using (true) with check (true);

create policy "job_proofs_authenticated_all" on job_proofs
  for all to authenticated using (true) with check (true);

create policy "job_proofs_anon_select" on job_proofs
  for select to anon using (true);

create policy "job_proofs_anon_insert" on job_proofs
  for insert to anon with check (true);

-- ─── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'job_proofs'
  ) then
    alter publication supabase_realtime add table job_proofs;
  end if;
end $$;
