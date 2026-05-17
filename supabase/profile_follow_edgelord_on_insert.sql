-- Auto-follow @edgelord for every new profile row (bidirectional).
-- Run in Supabase SQL editor after `profile_lounge_fullscreen.sql` (`profile_follows` table).
-- Requires an existing profile with handle `edgelord` (case-insensitive). Safe to re-run.

create or replace function public.profiles_auto_follow_edgelord_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edgelord_id uuid;
begin
  select p.user_id
  into v_edgelord_id
  from public.profiles p
  where lower(trim(p.handle)) = 'edgelord'
  limit 1;

  if v_edgelord_id is null then
    raise warning 'profiles_auto_follow_edgelord_after_insert: no profile with handle edgelord';
    return new;
  end if;

  if new.user_id = v_edgelord_id then
    return new;
  end if;

  insert into public.profile_follows (follower_id, following_id)
  values
    (new.user_id, v_edgelord_id),
    (v_edgelord_id, new.user_id)
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'profiles_auto_follow_edgelord_after_insert: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists profiles_auto_follow_edgelord_after_insert on public.profiles;
create trigger profiles_auto_follow_edgelord_after_insert
  after insert on public.profiles
  for each row
  execute function public.profiles_auto_follow_edgelord_after_insert();

comment on function public.profiles_auto_follow_edgelord_after_insert() is
  'AFTER INSERT on profiles: mutual profile_follows with @edgelord (new user follows edgelord; edgelord follows new user). Never blocks profile insert.';

-- Optional one-time backfill for accounts created before this trigger (run manually if needed):
--
-- insert into public.profile_follows (follower_id, following_id)
-- select p.user_id, e.user_id
-- from public.profiles p
-- cross join public.profiles e
-- where lower(trim(e.handle)) = 'edgelord'
--   and p.user_id <> e.user_id
--   and not exists (
--     select 1
--     from public.profile_follows f
--     where f.follower_id = p.user_id and f.following_id = e.user_id
--   )
-- on conflict do nothing;
--
-- insert into public.profile_follows (follower_id, following_id)
-- select e.user_id, p.user_id
-- from public.profiles p
-- cross join public.profiles e
-- where lower(trim(e.handle)) = 'edgelord'
--   and p.user_id <> e.user_id
--   and not exists (
--     select 1
--     from public.profile_follows f
--     where f.follower_id = e.user_id and f.following_id = p.user_id
--   )
-- on conflict do nothing;
