-- Lounge + play-log activity_events emitters: SECURITY DEFINER triggers/helpers can
-- hit RLS on community_feed_posts, feed_comments, profiles, and activity_events
-- when the function owner is not the table owner → owner lookups NULL or inserts
-- no-op. Same class of bug fixed for feed comments in 20260607210000.
--
-- Apply on test after 20260607210000. Smoke: like, bookmark, follow, @mention,
-- repost/quote on another user's content → activity_events row + push (071900 path).

-- Drop legacy 5-arg overload if present (play-log uses 6-arg since 20260531140000).
drop function if exists public.activity_events_insert_safe(uuid, uuid, text, uuid, uuid);

-- ---------------------------------------------------------------------------
-- 1) Shared insert helper (all emitters + play-log RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_insert_safe(
  p_recipient uuid,
  p_actor uuid,
  p_event_type text,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_play_log_entry_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    post_id,
    comment_id,
    play_log_entry_id
  )
  values (p_recipient, p_actor, p_event_type, p_post_id, p_comment_id, p_play_log_entry_id);
exception
  when others then
    raise warning 'activity_events_insert_safe: %', sqlerrm;
end;
$$;

comment on function public.activity_events_insert_safe(uuid, uuid, text, uuid, uuid, uuid) is
  'Best-effort activity row insert; row_security off so RLS never blocks emitters.';

-- ---------------------------------------------------------------------------
-- 2) @mention emitter
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_emit_mentions(
  p_actor uuid,
  p_body text,
  p_event_type text,
  p_post_id uuid,
  p_comment_id uuid,
  p_skip_recipient uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_handle text;
  v_recipient uuid;
begin
  if p_body is null or btrim(p_body) = '' then
    return;
  end if;

  foreach v_handle in array public.lounge_extract_mention_handles(p_body)
  loop
    select p.user_id
      into v_recipient
    from public.profiles p
    where lower(p.handle) = v_handle
    limit 1;

    if v_recipient is not null
       and v_recipient <> p_actor
       and (p_skip_recipient is null or v_recipient <> p_skip_recipient)
    then
      perform public.activity_events_insert_safe(
        v_recipient,
        p_actor,
        p_event_type,
        p_post_id,
        p_comment_id,
        null
      );
    end if;
  end loop;
exception
  when others then
    raise warning 'activity_events_emit_mentions: %', sqlerrm;
end;
$$;

comment on function public.activity_events_emit_mentions(uuid, text, text, uuid, uuid, uuid) is
  'Parse @handles and emit mention activity_events; row_security off for profiles lookup.';

-- ---------------------------------------------------------------------------
-- 3) Post / comment likes
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_on_post_like_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
begin
  select cfp.user_id
    into v_owner
  from public.community_feed_posts cfp
  where cfp.id = new.post_id
    and cfp.hidden_at is null;

  if v_owner is null then
    raise warning 'activity_events_on_post_like_insert: post % not found', new.post_id;
    return new;
  end if;

  perform public.activity_events_insert_safe(
    v_owner,
    new.user_id,
    'like',
    new.post_id,
    null,
    null
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_post_like_insert: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.activity_events_on_feed_comment_like_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
  v_post_id uuid;
begin
  select fc.user_id, fc.post_id
    into v_owner, v_post_id
  from public.feed_comments fc
  where fc.id = new.comment_id
    and fc.hidden_at is null;

  if v_owner is null or v_post_id is null then
    raise warning 'activity_events_on_feed_comment_like_insert: comment % not found', new.comment_id;
    return new;
  end if;

  perform public.activity_events_insert_safe(
    v_owner,
    new.user_id,
    'like',
    v_post_id,
    new.comment_id,
    null
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_comment_like_insert: %', sqlerrm;
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Post / comment bookmarks
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_on_post_bookmark_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
begin
  select cfp.user_id
    into v_owner
  from public.community_feed_posts cfp
  where cfp.id = new.post_id
    and cfp.hidden_at is null;

  if v_owner is null then
    raise warning 'activity_events_on_post_bookmark_insert: post % not found', new.post_id;
    return new;
  end if;

  perform public.activity_events_insert_safe(
    v_owner,
    new.user_id,
    'bookmark',
    new.post_id,
    null,
    null
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_post_bookmark_insert: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.activity_events_on_feed_comment_bookmark_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
  v_post_id uuid;
begin
  select fc.user_id, fc.post_id
    into v_owner, v_post_id
  from public.feed_comments fc
  where fc.id = new.comment_id
    and fc.hidden_at is null;

  if v_owner is null or v_post_id is null then
    raise warning 'activity_events_on_feed_comment_bookmark_insert: comment % not found', new.comment_id;
    return new;
  end if;

  perform public.activity_events_insert_safe(
    v_owner,
    new.user_id,
    'bookmark',
    v_post_id,
    new.comment_id,
    null
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_comment_bookmark_insert: %', sqlerrm;
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Repost / quote / comment-repost + caption @mentions
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_on_feed_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid;
begin
  if new.hidden_at is not null then
    return new;
  end if;

  if new.repost_of_post_id is not null then
    select cfp.user_id
      into v_owner
    from public.community_feed_posts cfp
    where cfp.id = new.repost_of_post_id;

    if v_owner is null then
      raise warning 'activity_events_on_feed_post_insert: repost source post % not found', new.repost_of_post_id;
    elsif v_owner is distinct from new.user_id then
      if coalesce(new.is_plain_repost, false) then
        perform public.activity_events_insert_safe(
          v_owner,
          new.user_id,
          'repost',
          new.id,
          null,
          null
        );
      else
        perform public.activity_events_insert_safe(
          v_owner,
          new.user_id,
          'quote_repost',
          new.id,
          null,
          null
        );
      end if;
    end if;
  elsif new.repost_of_comment_id is not null then
    select fc.user_id
      into v_owner
    from public.feed_comments fc
    where fc.id = new.repost_of_comment_id;

    if v_owner is null then
      raise warning 'activity_events_on_feed_post_insert: repost source comment % not found', new.repost_of_comment_id;
    elsif v_owner is distinct from new.user_id then
      perform public.activity_events_insert_safe(
        v_owner,
        new.user_id,
        'repost',
        new.id,
        new.repost_of_comment_id,
        null
      );
    end if;
  end if;

  perform public.activity_events_emit_mentions(
    new.user_id,
    new.caption,
    'mention_in_post',
    new.id,
    null,
    null
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_post_insert: %', sqlerrm;
    return new;
end;
$$;

comment on function public.activity_events_on_feed_post_insert() is
  'Repost/quote-repost notify owner; @mentions in captions. row_security off for RLS-safe lookups.';

-- ---------------------------------------------------------------------------
-- 6) Follow
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_on_profile_follow_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.activity_events_insert_safe(
    new.following_id,
    new.follower_id,
    'follow',
    null,
    null,
    null
  );
  return new;
exception
  when others then
    raise warning 'activity_events_on_profile_follow_insert: %', sqlerrm;
    return new;
end;
$$;

comment on function public.activity_events_on_profile_follow_insert() is
  'Notify user when someone follows them. row_security off for activity_events insert.';

-- ---------------------------------------------------------------------------
-- 7) Re-assert triggers (idempotent; functions replaced above)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_activity_events_post_like_insert on public.post_likes;
create trigger trg_activity_events_post_like_insert
  after insert on public.post_likes
  for each row
  execute function public.activity_events_on_post_like_insert();

drop trigger if exists trg_activity_events_feed_comment_like_insert on public.feed_comment_likes;
create trigger trg_activity_events_feed_comment_like_insert
  after insert on public.feed_comment_likes
  for each row
  execute function public.activity_events_on_feed_comment_like_insert();

drop trigger if exists trg_activity_events_post_bookmark_insert on public.post_bookmarks;
create trigger trg_activity_events_post_bookmark_insert
  after insert on public.post_bookmarks
  for each row
  execute function public.activity_events_on_post_bookmark_insert();

drop trigger if exists trg_activity_events_feed_comment_bookmark_insert on public.feed_comment_bookmarks;
create trigger trg_activity_events_feed_comment_bookmark_insert
  after insert on public.feed_comment_bookmarks
  for each row
  execute function public.activity_events_on_feed_comment_bookmark_insert();

drop trigger if exists trg_activity_events_feed_post_insert on public.community_feed_posts;
create trigger trg_activity_events_feed_post_insert
  after insert on public.community_feed_posts
  for each row
  execute function public.activity_events_on_feed_post_insert();

drop trigger if exists trg_activity_events_profile_follow_insert on public.profile_follows;
create trigger trg_activity_events_profile_follow_insert
  after insert on public.profile_follows
  for each row
  execute function public.activity_events_on_profile_follow_insert();
