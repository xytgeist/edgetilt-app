-- Chat calling (LiveKit): call rows, participants, push event type, realtime.

begin;

-- ---------------------------------------------------------------------------
-- chat_calls
-- ---------------------------------------------------------------------------
create table if not exists public.chat_calls (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid not null references public.chat_rooms (id) on delete cascade,
  kind text not null check (kind in ('dm_av', 'group_audio')),
  media_mode text not null default 'audio' check (media_mode in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'ended', 'missed', 'declined')),
  started_by uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  livekit_room_name text not null unique,
  constraint chat_calls_media_mode_kind check (
    (kind = 'group_audio' and media_mode = 'audio')
    or kind = 'dm_av'
  )
);

create unique index if not exists chat_calls_one_open_per_room_idx
  on public.chat_calls (chat_room_id)
  where status in ('ringing', 'active');

create index if not exists chat_calls_room_started_idx
  on public.chat_calls (chat_room_id, started_at desc);

create index if not exists chat_calls_status_started_idx
  on public.chat_calls (status, started_at desc)
  where status in ('ringing', 'active');

comment on table public.chat_calls is
  'LiveKit-backed DM A/V and group audio calls. Membership gated via chat_room_members.';

-- ---------------------------------------------------------------------------
-- chat_call_participants
-- ---------------------------------------------------------------------------
create table if not exists public.chat_call_participants (
  call_id uuid not null references public.chat_calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('caller', 'callee', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists chat_call_participants_user_idx
  on public.chat_call_participants (user_id, joined_at desc);

-- ---------------------------------------------------------------------------
-- RLS (select for room members; writes via service role Edge)
-- ---------------------------------------------------------------------------
alter table public.chat_calls enable row level security;
alter table public.chat_call_participants enable row level security;

drop policy if exists chat_calls_select_member on public.chat_calls;
create policy chat_calls_select_member on public.chat_calls
  for select
  using (
    exists (
      select 1
      from public.chat_room_members m
      where m.room_id = chat_calls.chat_room_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists chat_call_participants_select_member on public.chat_call_participants;
create policy chat_call_participants_select_member on public.chat_call_participants
  for select
  using (
    exists (
      select 1
      from public.chat_calls c
      join public.chat_room_members m on m.room_id = c.chat_room_id
      where c.id = chat_call_participants.call_id
        and m.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.chat_calls from authenticated, anon;
revoke insert, update, delete on public.chat_call_participants from authenticated, anon;
grant select on public.chat_calls to authenticated;
grant select on public.chat_call_participants to authenticated;

-- Realtime for in-app ring / status (RLS filters deliveries)
do $$
begin
  alter publication supabase_realtime add table public.chat_calls;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- activity_events: chat_call_invite + chat_call_id column
-- ---------------------------------------------------------------------------
alter table public.activity_events
  add column if not exists chat_call_id uuid references public.chat_calls (id) on delete set null;

create index if not exists activity_events_chat_call_id_idx
  on public.activity_events (chat_call_id)
  where chat_call_id is not null;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite',
      'starter_weekly_guide_drop',
      'creator_fan_sub'
    )
  );

-- Exclude chat_call_invite from in-app Lounge notifications (push-routing only).
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
    and ae.read_at is null
    and ae.event_type not in ('chat_dm', 'chat_group_invite', 'chat_call_invite');
$$;

grant execute on function public.lounge_activity_unread_count() to authenticated;

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
  actor_is_og boolean,
  starter_weekly_unlock_id uuid
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
    coalesce(p.is_og, false) as actor_is_og,
    ae.starter_weekly_unlock_id
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  where ae.recipient_user_id = auth.uid()
    and ae.event_type not in ('chat_dm', 'chat_group_invite', 'chat_call_invite')
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;

comment on column public.activity_events.chat_call_id is
  'Optional LiveKit chat call id for chat_call_invite deep links (?call=).';

-- ---------------------------------------------------------------------------
-- Expose content_encoding on message RPCs (call_summary chips)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.chat_messages_page(uuid, int, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.chat_messages_page(
  p_room_id            uuid,
  p_limit              int         DEFAULT 50,
  p_before_created_at  timestamptz DEFAULT NULL,
  p_before_id          uuid        DEFAULT NULL,
  p_after_created_at   timestamptz DEFAULT NULL,
  p_after_id           uuid        DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;
  lim := greatest(1, least(coalesce(p_limit, 50), 100));

  IF p_after_created_at IS NOT NULL THEN
    RETURN QUERY
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at > p_after_created_at
        OR (msg.created_at = p_after_created_at AND msg.id > coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    ORDER BY msg.created_at ASC, msg.id ASC
    LIMIT lim;
    RETURN;
  END IF;

  IF p_before_created_at IS NOT NULL THEN
    RETURN QUERY
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at < p_before_created_at
        OR (msg.created_at = p_before_created_at AND msg.id < coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT lim;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
         msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
         msg.video_url, msg.content_encoding,
         msg.created_at, msg.deleted_at, msg.reply_to_message_id,
         msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
  FROM public.chat_messages msg
  WHERE msg.room_id = p_room_id
  ORDER BY msg.created_at DESC, msg.id DESC
  LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.chat_messages_window(uuid, uuid, int);

CREATE OR REPLACE FUNCTION public.chat_messages_window(
  p_room_id    uuid,
  p_message_id uuid,
  p_limit      int DEFAULT 40
)
RETURNS TABLE (
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; v_at timestamptz; v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;
  SELECT msg.created_at, msg.id INTO v_at, v_id
  FROM public.chat_messages msg
  WHERE msg.id = p_message_id AND msg.room_id = p_room_id;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING MESSAGE = 'Message not found.';
  END IF;
  lim := ceil(greatest(10, least(coalesce(p_limit, 40), 100)) / 2.0)::int;
  RETURN QUERY
  WITH older AS (
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at < v_at OR (msg.created_at = v_at AND msg.id <= v_id))
    ORDER BY msg.created_at DESC, msg.id DESC LIMIT lim
  ),
  newer AS (
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.stream_video_uid, msg.stream_poster_url, msg.stream_video_width, msg.stream_video_height,
           msg.video_url, msg.content_encoding,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at > v_at OR (msg.created_at = v_at AND msg.id > v_id))
    ORDER BY msg.created_at ASC, msg.id ASC LIMIT lim
  )
  SELECT * FROM (SELECT * FROM older UNION ALL SELECT * FROM newer) c
  ORDER BY c.created_at ASC, c.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_messages_window(uuid, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_messages_window(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';

commit;
