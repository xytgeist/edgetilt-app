-- Drop the stale 4-arg upsert_my_apns_device_token and fix grants on the 5-arg.
--
-- 20260826120000 added p_push_channel by re-declaring the function. `create or
-- replace function` with a DIFFERENT argument count does not replace ... it adds an
-- OVERLOAD. Both signatures then existed side by side:
--   upsert_my_apns_device_token(text, text, text, text)
--   upsert_my_apns_device_token(text, text, text, text, text)  -- p_push_channel default 'alert'
--
-- Current clients are unaffected: apnsDeviceTokenApi.js always sends all five named
-- params, so PostgREST resolves the 5-arg exactly. The hazard is a STALE cached client
-- (older PWA/IPA JS) sending only the original four ... both candidates can satisfy that
-- call because the 5th has a default, so PostgREST returns PGRST203 "could not choose
-- the best candidate function" and token registration fails silently.
--
-- Also fixes grant drift: 20260825210000 revoked public / granted authenticated on the
-- 4-arg signature, but the 5-arg added by 20260826120000 inherited the default
-- EXECUTE-to-PUBLIC. Not an escalation (the body raises 'Not authenticated' when
-- auth.uid() is null) but anon should not hold EXECUTE at all.

drop function if exists public.upsert_my_apns_device_token(text, text, text, text);

-- `revoke ... from public` is NOT sufficient here. Supabase grants EXECUTE to anon and
-- authenticated explicitly (via ALTER DEFAULT PRIVILEGES on schema public), so the ACL
-- keeps `anon=X` after revoking PUBLIC. anon must be revoked by name.
revoke all on function public.upsert_my_apns_device_token(text, text, text, text, text) from public;

revoke all on function public.upsert_my_apns_device_token(text, text, text, text, text) from anon;

grant execute on function public.upsert_my_apns_device_token(text, text, text, text, text) to authenticated;

comment on function public.upsert_my_apns_device_token(text, text, text, text, text) is
  'Upserts the caller''s APNs device token for one push channel (alert = banners, voip = PushKit). Single signature by design; adding a parameter creates an overload and makes the PostgREST RPC ambiguous for stale clients.';
