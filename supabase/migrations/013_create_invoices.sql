-- ─── Invoices ────────────────────────────────────────────────────────────────
-- Standalone billing for the operator app. Invoices can be created from scratch
-- or prefilled from a booking (booking_ref is a loose text reference, not a FK,
-- so an invoice survives even if the booking is later removed).
--
-- Line items are stored as jsonb: [{ description, quantity, unit_price }]. The
-- monetary columns (subtotal / vat_amount / total) are computed and persisted by
-- the client so the printed invoice always matches what was saved.
--
-- Numbering: a BEFORE INSERT/UPDATE trigger stamps 'INV-0001'-style numbers off a
-- dedicated sequence when none is supplied, and keeps updated_at fresh.
--
-- RLS mirrors the rest of the schema: staff-only, via private.is_staff().
-- Applied to live Supabase.

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  booking_ref    text,
  customer_name  text not null,
  customer_email text,
  customer_phone text,
  customer_address text,
  line_items     jsonb not null default '[]'::jsonb,
  -- Structured airport-transfer details (pickup, dropoff, date, time, flight,
  -- passengers, luggage, vehicle, return) rendered on the printed invoice.
  journey        jsonb not null default '{}'::jsonb,
  subtotal       numeric not null default 0,
  vat_rate       numeric not null default 0,
  vat_amount     numeric not null default 0,
  total          numeric not null default 0,
  status         text not null default 'Draft' check (status in ('Draft','Sent','Paid','Void')),
  issue_date     date not null default current_date,
  due_date       date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.invoices enable row level security;

drop policy if exists staff_all_invoices on public.invoices;
create policy staff_all_invoices on public.invoices
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create sequence if not exists public.invoice_seq start 1;
grant usage on sequence public.invoice_seq to authenticated;

create or replace function public.set_invoice_number()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'INV-' || to_char(nextval('public.invoice_seq'), 'FM0000');
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_set_invoice_number on public.invoices;
create trigger trg_set_invoice_number
  before insert or update on public.invoices
  for each row execute function public.set_invoice_number();
