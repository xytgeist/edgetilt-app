-- Owner toggle: new members see prior messages, or start from a blank room.
-- Join-time stamp on chat_room_members.history_starts_at (null = full history).
-- Toggling the room setting does not rewrite existing members.

alter table public.chat_rooms
  add column if not exists new_members_see_history boolean not null default true;

comment on column public.chat_rooms.new_members_see_history is
  'When false, people who join later only see messages from their join time forward. DMs ignore this.';

alter table public.chat_room_members
  add column if not exists history_starts_at timestamptz;

comment on column public.chat_room_members.history_starts_at is
  'Null = full room history. Timestamptz = only messages with created_at >= this instant.';

create or replace function public.chat_history_visible(p_room_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
      and (m.history_starts_at is null or p_created_at >= m.history_starts_at)
  );
$$;

revoke all on function public.chat_history_visible(uuid, timestamptz) from public, anon;
grant execute on function public.chat_history_visible(uuid, timestamptz) to authenticated;

create or replace function public.chat_room_members_stamp_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_see boolean;
  v_kind text;
  v_created_by uuid;
  v_creator uuid;
begin
  select r.new_members_see_history, r.kind, r.created_by, r.creator_user_id
    into v_see, v_kind, v_created_by, v_creator
  from public.chat_rooms r
  where r.id = new.room_id;

  if v_kind is null then
    return new;
  end if;

  if v_kind = 'dm'
     or new.user_id is not distinct from v_creator
     or new.user_id is not distinct from v_created_by then
    new.history_starts_at := null;
  elsif v_see is false then
    new.history_starts_at := coalesce(new.history_starts_at, now());
  else
    new.history_starts_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists chat_room_members_stamp_history_bi on public.chat_room_members;
create trigger chat_room_members_stamp_history_bi
  before insert on public.chat_room_members
  for each row
  execute function public.chat_room_members_stamp_history();

drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member" on public.chat_messages
  for select using (public.chat_history_visible(room_id, created_at));

