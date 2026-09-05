-- Owner toggle: members may send messages, or only the owner (plus room admins / lounge bots).
-- Default true keeps current behavior. DMs always allow both sides to post.

alter table public.chat_rooms
  add column if not exists members_can_post boolean not null default true;

comment on column public.chat_rooms.members_can_post is
  'When false, only the owner, room admins, and lounge bots can send chat messages. DMs ignore this.';

create or replace function public.chat_set_members_can_post(p_room_id uuid, p_enabled boolean)
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
    raise exception 'Direct messages always allow both people to post';
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
    raise exception 'This room does not support a posting setting';
  end if;

  update public.chat_rooms
  set members_can_post = coalesce(p_enabled, true)
  where id = p_room_id;

  return coalesce(p_enabled, true);
end;
$$;

revoke all on function public.chat_set_members_can_post(uuid, boolean) from public, anon;
grant execute on function public.chat_set_members_can_post(uuid, boolean) to authenticated;

create or replace function public.chat_messages_enforce_members_can_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_can boolean;
  v_created_by uuid;
  v_creator uuid;
  v_role text;
  v_staff boolean := false;
begin
  if new.content_encoding in ('call_recording', 'call_summary') then
    return new;
  end if;

  select r.kind, r.members_can_post, r.created_by, r.creator_user_id
    into v_kind, v_can, v_created_by, v_creator
  from public.chat_rooms r
  where r.id = new.room_id;

  if v_kind is null then
    return new;
  end if;
  if v_kind = 'dm' or v_can is not false then
    return new;
  end if;

  if new.sender_id is not distinct from v_created_by
     or new.sender_id is not distinct from v_creator then
    return new;
  end if;

  select m.role into v_role
  from public.chat_room_members m
  where m.room_id = new.room_id and m.user_id = new.sender_id;

  if v_role = 'admin' then
    return new;
  end if;

  if exists (
    select 1
    from public.lounge_bot_accounts b
    where b.user_id = new.sender_id
  ) then
    return new;
  end if;

  if v_kind = 'platform_sub' then
    select (p.role in ('admin', 'moderator')) into v_staff
    from public.profiles p
    where p.user_id = new.sender_id;
    if v_staff is true then
      return new;
    end if;
  end if;

  raise exception 'POSTING_LOCKED' using message = 'Only the owner can post in this room.';
end;
$$;

drop trigger if exists chat_messages_enforce_members_can_post_bi on public.chat_messages;
create trigger chat_messages_enforce_members_can_post_bi
  before insert on public.chat_messages
  for each row
  execute function public.chat_messages_enforce_members_can_post();

notify pgrst, 'reload schema';
