-- Fan room mod role assignment + member_role in Private Subs catalog.

create or replace function public.creator_fan_set_member_role(
  p_room_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_role is null or p_role not in ('member', 'moderator') then
    raise exception 'Invalid role';
  end if;

  select r.creator_user_id
  into v_creator
  from public.chat_rooms r
  where r.id = p_room_id
    and r.kind = 'creator_fan';

  if v_creator is null then
    raise exception 'Room not found';
  end if;
  if v_creator <> v_uid then
    raise exception 'Only the creator can change mod roles';
  end if;
  if p_target_user_id = v_creator then
    raise exception 'Cannot change the creator role';
  end if;

  update public.chat_room_members
  set role = p_role
  where room_id = p_room_id
    and user_id = p_target_user_id;

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.creator_fan_set_member_role(uuid, uuid, text) from public;
grant execute on function public.creator_fan_set_member_role(uuid, uuid, text) to authenticated;

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
  last_message_preview text
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select auth.uid() as uid
  ),
  base as (
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
      r.last_message_at,
      r.last_message_preview,
      r.last_message_sender_id,
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
      ) as member_role
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
      and (b.last_message_sender_id is distinct from (select uid from v))
      and (
        (
          select m.last_read_at
          from public.chat_room_members m
          where m.room_id = b.room_id
            and m.user_id = (select uid from v)
        ) is null
        or b.last_message_at > (
          select m.last_read_at
          from public.chat_room_members m
          where m.room_id = b.room_id
            and m.user_id = (select uid from v)
        )
      )
    ) as has_unread,
    b.last_message_at,
    b.last_message_preview
  from base b
  order by b.last_message_at desc nulls last, b.title asc nulls last;
$$;

revoke all on function public.list_creator_fan_private_subs(text) from public;
grant execute on function public.list_creator_fan_private_subs(text) to authenticated;
