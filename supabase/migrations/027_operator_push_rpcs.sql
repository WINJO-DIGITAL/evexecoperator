-- Make operator Web Push work without a SUPABASE_SERVICE_ROLE_KEY on the server.
--
-- push_config and operator_push_subscriptions are locked by RLS (no policies),
-- so the original API routes read/wrote them with the service role. That key
-- was never set in the deployment, so "Enable" reported "Push isn't set up on
-- the server yet." These SECURITY DEFINER functions let the app work with just
-- the anon/authenticated roles it already has:
--   * get_push_public_key()        — anon: the VAPID public key (not secret).
--   * register_operator_push(...)   — authenticated: upsert this device.
--   * unregister_operator_push(ep)  — remove a device (also used to prune
--                                     expired endpoints from the dispatch route).
--   * get_push_dispatch_bundle(sec) — gated by the webhook secret; returns the
--                                     VAPID keys + all subscriptions so the
--                                     dispatch route can send with the anon key.
--
-- The private VAPID key is only returned by get_push_dispatch_bundle and only
-- when the caller passes the webhook secret (known solely to the DB trigger and
-- the dispatch route), so it never reaches the browser.

create or replace function public.get_push_public_key()
returns text
language sql stable security definer set search_path = 'public','pg_temp'
as $$ select vapid_public from public.push_config where id = true; $$;
grant execute on function public.get_push_public_key() to anon, authenticated;

create or replace function public.register_operator_push(
  p_endpoint text, p_p256dh text, p_auth text, p_label text default null)
returns void
language plpgsql security definer set search_path = 'public','pg_temp'
as $$
begin
  insert into public.operator_push_subscriptions (endpoint, p256dh, auth, label, user_id)
  values (p_endpoint, p_p256dh, p_auth, p_label, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, user_id = excluded.user_id;
end;
$$;
grant execute on function public.register_operator_push(text,text,text,text) to authenticated;

create or replace function public.unregister_operator_push(p_endpoint text)
returns void
language sql security definer set search_path = 'public','pg_temp'
as $$ delete from public.operator_push_subscriptions where endpoint = p_endpoint; $$;
grant execute on function public.unregister_operator_push(text) to anon, authenticated;

create or replace function public.get_push_dispatch_bundle(p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = 'public','pg_temp'
as $$
declare c public.push_config; v jsonb;
begin
  select * into c from public.push_config where id = true;
  if c.webhook_secret is null or p_secret is distinct from c.webhook_secret then
    return null;
  end if;
  select jsonb_build_object(
    'vapid_public',  c.vapid_public,
    'vapid_private', c.vapid_private,
    'vapid_subject', coalesce(c.vapid_subject, 'mailto:book@evexec.co.uk'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
      from public.operator_push_subscriptions), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
grant execute on function public.get_push_dispatch_bundle(text) to anon, authenticated;
