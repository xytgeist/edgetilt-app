-- Dock FAB chat badge: exclude Private Subs (creator_fan) rooms.
-- Private Subs tab keeps its own unread dot via list_creator_fan_private_subs in ChatTab.

begin;

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
    and r.last_message_at is not null
    and (r.last_message_sender_id is distinct from auth.uid())
    and (m.last_read_at is null or r.last_message_at > m.last_read_at);
$$;

comment on function public.chat_unread_room_count() is
  'Unread chat rooms for dock FAB badge. Excludes archived and creator_fan (Private Subs); fan unread uses list_creator_fan_private_subs in Chat tab.';

grant execute on function public.chat_unread_room_count() to authenticated;

commit;
