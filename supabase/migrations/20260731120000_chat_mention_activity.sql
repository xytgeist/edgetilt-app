-- Chat @mention notifications: in-app Alerts + web push when a room member is tagged.
-- Copy: "{Display name} tagged you in {Chat room name}" (room label in detail_text, per recipient for DMs).

alter table public.activity_events
  add column if not exists chat_message_id uuid
    references public.chat_messages(id) on delete set null;

create index if not exists activity_events_chat_message_idx
  on public.activity_events (chat_message_id)
  where chat_message_id is not null;

comment on column public.activity_events.chat_message_id is
  'Chat message that triggered chat_mention (optional deep link).';

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
      'chat_call_missed',
      'chat_mention',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released'
    )
  );

comment on constraint activity_events_event_type_check on public.activity_events is
  'Includes chat_mention for room-member @tags in chat messages.';

-- Room label shown in notification copy (matches client chatRoomLabel, DM label is per viewer).
create or replace function public.chat_room_notification_label_for_user(
  p_room_id uuid,
  p_viewer_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text;
  v_title text;
  v_slug text;
  v_dm_key text;
  v_peer_id uuid;
  v_peer_name text;
begin
  select r.kind, r.title, r.slug, r.dm_key
    into v_kind, v_title, v_slug, v_dm_key
  from public.chat_rooms r
  where r.id = p_room_id;

  if v_kind is null then
    return 'Chat';
  end if;

  if v_kind = 'dm' then
    if v_dm_key is null then
      return 'Direct message';
    end if;
    if split_part(v_dm_key, '::', 1)::text = p_viewer_user_id::text then
      v_peer_id := split_part(v_dm_key, '::', 2)::uuid;
    else
      v_peer_id := split_part(v_dm_key, '::', 1)::uuid;
    end if;
    select nullif(trim(p.display_name), '')
      into v_peer_name
    from public.profiles p
    where p.user_id = v_peer_id;
    return coalesce(v_peer_name, 'Direct message');
  end if;

  if v_kind = 'channel' then
    if nullif(trim(v_title), '') is not null and nullif(trim(v_slug), '') is not null then
      return '#' || trim(v_slug) || ' · ' || trim(v_title);
    end if;
    if nullif(trim(v_slug), '') is not null then
      return '#' || trim(v_slug);
    end if;
    return coalesce(nullif(trim(v_title), ''), 'Channel');
  end if;

  if v_kind = 'creator_fan' then
    return coalesce(nullif(trim(v_title), ''), 'Private Sub');
  end if;

  if v_kind = 'platform_sub' then
    return coalesce(nullif(trim(v_title), ''), 'Slots Pro Lounge');
  end if;

  return coalesce(nullif(trim(v_title), ''), 'Group chat');
end;
$$;

comment on function public.chat_room_notification_label_for_user(uuid, uuid) is
  'Notification room title for chat_mention; DM uses peer display_name for the recipient.';

create or replace function public.chat_emit_mention_activity_events(
  p_room_id uuid,
  p_message_id uuid,
  p_actor_id uuid,
  p_body text
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
  v_room_label text;
begin
  if p_room_id is null or p_message_id is null or p_actor_id is null then
    return;
  end if;
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

    if v_recipient is null or v_recipient = p_actor_id then
      continue;
    end if;

    if not exists (
      select 1
      from public.chat_room_members m
      where m.room_id = p_room_id
        and m.user_id = v_recipient
    ) then
      continue;
    end if;

    v_room_label := public.chat_room_notification_label_for_user(p_room_id, v_recipient);

    insert into public.activity_events (
      recipient_user_id,
      actor_user_id,
      event_type,
      chat_room_id,
      chat_message_id,
      detail_text
    )
    values (
      v_recipient,
      p_actor_id,
      'chat_mention',
      p_room_id,
      p_message_id,
      v_room_label
    );
  end loop;
exception
  when others then
    raise warning 'chat_emit_mention_activity_events: %', sqlerrm;
end;
$$;

comment on function public.chat_emit_mention_activity_events(uuid, uuid, uuid, text) is
  'Emit chat_mention activity_events for @handles that match room members (service_role / Edge).';

revoke all on function public.chat_emit_mention_activity_events(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.chat_emit_mention_activity_events(uuid, uuid, uuid, text) to service_role;
