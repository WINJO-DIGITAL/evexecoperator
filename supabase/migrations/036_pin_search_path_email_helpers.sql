-- Pin search_path on the notification-email helper functions added in migration
-- 035 (fixes the function_search_path_mutable security-linter warning). A stable
-- search_path stops a caller's role-level search_path from shadowing the objects
-- these SECURITY-agnostic helpers reference.
alter function public.evexec_esc(text) set search_path = 'public','pg_temp';
alter function public.evexec_notification_email(text,text,text,text,jsonb,text) set search_path = 'public','pg_temp';
