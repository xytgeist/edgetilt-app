-- One-time backfill: mutual profile_follows with @edgelord for all existing profiles.
-- Run in Supabase SQL editor AFTER `profile_follow_edgelord_on_insert.sql` (or anytime; idempotent).
-- Requires handle `edgelord` (case-insensitive). Safe to re-run.

insert into public.profile_follows (follower_id, following_id)
select p.user_id, e.user_id
from public.profiles p
cross join public.profiles e
where lower(trim(e.handle)) = 'edgelord'
  and p.user_id <> e.user_id
  and not exists (
    select 1
    from public.profile_follows f
    where f.follower_id = p.user_id and f.following_id = e.user_id
  )
on conflict do nothing;

insert into public.profile_follows (follower_id, following_id)
select e.user_id, p.user_id
from public.profiles p
cross join public.profiles e
where lower(trim(e.handle)) = 'edgelord'
  and p.user_id <> e.user_id
  and not exists (
    select 1
    from public.profile_follows f
    where f.follower_id = e.user_id and f.following_id = p.user_id
  )
on conflict do nothing;
