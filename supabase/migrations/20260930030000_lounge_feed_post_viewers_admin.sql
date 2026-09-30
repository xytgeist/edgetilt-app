-- Admin-only: who viewed a Lounge feed post (tap the Views count). Rows come from lounge_feed_post_views,
-- whose RLS only lets a viewer read their own rows, so this is security definer with a role check.

create or replace function public.lounge_feed_post_viewers(p_post_id uuid, p_limit integer default 500)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  first_viewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles pr where pr.user_id = auth.uid() and lower(coalesce(pr.role, '')) = 'admin'
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select v.viewer_user_id, p.handle, p.display_name, p.avatar_url, v.first_viewed_at
  from public.lounge_feed_post_views v
  left join public.profiles p on p.user_id = v.viewer_user_id
  where v.post_id = p_post_id
  order by v.first_viewed_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;

revoke all on function public.lounge_feed_post_viewers(uuid, integer) from public;
revoke all on function public.lounge_feed_post_viewers(uuid, integer) from anon;
grant execute on function public.lounge_feed_post_viewers(uuid, integer) to authenticated;

comment on function public.lounge_feed_post_viewers(uuid, integer) is
  'Admin-only list of unique viewers for a Lounge feed post (newest first). Backs the tappable Views count.';
