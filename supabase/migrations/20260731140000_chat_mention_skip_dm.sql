-- chat_mention: group (and non-DM) rooms only.
-- DMs already notify on every new message (chat_message + DM push batch); @tags there are redundant
-- and the room label copy reads wrong (peer display name duplicated).

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

  if exists (
    select 1
    from public.chat_rooms r
    where r.id = p_room_id
      and r.kind = 'dm'
  ) then
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
  'Emit chat_mention activity_events for @handles in non-DM rooms (service_role / Edge). DMs skip — message push already covers new DMs.';
