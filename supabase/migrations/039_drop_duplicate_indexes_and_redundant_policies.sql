-- Final performance-advisor cleanup.
--
-- Duplicate indexes: bookings has two identical pairs (created_at DESC and
-- status). Keep the idx_-prefixed one from each, drop the twin.
drop index if exists public.bookings_created_at_idx;
drop index if exists public.bookings_status_idx;

-- Redundant RLS policies (safe to drop — each is fully covered by another):
--   • ncs_select is FOR SELECT USING true, but ncs_write is FOR ALL USING true
--     (which already includes SELECT) for the same authenticated role.
--   • drivers_select_for_known_drivers (authenticated, is_known_driver()) is a
--     strict subset of dashboard_authenticated_select_drivers (authenticated,
--     USING true), which already grants every authenticated user read access.
--   • service_role_only_missed_calls only ever grants to service_role, which
--     bypasses RLS anyway; staff access is preserved by staff_all_missed_calls.
drop policy if exists ncs_select on public.notification_channel_settings;
drop policy if exists drivers_select_for_known_drivers on public.drivers;
drop policy if exists service_role_only_missed_calls on public.missed_calls;
