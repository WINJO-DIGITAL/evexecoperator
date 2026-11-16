-- Operator Web Push — pings operators when a website booking arrives.
-- Isolated from the existing driver push (its own table + its own VAPID keys).
--
-- NOTE: the VAPID keypair and webhook secret were inserted into push_config
-- out-of-band (via the applied migration) and are intentionally NOT committed
-- here. To rotate: generate a new keypair and update the push_config row.

create table if not exists public.operator_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.operator_push_subscriptions enable row level security;
-- No policies: only the service role (the Next API routes) reads/writes this.

create table if not exists public.push_config (
  id boolean primary key default true,
  vapid_public text,
  vapid_private text,
  vapid_subject text,
  webhook_secret text,
  updated_at timestamptz not null default now(),
  constraint push_config_singleton check (id)
);
alter table public.push_config enable row level security;
-- No policies: service role only.

-- On a new website booking, POST the record to the operator app's push
-- dispatcher (which sends Web Push to every registered operator device).
create or replace function public.notify_operator_new_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_secret text;
begin
  if coalesce(NEW.source, 'website') <> 'website' then return NEW; end if;
  select webhook_secret into v_secret from public.push_config where id = true;
  if v_secret is null then return NEW; end if;
  perform net.http_post(
    url     := 'https://evexecoperator.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', v_secret),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );
  return NEW;
end;
$function$;

drop trigger if exists trg_operator_new_booking_push on public.bookings;
create trigger trg_operator_new_booking_push
  after insert on public.bookings
  for each row execute function public.notify_operator_new_booking();
