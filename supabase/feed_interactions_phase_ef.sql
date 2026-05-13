-- Phase E/F (Lounge): post likes, reposts, bookmarks, top-level comments + counter triggers.
-- Apply on test AFTER `feed_phase_a_profiles_public_read.sql` (expects `community_feed_posts` + counts).
--
-- Repost model: lightweight "signal" row per user per post (not a separate feed card).
-- Comments: top-level only for counter (`parent_id` null); replies may be added later without bumping post count.

-- ---------------------------------------------------------------------------
-- 1) Repost counter on posts
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts
  add column if not exists repost_count integer not null default 0;

comment on column public.community_feed_posts.repost_count is 'Denormalized; maintained by triggers on public.post_reposts.';

-- ---------------------------------------------------------------------------
-- 2) post_likes
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  post_id uuid not null references public.community_feed_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_pk primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

alter table public.post_likes enable row level security;

drop policy if exists post_likes_select_own on public.post_likes;
create policy post_likes_select_own on public.post_likes
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.post_likes to authenticated;

-- ---------------------------------------------------------------------------
-- 3) post_reposts
-- ---------------------------------------------------------------------------
create table if not exists public.post_reposts (
  post_id uuid not null references public.community_feed_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_reposts_pk primary key (post_id, user_id)
);

create index if not exists post_reposts_user_idx on public.post_reposts (user_id);

alter table public.post_reposts enable row level security;

drop policy if exists post_reposts_select_signed_in on public.post_reposts;
create policy post_reposts_select_signed_in on public.post_reposts
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists post_reposts_insert_own on public.post_reposts;
create policy post_reposts_insert_own on public.post_reposts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists post_reposts_delete_own on public.post_reposts;
create policy post_reposts_delete_own on public.post_reposts
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.post_reposts to authenticated;

-- ---------------------------------------------------------------------------
-- 4) post_bookmarks
-- ---------------------------------------------------------------------------
create table if not exists public.post_bookmarks (
  post_id uuid not null references public.community_feed_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_bookmarks_pk primary key (post_id, user_id)
);

create index if not exists post_bookmarks_user_idx on public.post_bookmarks (user_id);

alter table public.post_bookmarks enable row level security;

drop policy if exists post_bookmarks_select_own on public.post_bookmarks;
create policy post_bookmarks_select_own on public.post_bookmarks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists post_bookmarks_insert_own on public.post_bookmarks;
create policy post_bookmarks_insert_own on public.post_bookmarks
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists post_bookmarks_delete_own on public.post_bookmarks;
create policy post_bookmarks_delete_own on public.post_bookmarks
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.post_bookmarks to authenticated;

-- ---------------------------------------------------------------------------
-- 5) feed_comments (top-level counted on post; threading via parent_id optional)
-- ---------------------------------------------------------------------------
create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_feed_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.feed_comments (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  hidden_at timestamptz,
  constraint feed_comments_body_len check (char_length(body) >= 1 and char_length(body) <= 2000)
);

create index if not exists feed_comments_post_idx on public.feed_comments (post_id, created_at);
create index if not exists feed_comments_parent_idx on public.feed_comments (parent_id);

alter table public.feed_comments enable row level security;

drop policy if exists feed_comments_select_visible on public.feed_comments;
create policy feed_comments_select_visible on public.feed_comments
  for select to authenticated
  using (hidden_at is null);

drop policy if exists feed_comments_insert_own on public.feed_comments;
create policy feed_comments_insert_own on public.feed_comments
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists feed_comments_delete_own on public.feed_comments;
create policy feed_comments_delete_own on public.feed_comments
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.feed_comments to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Triggers: maintain like_count, repost_count, comment_count on posts
-- ---------------------------------------------------------------------------
create or replace function public.post_likes_touch_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform set_config('lounge.denorm_feed_counters', '1', true);
    update public.community_feed_posts
      set like_count = like_count + 1
      where id = new.post_id;
    perform set_config('lounge.denorm_feed_counters', '', true);
  elsif tg_op = 'DELETE' then
    perform set_config('lounge.denorm_feed_counters', '1', true);
    update public.community_feed_posts
      set like_count = greatest(0, like_count - 1)
      where id = old.post_id;
    perform set_config('lounge.denorm_feed_counters', '', true);
  end if;
  return null;
exception when others then
  perform set_config('lounge.denorm_feed_counters', '', true);
  raise;
end;
$$;

drop trigger if exists trg_post_likes_touch on public.post_likes;
create trigger trg_post_likes_touch
  after insert or delete on public.post_likes
  for each row
  execute function public.post_likes_touch_post_count();

create or replace function public.post_reposts_touch_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform set_config('lounge.denorm_feed_counters', '1', true);
    update public.community_feed_posts
      set repost_count = repost_count + 1
      where id = new.post_id;
    perform set_config('lounge.denorm_feed_counters', '', true);
  elsif tg_op = 'DELETE' then
    perform set_config('lounge.denorm_feed_counters', '1', true);
    update public.community_feed_posts
      set repost_count = greatest(0, repost_count - 1)
      where id = old.post_id;
    perform set_config('lounge.denorm_feed_counters', '', true);
  end if;
  return null;
exception when others then
  perform set_config('lounge.denorm_feed_counters', '', true);
  raise;
end;
$$;

drop trigger if exists trg_post_reposts_touch on public.post_reposts;
create trigger trg_post_reposts_touch
  after insert or delete on public.post_reposts
  for each row
  execute function public.post_reposts_touch_post_count();

create or replace function public.feed_comments_touch_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is null and new.hidden_at is null then
      perform set_config('lounge.denorm_feed_counters', '1', true);
      update public.community_feed_posts
        set comment_count = comment_count + 1
        where id = new.post_id;
      perform set_config('lounge.denorm_feed_counters', '', true);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.parent_id is null and old.hidden_at is null then
      perform set_config('lounge.denorm_feed_counters', '1', true);
      update public.community_feed_posts
        set comment_count = greatest(0, comment_count - 1)
        where id = old.post_id;
      perform set_config('lounge.denorm_feed_counters', '', true);
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.parent_id is not distinct from old.parent_id then
      if old.parent_id is null then
        if old.hidden_at is null and new.hidden_at is not null then
          perform set_config('lounge.denorm_feed_counters', '1', true);
          update public.community_feed_posts
            set comment_count = greatest(0, comment_count - 1)
            where id = old.post_id;
          perform set_config('lounge.denorm_feed_counters', '', true);
        elsif old.hidden_at is not null and new.hidden_at is null then
          perform set_config('lounge.denorm_feed_counters', '1', true);
          update public.community_feed_posts
            set comment_count = comment_count + 1
            where id = new.post_id;
          perform set_config('lounge.denorm_feed_counters', '', true);
        end if;
      end if;
    end if;
    return new;
  end if;
  return null;
exception when others then
  perform set_config('lounge.denorm_feed_counters', '', true);
  raise;
end;
$$;

drop trigger if exists trg_feed_comments_touch on public.feed_comments;
create trigger trg_feed_comments_touch
  after insert or delete or update of hidden_at on public.feed_comments
  for each row
  execute function public.feed_comments_touch_post_count();
