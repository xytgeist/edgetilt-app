-- Phase H1 — Lounge in-app activity notifications (outbox + safe emit triggers).
-- Apply on test before client smoke. Push / prefs / batched likes are later slices.

-- ---------------------------------------------------------------------------
-- 1) activity_events
-- ---------------------------------------------------------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow'
    )
  ),
  post_id uuid references public.community_feed_posts (id) on delete cascade,
  comment_id uuid references public.feed_comments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint activity_events_no_self check (recipient_user_id <> actor_user_id)
);

create index if not exists activity_events_recipient_created_idx
  on public.activity_events (recipient_user_id, created_at desc, id desc);

create index if not exists activity_events_recipient_unread_idx
  on public.activity_events (recipient_user_id)
  where read_at is null;

comment on table public.activity_events is
  'In-app Lounge notification outbox (Phase H). Writers are SECURITY DEFINER triggers; clients read via RLS.';

alter table public.activity_events enable row level security;

drop policy if exists activity_events_select_own on public.activity_events;
create policy activity_events_select_own on public.activity_events
  for select to authenticated
  using (auth.uid() = recipient_user_id);

grant select on public.activity_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Safe insert helper (never blocks source writes)
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_insert_safe(
  p_recipient uuid,
  p_actor uuid,
  p_event_type text,
  p_post_id uuid default null,
  p_comment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
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
    comment_id
  )
  values (p_recipient, p_actor, p_event_type, p_post_id, p_comment_id);
exception
  when others then
    raise warning 'activity_events_insert_safe: %', sqlerrm;
end;
$$;

comment on function public.activity_events_insert_safe(uuid, uuid, text, uuid, uuid) is
  'Best-effort activity row insert; warnings only on failure so feed writes never roll back.';

-- ---------------------------------------------------------------------------
-- 3) Mention parsing (@handle — same charset as profiles.handle)
-- ---------------------------------------------------------------------------
create or replace function public.lounge_extract_mention_handles(p_body text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    array_agg(distinct lower(m[1])),
    '{}'::text[]
  )
  from regexp_matches(coalesce(p_body, ''), '@([a-z0-9_]{2,30})', 'gi') as m;
$$;

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
        p_comment_id
      );
    end if;
  end loop;
exception
  when others then
    raise warning 'activity_events_emit_mentions: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Writers — comments, posts, follows
-- ---------------------------------------------------------------------------
create or replace function public.activity_events_on_feed_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_owner uuid;
  v_parent_owner uuid;
  v_primary_recipient uuid;
begin
  if new.hidden_at is not null then
    return new;
  end if;

  select cfp.user_id
    into v_post_owner
  from public.community_feed_posts cfp
  where cfp.id = new.post_id;

  if new.parent_id is null then
    v_primary_recipient := v_post_owner;
    perform public.activity_events_insert_safe(
      v_post_owner,
      new.user_id,
      'comment_on_post',
      new.post_id,
      new.id
    );
  else
    select fc.user_id
      into v_parent_owner
    from public.feed_comments fc
    where fc.id = new.parent_id;

    v_primary_recipient := v_parent_owner;
    perform public.activity_events_insert_safe(
      v_parent_owner,
      new.user_id,
      'reply_to_comment',
      new.post_id,
      new.id
    );
  end if;

  perform public.activity_events_emit_mentions(
    new.user_id,
    new.body,
    'mention_in_comment',
    new.post_id,
    new.id,
    v_primary_recipient
  );

  return new;
exception
  when others then
    raise warning 'activity_events_on_feed_comment_insert: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_activity_events_feed_comment_insert on public.feed_comments;
create trigger trg_activity_events_feed_comment_insert
  after insert on public.feed_comments
  for each row
  execute function public.activity_events_on_feed_comment_insert();

create or replace function public.activity_events_on_feed_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hidden_at is not null then
    return new;
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

drop trigger if exists trg_activity_events_feed_post_insert on public.community_feed_posts;
create trigger trg_activity_events_feed_post_insert
  after insert on public.community_feed_posts
  for each row
  execute function public.activity_events_on_feed_post_insert();

create or replace function public.activity_events_on_profile_follow_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_events_insert_safe(
    new.following_id,
    new.follower_id,
    'follow',
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

drop trigger if exists trg_activity_events_profile_follow_insert on public.profile_follows;
create trigger trg_activity_events_profile_follow_insert
  after insert on public.profile_follows
  for each row
  execute function public.activity_events_on_profile_follow_insert();

-- ---------------------------------------------------------------------------
-- 5) Read APIs
-- ---------------------------------------------------------------------------
create or replace function public.lounge_activity_unread_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.activity_events ae
  where ae.recipient_user_id = auth.uid()
    and ae.read_at is null;
$$;

create or replace function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ae.id,
    ae.event_type,
    ae.post_id,
    ae.comment_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  where ae.recipient_user_id = auth.uid()
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

create or replace function public.lounge_activity_mark_all_read()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return 0;
  end if;

  update public.activity_events
  set read_at = now()
  where recipient_user_id = v_uid
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.lounge_activity_unread_count() to authenticated;
grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;
grant execute on function public.lounge_activity_mark_all_read() to authenticated;