create or replace function public.chat_set_new_members_see_history(p_room_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_created_by uuid;
  v_creator uuid;
  v_role text;
  v_staff boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if p_room_id is null then
    raise exception 'room_id is required';
  end if;

  select r.kind, r.created_by, r.creator_user_id
    into v_kind, v_created_by, v_creator
  from public.chat_rooms r
  where r.id = p_room_id;

  if v_kind is null then
    raise exception 'Room not found';
  end if;
  if v_kind = 'dm' then
    raise exception 'Direct messages always keep history';
  end if;

  select m.role into v_role
  from public.chat_room_members m
  where m.room_id = p_room_id and m.user_id = v_uid;

  select (p.role in ('admin', 'moderator')) into v_staff
  from public.profiles p
  where p.user_id = v_uid;

  if v_kind = 'group' then
    if v_created_by is distinct from v_uid then
      raise exception 'Only the group owner can change this setting';
    end if;
  elsif v_kind = 'creator_fan' then
    if v_creator is distinct from v_uid
       and v_created_by is distinct from v_uid then
      raise exception 'Only the room owner can change this setting';
    end if;
  elsif v_kind = 'platform_sub' then
    if v_staff is not true and v_role is distinct from 'admin' then
      raise exception 'Only a room admin can change this setting';
    end if;
  else
    raise exception 'This room does not support a history setting';
  end if;

  update public.chat_rooms
  set new_members_see_history = coalesce(p_enabled, true)
  where id = p_room_id;

  return coalesce(p_enabled, true);
end;
$$;

revoke all on function public.chat_set_new_members_see_history(uuid, boolean) from public, anon;
grant execute on function public.chat_set_new_members_see_history(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Message page / window
-- ---------------------------------------------------------------------------

drop function if exists public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid);
drop function if exists public.chat_messages_page(uuid, int, timestamptz, uuid);

create or replace function public.chat_messages_page(
  p_room_id            uuid,
  p_limit              int         default 50,
  p_before_created_at  timestamptz default null,
  p_before_id          uuid        default null,
  p_after_created_at   timestamptz default null,
  p_after_id           uuid        default null
)
returns table (
  id                   uuid,
  room_id              uuid,
  sender_id            uuid,
  body                 text,
  image_urls           text[],
  stream_video_uid     text,
  stream_poster_url    text,
  stream_video_width   int4,
  stream_video_height  int4,
  video_url            text,
  content_encoding     text,
  created_at           timestamptz,
  deleted_at           timestamptz,
  reply_to_message_id  uuid,
  reply_to_preview     text,
  reply_to_sender_id   uuid,
  link_preview         jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare lim int;
begin
  if not exists (
    select 1 from public.chat_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'NOT_MEMBER' using message = 'You are not a member of this room.';
  end if;
  lim := greatest(1, least(coalesce(p_limit, 50), 100));

  if p_after_created_at is not null then
    return query
    select msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    from public.chat_messages msg
    where msg.room_id = p_room_id
      and public.chat_history_visible(p_room_id, msg.created_at)
      and (msg.created_at > p_after_created_at
        or (msg.created_at = p_after_created_at and msg.id > coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by msg.created_at asc, msg.id asc
    limit lim;
    return;
  end if;

  if p_before_created_at is not null then
    return query
    select msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    from public.chat_messages msg
    where msg.room_id = p_room_id
      and public.chat_history_visible(p_room_id, msg.created_at)
      and (msg.created_at < p_before_created_at
        or (msg.created_at = p_before_created_at and msg.id < coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by msg.created_at desc, msg.id desc
    limit lim;
    return;
  end if;

  return query
  select msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
         msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
         msg.video_url, msg.content_encoding,
         msg.created_at, msg.deleted_at, msg.reply_to_message_id,
         msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
  from public.chat_messages msg
  where msg.room_id = p_room_id
    and public.chat_history_visible(p_room_id, msg.created_at)
  order by msg.created_at desc, msg.id desc
  limit lim;
end;
$$;

revoke all on function public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) to authenticated;

drop function if exists public.chat_messages_window(uuid, uuid, int);

create or replace function public.chat_messages_window(
  p_room_id    uuid,
  p_message_id uuid,
  p_limit      int default 40
)
returns table (
  id                   uuid,
  room_id              uuid,
  sender_id            uuid,
  body                 text,
  image_urls           text[],
  stream_video_uid     text,
  stream_poster_url    text,
  stream_video_width   int4,
  stream_video_height  int4,
  video_url            text,
  content_encoding     text,
  created_at           timestamptz,
  deleted_at           timestamptz,
  reply_to_message_id  uuid,
  reply_to_preview     text,
  reply_to_sender_id   uuid,
  link_preview         jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare lim int; v_at timestamptz; v_id uuid;
begin
  if not exists (
    select 1 from public.chat_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'NOT_MEMBER' using message = 'You are not a member of this room.';
  end if;
  select msg.created_at, msg.id into v_at, v_id
  from public.chat_messages msg
  where msg.id = p_message_id and msg.room_id = p_room_id
    and public.chat_history_visible(p_room_id, msg.created_at);
  if v_at is null then
    raise exception 'NOT_FOUND' using message = 'Message not found.';
  end if;
  lim := ceil(greatest(10, least(coalesce(p_limit, 40), 100)) / 2.0)::int;
  return query
  with older as (
    select msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    from public.chat_messages msg
    where msg.room_id = p_room_id
      and public.chat_history_visible(p_room_id, msg.created_at)
      and (msg.created_at < v_at or (msg.created_at = v_at and msg.id <= v_id))
    order by msg.created_at desc, msg.id desc limit lim
  ),
  newer as (
    select msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    from public.chat_messages msg
    where msg.room_id = p_room_id
      and public.chat_history_visible(p_room_id, msg.created_at)
      and (msg.created_at > v_at or (msg.created_at = v_at and msg.id > v_id))
    order by msg.created_at asc, msg.id asc limit lim
  )
  select * from (select * from older union all select * from newer) c
  order by c.created_at asc, c.id asc;
end;
$$;

revoke all on function public.chat_messages_window(uuid, uuid, int) from public, anon;
grant execute on function public.chat_messages_window(uuid, uuid, int) to authenticated;

create or replace function public.chat_search_messages(
  p_room_id uuid,
  p_query   text,
  p_limit   int default 30
)
returns table (
  message_id uuid,
  body       text,
  created_at timestamptz,
  sender_id  uuid
)
language plpgsql stable security definer set search_path = public as $$
declare lim int; q text;
begin
  if not exists (
    select 1 from public.chat_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'NOT_MEMBER' using message = 'You are not a member of this room.';
  end if;
  q := trim(coalesce(p_query, ''));
  if length(q) < 2 then return; end if;
  lim := greatest(1, least(coalesce(p_limit, 30), 50));
  return query
  select msg.id, msg.body, msg.created_at, msg.sender_id
  from public.chat_messages msg
  where msg.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at)
    and msg.body ilike '%' || q || '%'
  order by msg.created_at desc
  limit lim;
end;
$$;

create or replace function public.chat_pinned_messages_page(
  p_room_id uuid,
  p_limit   int default 50
)
returns table (
  message_id  uuid,
  body        text,
  image_urls  text[],
  created_at  timestamptz,
  sender_id   uuid,
  pinned_at   timestamptz,
  pinned_by   uuid
)
language sql stable security definer set search_path = public as $$
  select msg.id, msg.body, msg.image_urls, msg.created_at, msg.sender_id,
         pin.pinned_at, pin.pinned_by
  from public.chat_pinned_messages pin
  join public.chat_messages msg on msg.id = pin.message_id
  where pin.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at)
  order by pin.pinned_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.chat_pinned_message_ids(p_room_id uuid)
returns table (message_id uuid)
language sql stable security definer set search_path = public as $$
  select pin.message_id
  from public.chat_pinned_messages pin
  join public.chat_messages msg on msg.id = pin.message_id
  where pin.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at);
$$;

create or replace function public.chat_starred_messages_page(
  p_room_id   uuid,
  p_limit     int default 50,
  p_sender_id uuid default null
)
returns table (
  message_id uuid,
  body       text,
  created_at timestamptz,
  sender_id  uuid,
  starred_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select msg.id, msg.body, msg.created_at, msg.sender_id, s.created_at
  from public.chat_message_stars s
  join public.chat_messages msg on msg.id = s.message_id
  where s.user_id = auth.uid()
    and msg.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at)
    and (p_sender_id is null or msg.sender_id = p_sender_id)
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.chat_starred_message_ids(p_room_id uuid)
returns table (message_id uuid)
language sql stable security definer set search_path = public as $$
  select s.message_id
  from public.chat_message_stars s
  join public.chat_messages msg on msg.id = s.message_id
  where s.user_id = auth.uid()
    and msg.room_id = p_room_id
    and public.chat_history_visible(p_room_id, msg.created_at);
$$;

create or replace function public.chat_room_shared_media(
  p_room_id   uuid,
  p_limit     int default 80,
  p_sender_id uuid default null
)
returns table (
  message_id uuid,
  url        text,
  created_at timestamptz,
  sender_id  uuid
)
language sql stable security definer set search_path = public as $$
  select msg.id, u.url, msg.created_at, msg.sender_id
  from public.chat_messages msg
  cross join lateral unnest(coalesce(msg.image_urls, '{}'::text[])) as u(url)
  where msg.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at)
    and u.url is not null
    and length(trim(u.url)) > 0
    and (p_sender_id is null or msg.sender_id = p_sender_id)
  order by msg.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
$$;

create or replace function public.chat_room_shared_calls(
  p_room_id   uuid,
  p_limit     int default 80,
  p_sender_id uuid default null
)
returns table (
  message_id         uuid,
  created_at         timestamptz,
  sender_id          uuid,
  content_encoding   text,
  video_url          text,
  stream_poster_url  text,
  body               text,
  link_preview       jsonb
)
language sql stable security definer set search_path = public as $$
  select
    msg.id,
    msg.created_at,
    msg.sender_id,
    msg.content_encoding,
    msg.video_url,
    msg.stream_poster_url,
    msg.body,
    msg.link_preview
  from public.chat_messages msg
  where msg.room_id = p_room_id
    and msg.deleted_at is null
    and public.chat_history_visible(p_room_id, msg.created_at)
    and msg.content_encoding in ('call_recording', 'call_summary')
    and (p_sender_id is null or msg.sender_id = p_sender_id)
  order by msg.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
$$;

create or replace function public.chat_room_shared_links(
  p_room_id   uuid,
  p_limit     int     default 80,
  p_docs_only boolean default false,
  p_sender_id uuid    default null
)
returns table (
  message_id   uuid,
  url          text,
  created_at   timestamptz,
  sender_id    uuid,
  body_preview text,
  link_preview jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare lim int;
begin
  if not exists (
    select 1 from public.chat_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'NOT_MEMBER' using message = 'You are not a member of this room.';
  end if;

  lim := greatest(1, least(coalesce(p_limit, 80), 200));

  return query
  select distinct on (sub.url_norm)
    sub.message_id,
    sub.url,
    sub.created_at,
    sub.sender_id,
    sub.body_preview,
    sub.link_preview
  from (
    select
      raw.message_id,
      raw.url,
      lower(regexp_replace(trim(raw.url), '/+$', '')) as url_norm,
      raw.created_at,
      raw.sender_id,
      raw.body_preview,
      raw.link_preview
    from (
      select
        msg.id                             as message_id,
        lower(trim(msg.link_preview->>'url')) as url,
        msg.created_at,
        msg.sender_id,
        left(coalesce(msg.body, ''), 120)  as body_preview,
        msg.link_preview
      from public.chat_messages msg
      where msg.room_id = p_room_id
        and msg.deleted_at is null
        and public.chat_history_visible(p_room_id, msg.created_at)
        and coalesce(trim(msg.link_preview->>'url'), '') <> ''
        and (p_sender_id is null or msg.sender_id = p_sender_id)

      union all

      select
        msg.id,
        lower((m)[1]),
        msg.created_at,
        msg.sender_id,
        left(coalesce(msg.body, ''), 120),
        msg.link_preview
      from public.chat_messages msg
      cross join lateral regexp_matches(
        coalesce(msg.body, ''),
        '(https?://[^\s<>"]+)',
        'gi'
      ) as m
      where msg.room_id = p_room_id
        and msg.deleted_at is null
        and public.chat_history_visible(p_room_id, msg.created_at)
        and coalesce(msg.body, '') <> ''
        and (p_sender_id is null or msg.sender_id = p_sender_id)

      union all

      select
        msg.id,
        lower('https://' || (m)[1]),
        msg.created_at,
        msg.sender_id,
        left(coalesce(msg.body, ''), 120),
        msg.link_preview
      from public.chat_messages msg
      cross join lateral regexp_matches(
        coalesce(msg.body, ''),
        '(([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:/[^\s<>"]*)?)',
        'gi'
      ) as m
      where msg.room_id = p_room_id
        and msg.deleted_at is null
        and public.chat_history_visible(p_room_id, msg.created_at)
        and coalesce(msg.body, '') <> ''
        and coalesce(msg.body, '') !~* 'https?://'
        and coalesce(trim(msg.link_preview->>'url'), '') = ''
        and (p_sender_id is null or msg.sender_id = p_sender_id)
    ) raw
    where raw.url is not null
      and raw.url <> ''
      and raw.url ~* '\.[a-z]{2,}'
  ) sub
  where (
    not p_docs_only
    or sub.url ~* '\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)(\?|#|$)'
  )
  order by sub.url_norm, (sub.link_preview is not null) desc, sub.created_at desc
  limit lim;
end;
$$;

revoke all on function public.chat_search_messages(uuid, text, int) from public, anon;
revoke all on function public.chat_pinned_messages_page(uuid, int) from public, anon;
revoke all on function public.chat_starred_messages_page(uuid, int, uuid) from public, anon;
revoke all on function public.chat_room_shared_media(uuid, int, uuid) from public, anon;
revoke all on function public.chat_room_shared_links(uuid, int, boolean, uuid) from public, anon;
revoke all on function public.chat_room_shared_calls(uuid, int, uuid) from public, anon;
grant execute on function public.chat_search_messages(uuid, text, int) to authenticated;
grant execute on function public.chat_pinned_messages_page(uuid, int) to authenticated;
grant execute on function public.chat_pinned_message_ids(uuid) to authenticated;
grant execute on function public.chat_starred_messages_page(uuid, int, uuid) to authenticated;
grant execute on function public.chat_starred_message_ids(uuid) to authenticated;
grant execute on function public.chat_room_shared_media(uuid, int, uuid) to authenticated;
grant execute on function public.chat_room_shared_links(uuid, int, boolean, uuid) to authenticated;
grant execute on function public.chat_room_shared_calls(uuid, int, uuid) to authenticated;

-- Inbox last-message preview must not leak hidden history.
create or replace function public.chat_rooms_for_user(p_user_id uuid)
returns table (
  id                     uuid,
  kind                   text,
  slug                   text,
  title                  text,
  dm_key                 text,
  subscriber_only        boolean,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  last_read_at           timestamptz,
  muted_until            timestamptz,
  member_role            text,
  has_unread             boolean,
  pinned                 boolean,
  peer_user_id           uuid,
  peer_handle            text,
  peer_display_name      text,
  peer_avatar_url        text,
  sender_handle          text,
  sender_display_name    text,
  avatar_url             text,
  description            text,
  created_by             uuid
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.kind, r.slug, r.title, r.dm_key, r.subscriber_only,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_at
    end,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_preview
    end,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_sender_id
    end,
    m.last_read_at, m.muted_until, m.role,
    (
      r.last_message_at is not null
      and (m.history_starts_at is null or r.last_message_at >= m.history_starts_at)
      and (r.last_message_sender_id is distinct from p_user_id)
      and (m.last_read_at is null or r.last_message_at > m.last_read_at)
    ) as has_unread,
    coalesce(m.pinned, false) as pinned,
    peer_prof.user_id, peer_prof.handle, peer_prof.display_name, peer_prof.avatar_url,
    sender_prof.handle, sender_prof.display_name,
    r.avatar_url, r.description, r.created_by
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles peer_prof
    on r.kind = 'dm'
    and peer_prof.user_id = case
      when r.dm_key is null then null::uuid
      when split_part(r.dm_key, '::', 1)::text = p_user_id::text
      then split_part(r.dm_key, '::', 2)::uuid
      else split_part(r.dm_key, '::', 1)::uuid
    end
  left join public.profiles sender_prof
    on sender_prof.user_id = r.last_message_sender_id
  where m.user_id = p_user_id
    and m.archived_at is null
  order by coalesce(m.pinned, false) desc, r.last_message_at desc nulls last;
$$;

create or replace function public.chat_archived_rooms_for_user(p_user_id uuid)
returns table (
  id                     uuid,
  kind                   text,
  slug                   text,
  title                  text,
  dm_key                 text,
  subscriber_only        boolean,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  last_read_at           timestamptz,
  muted_until            timestamptz,
  member_role            text,
  has_unread             boolean,
  pinned                 boolean,
  peer_user_id           uuid,
  peer_handle            text,
  peer_display_name      text,
  peer_avatar_url        text,
  sender_handle          text,
  sender_display_name    text,
  avatar_url             text,
  description            text,
  created_by             uuid
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.kind, r.slug, r.title, r.dm_key, r.subscriber_only,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_at
    end,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_preview
    end,
    case
      when m.history_starts_at is not null and r.last_message_at < m.history_starts_at then null
      else r.last_message_sender_id
    end,
    m.last_read_at, m.muted_until, m.role,
    (
      r.last_message_at is not null
      and (m.history_starts_at is null or r.last_message_at >= m.history_starts_at)
      and (r.last_message_sender_id is distinct from p_user_id)
      and (m.last_read_at is null or r.last_message_at > m.last_read_at)
    ) as has_unread,
    coalesce(m.pinned, false) as pinned,
    peer_prof.user_id, peer_prof.handle, peer_prof.display_name, peer_prof.avatar_url,
    sender_prof.handle, sender_prof.display_name,
    r.avatar_url, r.description, r.created_by
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles peer_prof
    on r.kind = 'dm'
    and peer_prof.user_id = case
      when r.dm_key is null then null::uuid
      when split_part(r.dm_key, '::', 1)::text = p_user_id::text
      then split_part(r.dm_key, '::', 2)::uuid
      else split_part(r.dm_key, '::', 1)::uuid
    end
  left join public.profiles sender_prof
    on sender_prof.user_id = r.last_message_sender_id
  where m.user_id = p_user_id
    and m.archived_at is not null
  order by coalesce(r.last_message_at, m.archived_at) desc nulls last;
$$;

create or replace function public.chat_unread_room_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  where m.user_id = auth.uid()
    and m.archived_at is null
    and r.kind is distinct from 'creator_fan'
    and r.kind is distinct from 'platform_sub'
    and r.last_message_at is not null
    and (m.history_starts_at is null or r.last_message_at >= m.history_starts_at)
    and (r.last_message_sender_id is distinct from auth.uid())
    and (m.last_read_at is null or r.last_message_at > m.last_read_at);
$$;

comment on function public.chat_unread_room_count() is
  'Unread chat rooms for dock FAB badge. Excludes archived, creator_fan, and platform_sub (Private Subs tab). Hides rooms whose latest message is before the viewer history_starts_at.';

grant execute on function public.chat_unread_room_count() to authenticated;
grant execute on function public.chat_rooms_for_user(uuid) to authenticated, anon;
grant execute on function public.chat_archived_rooms_for_user(uuid) to authenticated, anon;

-- Private Subs catalog: members with a history cut must not see last-message preview/unread.
-- Non-members still get the public teaser.
drop function if exists public.list_creator_fan_private_subs(text);

create or replace function public.list_creator_fan_private_subs(p_search text default '')
returns table (
  room_id uuid,
  creator_user_id uuid,
  title text,
  description text,
  topic_keywords text,
  avatar_url text,
  creator_handle text,
  creator_display_name text,
  creator_avatar_url text,
  is_member boolean,
  is_host boolean,
  member_role text,
  has_unread boolean,
  last_message_at timestamptz,
  last_message_preview text,
  catalog_kind text,
  room_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select auth.uid() as uid
  ),
  platform_room as (
    select public.platform_sub_ensure_slots_pro_lounge() as room_id
  ),
  platform_base as (
    select
      r.id as room_id,
      null::uuid as creator_user_id,
      r.title,
      r.description,
      r.topic_keywords,
      r.avatar_url,
      null::text as creator_handle,
      'Slots Edge Pro'::text as creator_display_name,
      null::text as creator_avatar_url,
      (
        exists (
          select 1
          from public.chat_room_members m
          where m.room_id = r.id
            and m.user_id = (select uid from v)
        )
      ) as is_member,
      false as is_host,
      (
        select m.role
        from public.chat_room_members m
        where m.room_id = r.id
          and m.user_id = (select uid from v)
      ) as member_role,
      (
        select m.history_starts_at
        from public.chat_room_members m
        where m.room_id = r.id
          and m.user_id = (select uid from v)
      ) as history_starts_at,
      'platform'::text as catalog_kind,
      'platform_sub'::text as room_kind,
      r.last_message_at,
      r.last_message_preview,
      r.last_message_sender_id
    from public.chat_rooms r
    cross join platform_room pr
    where r.id = pr.room_id
      and (
        coalesce(trim(p_search), '') = ''
        or r.title ilike '%' || trim(p_search) || '%'
        or coalesce(r.description, '') ilike '%' || trim(p_search) || '%'
        or coalesce(r.topic_keywords, '') ilike '%' || trim(p_search) || '%'
        or 'slots edge pro' ilike '%' || trim(p_search) || '%'
      )
  ),
  creator_base as (
    select
      r.id as room_id,
      r.creator_user_id,
      r.title,
      r.description,
      r.topic_keywords,
      r.avatar_url,
      p.handle as creator_handle,
      p.display_name as creator_display_name,
      p.avatar_url as creator_avatar_url,
      (
        exists (
          select 1
          from public.chat_room_members m
          where m.room_id = r.id
            and m.user_id = (select uid from v)
        )
      ) as is_member,
      (r.creator_user_id = (select uid from v)) as is_host,
      (
        select m.role
        from public.chat_room_members m
        where m.room_id = r.id
          and m.user_id = (select uid from v)
      ) as member_role,
      (
        select m.history_starts_at
        from public.chat_room_members m
        where m.room_id = r.id
          and m.user_id = (select uid from v)
      ) as history_starts_at,
      'creator'::text as catalog_kind,
      'creator_fan'::text as room_kind,
      r.last_message_at,
      r.last_message_preview,
      r.last_message_sender_id
    from public.chat_rooms r
    inner join public.creator_monetization_profiles cmp
      on cmp.fan_room_id = r.id
      and cmp.user_id = r.creator_user_id
    inner join public.profiles p on p.user_id = r.creator_user_id
    where r.kind = 'creator_fan'
      and cmp.enabled
      and cmp.connect_onboarding_complete
      and p.banned_at is null
      and public.creator_fan_offer_is_complete(
        cmp.offer_intro,
        cmp.offer_private_posts,
        cmp.offer_fan_chat
      )
      and (
        coalesce(trim(p_search), '') = ''
        or r.title ilike '%' || trim(p_search) || '%'
        or coalesce(r.description, '') ilike '%' || trim(p_search) || '%'
        or coalesce(r.topic_keywords, '') ilike '%' || trim(p_search) || '%'
      )
  ),
  combined as (
    select * from platform_base
    union all
    select * from creator_base
  )
  select
    b.room_id,
    b.creator_user_id,
    b.title,
    b.description,
    b.topic_keywords,
    b.avatar_url,
    b.creator_handle,
    b.creator_display_name,
    b.creator_avatar_url,
    b.is_member,
    b.is_host,
    case when b.is_host then 'admin' else coalesce(b.member_role, 'member') end as member_role,
    (
      b.is_member
      and b.last_message_at is not null
      and (b.history_starts_at is null or b.last_message_at >= b.history_starts_at)
      and (b.last_message_sender_id is distinct from (select uid from v))
      and (
        (
          select m.last_read_at
          from public.chat_room_members m
          where m.room_id = b.room_id
            and m.user_id = (select uid from v)
          limit 1
        ) is null
        or b.last_message_at > (
          select m.last_read_at
          from public.chat_room_members m
          where m.room_id = b.room_id
            and m.user_id = (select uid from v)
          limit 1
        )
      )
    ) as has_unread,
    case
      when b.is_member
           and b.history_starts_at is not null
           and b.last_message_at is not null
           and b.last_message_at < b.history_starts_at then null
      else b.last_message_at
    end as last_message_at,
    case
      when b.is_member
           and b.history_starts_at is not null
           and b.last_message_at is not null
           and b.last_message_at < b.history_starts_at then null
      else b.last_message_preview
    end as last_message_preview,
    b.catalog_kind,
    b.room_kind
  from combined b
  order by
    case when b.catalog_kind = 'platform' then 0 else 1 end,
    b.is_member desc,
    b.last_message_at desc nulls last,
    b.title asc;
$$;

revoke all on function public.list_creator_fan_private_subs(text) from public;
grant execute on function public.list_creator_fan_private_subs(text) to authenticated;

notify pgrst, 'reload schema';
