-- Play log partner picker: align RPC with Lounge follow lists (security definer + non-banned profiles).

create or replace function public.play_log_partner_candidates()
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  role text,
  is_og boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with edges as (
    select pf.following_id as uid
    from public.profile_follows pf
    where pf.follower_id = auth.uid()
    union
    select pf.follower_id as uid
    from public.profile_follows pf
    where pf.following_id = auth.uid()
  ),
  ids as (
    select distinct e.uid
    from edges e
    where e.uid is not null and e.uid <> auth.uid()
  )
  select
    p.user_id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.role,
    coalesce(p.is_og, false) as is_og
  from ids
  join public.profiles p on p.user_id = ids.uid
  where p.banned_at is null
  order by coalesce(nullif(btrim(p.display_name), ''), p.handle) asc nulls last;
$$;

grant execute on function public.play_log_partner_candidates() to authenticated;
