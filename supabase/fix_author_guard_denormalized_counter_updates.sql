-- Fix: "Not allowed to change moderation or engagement fields" when the acting user
-- is the post author (e.g. liking or commenting on your own post, or quote-repost flows
-- that bump repost_count on your own original).
--
-- community_feed_posts_author_guard treats any like_count/comment_count/repost_count
-- change as forbidden when auth.uid() = old.user_id — but denormalized counters are
-- updated by SECURITY DEFINER triggers that still run under the session JWT, so those
-- updates must bypass the author-only engagement check.
--
-- Apply in Supabase SQL Editor on projects that already ran feed_phase_a + interactions
-- (and optionally feed_repost_quote_posts).

-- ---------------------------------------------------------------------------
-- 1) Author guard: skip engagement checks during internal counter maintenance
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

-- ---------------------------------------------------------------------------
-- 2) Like / repost / comment counter triggers — set bypass for their UPDATEs
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

create or replace function public.feed_comments_bump_ancestor_counts(
  p_post_id uuid,
  p_parent_id uuid,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur uuid := p_parent_id;
begin
  if p_delta = 0 or p_post_id is null then
    return;
  end if;

  perform set_config('lounge.denorm_feed_counters', '1', true);

  update public.community_feed_posts
    set comment_count = greatest(0, comment_count + p_delta)
    where id = p_post_id;

  while cur is not null loop
    update public.feed_comments
      set comment_count = greatest(0, comment_count + p_delta)
      where id = cur;
    select c.parent_id into cur
    from public.feed_comments c
    where c.id = cur;
  end loop;

  perform set_config('lounge.denorm_feed_counters', '', true);
exception
  when others then
    perform set_config('lounge.denorm_feed_counters', '', true);
    raise;
end;
$$;

create or replace function public.feed_comments_touch_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(new.post_id, new.parent_id, 1);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(old.post_id, old.parent_id, -1);
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.hidden_at is null and new.hidden_at is not null then
      perform public.feed_comments_bump_ancestor_counts(old.post_id, old.parent_id, -1);
    elsif old.hidden_at is not null and new.hidden_at is null then
      perform public.feed_comments_bump_ancestor_counts(new.post_id, new.parent_id, 1);
    end if;
    return new;
  end if;
  return null;
exception when others then
  perform set_config('lounge.denorm_feed_counters', '', true);
  raise;
end;
$$;

-- Quote-repost repost_count maintenance (if this function exists in your DB)
create or replace function public.community_feed_posts_touch_repost_count_from_quotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
