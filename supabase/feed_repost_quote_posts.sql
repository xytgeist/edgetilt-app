-- Quote-only reposts: each repost is a normal feed row with required caption (the quote) + link to original.
-- Run on test AFTER `feed_phase_a_profiles_public_read.sql`.
-- If you already applied `feed_interactions_phase_ef.sql`, this replaces `post_reposts` with quote rows (drops that table).
-- If you never applied phase_ef, this file still adds `repost_count` when missing.
--
-- Model: `community_feed_posts.repost_of_post_id` → original post. Partial unique: one quote repost per user per original.

-- ---------------------------------------------------------------------------
-- 1) Columns on posts
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts
  add column if not exists repost_count integer not null default 0;

alter table public.community_feed_posts
  add column if not exists repost_of_post_id uuid references public.community_feed_posts (id) on delete set null;

create index if not exists community_feed_posts_repost_of_idx
  on public.community_feed_posts (repost_of_post_id)
  where repost_of_post_id is not null;

-- At most one visible quote-repost per (user, original).
create unique index if not exists community_feed_posts_one_quote_repost_per_user_original
  on public.community_feed_posts (user_id, repost_of_post_id)
  where repost_of_post_id is not null;

comment on column public.community_feed_posts.repost_of_post_id is
  'When set, this row is a quote repost: caption is the quote; counter on original is repost_count.';

-- ---------------------------------------------------------------------------
-- 2) Validate quote repost on insert
-- ---------------------------------------------------------------------------
create or replace function public.community_feed_posts_validate_quote_repost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.repost_of_post_id is null then
    return new;
  end if;

  if new.repost_of_post_id = new.id then
    raise exception 'Cannot quote-repost a post onto itself';
  end if;

  if char_length(trim(new.caption)) < 1 then
    raise exception 'Quote repost requires a non-empty caption';
  end if;

  if not exists (
    select 1
    from public.community_feed_posts c
    where c.id = new.repost_of_post_id
      and c.hidden_at is null
  ) then
    if exists (select 1 from public.community_feed_posts c where c.id = new.repost_of_post_id) then
      raise exception 'Cannot quote a hidden post';
    else
      raise exception 'Original post not found';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_validate_quote_repost on public.community_feed_posts;
create trigger trg_community_feed_posts_validate_quote_repost
  before insert on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_validate_quote_repost();

-- ---------------------------------------------------------------------------
-- 3) Repost counts from quote rows (replace post_reposts if present)
-- ---------------------------------------------------------------------------
do $drop_legacy_reposts$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'post_reposts'
      and c.relkind = 'r'
  ) then
    execute 'drop trigger if exists trg_post_reposts_touch on public.post_reposts';
    execute 'drop function if exists public.post_reposts_touch_post_count()';
    execute 'drop table public.post_reposts cascade';
  end if;
end;
$drop_legacy_reposts$;

comment on column public.community_feed_posts.repost_count is
  'Denormalized: number of visible quote-repost rows pointing at this post (repost_of_post_id = this.id, hidden_at null).';

create or replace function public.community_feed_posts_touch_repost_count_from_quotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.repost_of_post_id is not null and new.hidden_at is null then
      perform set_config('lounge.denorm_feed_counters', '1', true);
      update public.community_feed_posts
        set repost_count = repost_count + 1
        where id = new.repost_of_post_id;
      perform set_config('lounge.denorm_feed_counters', '', true);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.repost_of_post_id is not null and old.hidden_at is null then
      perform set_config('lounge.denorm_feed_counters', '1', true);
      update public.community_feed_posts
        set repost_count = greatest(0, repost_count - 1)
        where id = old.repost_of_post_id;
      perform set_config('lounge.denorm_feed_counters', '', true);
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    -- Repost target changed (rare): adjust both sides
    if old.repost_of_post_id is distinct from new.repost_of_post_id then
      if old.repost_of_post_id is not null and old.hidden_at is null then
        perform set_config('lounge.denorm_feed_counters', '1', true);
        update public.community_feed_posts
          set repost_count = greatest(0, repost_count - 1)
          where id = old.repost_of_post_id;
        perform set_config('lounge.denorm_feed_counters', '', true);
      end if;
      if new.repost_of_post_id is not null and new.hidden_at is null then
        perform set_config('lounge.denorm_feed_counters', '1', true);
        update public.community_feed_posts
          set repost_count = repost_count + 1
          where id = new.repost_of_post_id;
        perform set_config('lounge.denorm_feed_counters', '', true);
      end if;
      return new;
    end if;

    if new.repost_of_post_id is not null then
      if old.hidden_at is null and new.hidden_at is not null then
        perform set_config('lounge.denorm_feed_counters', '1', true);
        update public.community_feed_posts
          set repost_count = greatest(0, repost_count - 1)
          where id = new.repost_of_post_id;
        perform set_config('lounge.denorm_feed_counters', '', true);
      elsif old.hidden_at is not null and new.hidden_at is null then
        perform set_config('lounge.denorm_feed_counters', '1', true);
        update public.community_feed_posts
          set repost_count = repost_count + 1
          where id = new.repost_of_post_id;
        perform set_config('lounge.denorm_feed_counters', '', true);
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

drop trigger if exists trg_community_feed_posts_touch_repost_count_from_quotes on public.community_feed_posts;
create trigger trg_community_feed_posts_touch_repost_count_from_quotes
  after insert or delete or update of repost_of_post_id, hidden_at on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_touch_repost_count_from_quotes();

-- ---------------------------------------------------------------------------
-- 4) Authors cannot retarget or clear repost link (staff unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.community_feed_posts_author_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff boolean;
begin
  if current_setting('lounge.denorm_feed_counters', true) = '1' then
    return new;
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('moderator', 'admin')
  )
  into staff;

  if staff then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() = old.user_id then
    if new.hidden_at is distinct from old.hidden_at
      or new.hidden_reason is distinct from old.hidden_reason
      or new.needs_mod_review is distinct from old.needs_mod_review
      or new.pinned is distinct from old.pinned
      or new.like_count is distinct from old.like_count
      or new.comment_count is distinct from old.comment_count
      or new.repost_count is distinct from old.repost_count
      or new.user_id is distinct from old.user_id
      or new.repost_of_post_id is distinct from old.repost_of_post_id
    then
      raise exception 'Not allowed to change moderation or engagement fields';
    end if;
  end if;

  return new;
end;
$$;
