-- Restore anonymous and authenticated execution permissions on Lounge profile and feed reading RPCs.
--
-- When stage 2 anon lockdown was applied, lounge_profile_feed_posts_for_viewer and related
-- mask/dependency functions were revoked from anon because they reference auth.uid() internally.
-- This caused logged-out visitors to see "permission denied for function lounge_profile_feed_posts_for_viewer"
-- when viewing profile screens (e.g. Scott Sharpe's profile from sharpesyndicate.com).

do $$
begin
  grant execute on function public.lounge_profile_feed_posts_for_viewer(uuid, integer, integer) to anon, authenticated, service_role;
  grant execute on function public.lounge_community_feed_posts_for_viewer(uuid[]) to anon, authenticated, service_role;
  grant execute on function public.lounge_feed_post_mask_for_viewer(public.community_feed_posts) to anon, authenticated, service_role;
  grant execute on function public.lounge_fan_caption_teaser(text) to anon, authenticated, service_role;
  grant execute on function public.lounge_viewer_is_subscriber_or_staff() to anon, authenticated, service_role;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lounge_post_thread_parts'
  ) then
    execute 'grant execute on function public.lounge_post_thread_parts(uuid) to anon, authenticated, service_role;';
  end if;
end $$;
