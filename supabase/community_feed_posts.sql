-- Home feed posts (e.g. "Ask community" from slot guide cards).
-- Run in Supabase SQL editor after local_intel / auth is in place.

create table if not exists public.community_feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text,
  game_title text not null default '',
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_feed_posts_created_idx
  on public.community_feed_posts (created_at desc);

create or replace function public.set_community_feed_posts_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_community_feed_posts_user_id on public.community_feed_posts;
create trigger trg_set_community_feed_posts_user_id
  before insert on public.community_feed_posts
  for each row
  execute function public.set_community_feed_posts_user_id();

alter table public.community_feed_posts enable row level security;

drop policy if exists "community_feed_posts_select_authed" on public.community_feed_posts;
create policy "community_feed_posts_select_authed" on public.community_feed_posts
  for select to authenticated
  using (true);

drop policy if exists "community_feed_posts_insert_own" on public.community_feed_posts;
create policy "community_feed_posts_insert_own" on public.community_feed_posts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "community_feed_posts_update_own" on public.community_feed_posts;
create policy "community_feed_posts_update_own" on public.community_feed_posts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "community_feed_posts_delete_own" on public.community_feed_posts;
create policy "community_feed_posts_delete_own" on public.community_feed_posts
  for delete to authenticated
  using (auth.uid() = user_id);
