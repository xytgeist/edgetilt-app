-- Lounge feed post views: unique per signed-in viewer; denormalized view_count for admin UI.

begin;

alter table public.community_feed_posts
  add column if not exists view_count integer not null default 0;

comment on column public.community_feed_posts.view_count is
  'Unique signed-in viewer impressions (excludes author). Admin-only UI.';

create table if not exists public.lounge_feed_post_views (
  post_id uuid not null references public.community_feed_posts (id) on delete cascade,
  viewer_user_id uuid not null references auth.users (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_user_id)
);

create index if not exists lounge_feed_post_views_viewer_idx
  on public.lounge_feed_post_views (viewer_user_id, first_viewed_at desc);

alter table public.lounge_feed_post_views enable row level security;

drop policy if exists lounge_feed_post_views_select_own on public.lounge_feed_post_views;
create policy lounge_feed_post_views_select_own
  on public.lounge_feed_post_views
  for select
  to authenticated
  using (viewer_user_id = auth.uid());

-- No direct client inserts; use RPC below.
revoke insert, update, delete on public.lounge_feed_post_views from anon, authenticated;
grant select on public.lounge_feed_post_views to authenticated;

create or replace function public.lounge_record_feed_post_view(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_rows integer := 0;
  v_count integer;
begin
  if v_uid is null or p_post_id is null then
    return null;
  end if;

  select user_id into v_author
  from public.community_feed_posts
  where id = p_post_id
    and hidden_at is null;

  if v_author is null then
    return null;
  end if;

  -- Authors viewing their own post do not inflate Views.
  if v_author = v_uid then
    select view_count into v_count
    from public.community_feed_posts
    where id = p_post_id;
    return coalesce(v_count, 0);
  end if;

  insert into public.lounge_feed_post_views (post_id, viewer_user_id)
  values (p_post_id, v_uid)
  on conflict (post_id, viewer_user_id) do nothing;

  get diagnostics v_rows = row_count;
  -- INSERT … ON CONFLICT DO NOTHING: 1 = new view, 0 = already counted
  if v_rows > 0 then
    update public.community_feed_posts
    set view_count = coalesce(view_count, 0) + 1
    where id = p_post_id
    returning view_count into v_count;
  else
    select view_count into v_count
    from public.community_feed_posts
    where id = p_post_id;
  end if;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.lounge_record_feed_post_view(uuid) from public;
grant execute on function public.lounge_record_feed_post_view(uuid) to authenticated;

comment on function public.lounge_record_feed_post_view(uuid) is
  'Record one unique view per signed-in viewer (skip author). Returns current view_count.';

commit;
