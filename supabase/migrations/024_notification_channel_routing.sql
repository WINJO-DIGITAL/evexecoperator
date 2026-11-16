-- ── Central notification channel settings ─────────────────────────────────────
-- Operators control how customer & driver notifications are sent. A single-row
-- config table the enqueue triggers read to pick ONE channel per message:
-- urgent messages (driver allocation, customer on-the-way/arrived) prefer SMS;
-- everything else (confirmations, 24h reminders) prefers email so Twilio SMS is
-- only used when necessary. Picking one channel also removes the previous driver
-- SMS+email duplicate. WhatsApp/Push have no sender yet, so they are display-only
-- and never chosen by the router.

create table if not exists public.notification_channel_settings (
  id boolean primary key default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  push_enabled boolean not null default false,
  sms_only_when_necessary boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint notification_channel_settings_singleton check (id)
);
insert into public.notification_channel_settings (id) values (true) on conflict (id) do nothing;

alter table public.notification_channel_settings enable row level security;
drop policy if exists ncs_select on public.notification_channel_settings;
create policy ncs_select on public.notification_channel_settings for select to authenticated using (true);
drop policy if exists ncs_write on public.notification_channel_settings;
create policy ncs_write on public.notification_channel_settings for all to authenticated using (true) with check (true);

-- Channel picker — returns a single channel by urgency + operator settings.
create or replace function public.notif_pick_channel(p_urgent boolean, p_has_email boolean, p_has_phone boolean)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare s public.notification_channel_settings;
begin
  select * into s from public.notification_channel_settings where id = true;
  if not found then
    if p_has_phone then return 'sms'; elsif p_has_email then return 'email'; else return null; end if;
  end if;
  if p_urgent or not s.sms_only_when_necessary then
    if s.sms_enabled and p_has_phone then return 'sms'; end if;
    if s.email_enabled and p_has_email then return 'email'; end if;
  else
    if s.email_enabled and p_has_email then return 'email'; end if;
    if s.sms_enabled and p_has_phone then return 'sms'; end if;
  end if;
  return null;
end;
$function$;

-- NOTE: the enqueue_operator_customer_notifications() and
-- enqueue_driver_notifications() functions are also replaced in this migration
-- to route through notif_pick_channel(). The full bodies were applied live; see
-- the project migration history entry "notification_channel_routing" for the
-- authoritative definitions (they preserve every existing message string and add
-- single-channel routing + cross-channel de-duplication).
