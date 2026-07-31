-- Platform Slots Edge Pro / Lifetime subscriber lounge (Private Subs tab + Slots tools hub).

begin;

alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms
  add constraint chat_rooms_kind_check
  check (kind in ('dm', 'group', 'channel', 'creator_fan', 'platform_sub'));

alter table public.chat_rooms
  add column if not exists platform_product_scope text;

comment on column public.chat_rooms.platform_product_scope is
  'When kind = platform_sub: entitlement scope key (e.g. slots_edge_pro for Pro + Lifetime).';

create unique index if not exists chat_rooms_platform_sub_scope_uidx
  on public.chat_rooms (platform_product_scope)
  where kind = 'platform_sub' and platform_product_scope is not null;

create or replace function public.user_has_slots_pro_lounge_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.user_id = p_user_id
          and p.role in ('admin', 'moderator')
      )
      or public.user_has_entitlement(p_user_id, 'slots-edge')
      or public.user_has_entitlement(p_user_id, 'slots-edge-lifetime')
    );
$$;

revoke all on function public.user_has_slots_pro_lounge_access(uuid) from public;
grant execute on function public.user_has_slots_pro_lounge_access(uuid) to authenticated, service_role;

create or replace function public.platform_sub_ensure_slots_pro_lounge()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_edgelord_id uuid;
begin
  select r.id into v_room_id
  from public.chat_rooms r
  where r.kind = 'platform_sub'
    and r.platform_product_scope = 'slots_edge_pro'
  limit 1;

  if v_room_id is not null then
    return v_room_id;
  end if;

  insert into public.chat_rooms (
    kind,
    slug,
    title,
    description,
    topic_key,
    topic_keywords,
    max_members,
    subscriber_only,
    platform_product_scope,
    created_by
  )
  values (
    'platform_sub',
    'slots-pro-lounge',
    'Slots Pro Lounge',
    'Subscriber-only group chat for Slots Edge Pro and Lifetime members.',
    'platform_sub:slots_edge_pro',
    'slots, ap, guides, community',
    5000,
    false,
    'slots_edge_pro',
    null
  )
  returning id into v_room_id;

  select p.user_id into v_edgelord_id
  from public.profiles p
  where lower(trim(p.handle)) = 'edgelord'
  limit 1;

  if v_edgelord_id is not null then
    insert into public.chat_room_members (room_id, user_id, role)
    values (v_room_id, v_edgelord_id, 'admin')
    on conflict (room_id, user_id) do update set role = 'admin';
  end if;

  return v_room_id;
end;
$$;

revoke all on function public.platform_sub_ensure_slots_pro_lounge() from public;
grant execute on function public.platform_sub_ensure_slots_pro_lounge() to authenticated, service_role;

create or replace function public.platform_sub_sync_chat_member(
  p_user_id uuid,
  p_grant_access boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  if p_user_id is null then
    return;
  end if;

  v_room_id := public.platform_sub_ensure_slots_pro_lounge();

  if coalesce(p_grant_access, false) then
    insert into public.chat_room_members (room_id, user_id, role)
    values (v_room_id, p_user_id, 'member')
    on conflict (room_id, user_id) do update
      set role = excluded.role
      where chat_room_members.role = 'member';
    return;
  end if;

  delete from public.chat_room_members m
  where m.room_id = v_room_id
    and m.user_id = p_user_id
    and m.role = 'member';
end;
$$;

revoke all on function public.platform_sub_sync_chat_member(uuid, boolean) from public;
grant execute on function public.platform_sub_sync_chat_member(uuid, boolean) to service_role;

create or replace function public.platform_sub_claim_membership(p_scope text default 'slots_edge_pro')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_has_slots_pro_lounge_access(v_uid) then
    raise exception 'Slots Edge Pro or Lifetime required';
  end if;

  perform public.platform_sub_sync_chat_member(v_uid, true);

  v_room_id := public.get_platform_sub_room_id(p_scope);
  if v_room_id is null then
    v_room_id := public.platform_sub_ensure_slots_pro_lounge();
  end if;

  return v_room_id;
end;
$$;

revoke all on function public.platform_sub_claim_membership(text) from public;
grant execute on function public.platform_sub_claim_membership(text) to authenticated, service_role;

create or replace function public.get_platform_sub_room_id(p_scope text default 'slots_edge_pro')
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.chat_rooms r
  where r.kind = 'platform_sub'
    and r.platform_product_scope = coalesce(nullif(trim(p_scope), ''), 'slots_edge_pro')
  limit 1;
$$;

grant execute on function public.get_platform_sub_room_id(text) to authenticated, service_role;

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
    b.last_message_at,
    b.last_message_preview,
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

-- Backfill Pro + Lifetime members into the lounge.
do $$
declare
  v_room_id uuid;
begin
  v_room_id := public.platform_sub_ensure_slots_pro_lounge();

  insert into public.chat_room_members (room_id, user_id, role)
  select v_room_id, us.user_id, 'member'
  from public.user_subscriptions us
  where us.product_slug in ('slots-edge', 'slots-edge-lifetime')
    and us.status in ('active', 'trialing')
  on conflict (room_id, user_id) do nothing;
end;
$$;

-- Dock FAB unread: exclude platform_sub (Private Subs tab owns unread).
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
    and (r.last_message_sender_id is distinct from auth.uid())
    and (m.last_read_at is null or r.last_message_at > m.last_read_at);
$$;

comment on function public.chat_unread_room_count() is
  'Unread chat rooms for dock FAB badge. Excludes archived, creator_fan, and platform_sub (Private Subs tab).';

grant execute on function public.chat_unread_room_count() to authenticated;

commit;
