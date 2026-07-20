-- Creator fan subscriptions (Connect, preset tiers, fan room membership).
-- Spec: docs/entitlements-matrix.md §5. Apply on test before Edge deploy + Stripe Price secrets.

begin;

-- ---------------------------------------------------------------------------
-- Preset tier catalog (MSRP; Stripe Price ids in Edge secrets)
-- ---------------------------------------------------------------------------
create table if not exists public.creator_fan_tiers (
  tier_key text primary key,
  msrp_cents int not null,
  sort_order int not null default 0,
  active boolean not null default true,
  constraint creator_fan_tiers_msrp_positive check (msrp_cents > 0)
);

insert into public.creator_fan_tiers (tier_key, msrp_cents, sort_order)
values
  ('fan-tier-499', 499, 10),
  ('fan-tier-999', 999, 20),
  ('fan-tier-1999', 1999, 30),
  ('fan-tier-4999', 4999, 40),
  ('fan-tier-9999', 9999, 50)
on conflict (tier_key) do update set
  msrp_cents = excluded.msrp_cents,
  sort_order = excluded.sort_order,
  active = excluded.active;

comment on table public.creator_fan_tiers is
  'Preset creator fan sub monthly tiers. Stripe Price id per tier_key lives in Edge secret STRIPE_PRICE_FAN_TIER_*';

-- ---------------------------------------------------------------------------
-- Creator seller profile (one row per monetizing user)
-- ---------------------------------------------------------------------------
create table if not exists public.creator_monetization_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fan_tier_key text not null references public.creator_fan_tiers (tier_key),
  enabled boolean not null default false,
  stripe_connect_account_id text,
  connect_onboarding_complete boolean not null default false,
  fan_room_id uuid references public.chat_rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_monetization_profiles_enabled_idx
  on public.creator_monetization_profiles (enabled)
  where enabled = true;

comment on table public.creator_monetization_profiles is
  'Verified creators: Connect account, chosen preset tier, fan group chat room.';

-- ---------------------------------------------------------------------------
-- Fan ↔ creator Stripe subscription grants
-- ---------------------------------------------------------------------------
create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_user_id uuid not null references auth.users (id) on delete cascade,
  creator_user_id uuid not null references auth.users (id) on delete cascade,
  fan_tier_key text not null references public.creator_fan_tiers (tier_key),
  stripe_subscription_id text not null,
  stripe_customer_id text not null,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_subscriptions_stripe_subscription_id_key unique (stripe_subscription_id),
  constraint creator_subscriptions_subscriber_creator_key unique (subscriber_user_id, creator_user_id)
);

create index if not exists creator_subscriptions_creator_idx
  on public.creator_subscriptions (creator_user_id, status);

comment on table public.creator_subscriptions is
  'Per-creator fan subs (Connect). Distinct from platform user_subscriptions.';

-- ---------------------------------------------------------------------------
-- Chat: creator fan rooms
-- ---------------------------------------------------------------------------
alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms
  add constraint chat_rooms_kind_check
  check (kind in ('dm', 'group', 'channel', 'creator_fan'));

alter table public.chat_rooms
  add column if not exists creator_user_id uuid references auth.users (id) on delete cascade;

comment on column public.chat_rooms.creator_user_id is
  'Set when kind = creator_fan. Owner creator user id for fan room access rules.';

create unique index if not exists chat_rooms_creator_fan_uidx
  on public.chat_rooms (creator_user_id)
  where kind = 'creator_fan';

alter table public.chat_room_members drop constraint if exists chat_room_members_role_check;
alter table public.chat_room_members
  add constraint chat_room_members_role_check
  check (role in ('member', 'admin', 'moderator'));

-- ---------------------------------------------------------------------------
-- Lounge: creator fan-only posts (RLS uses has_creator_fan_sub)
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts
  add column if not exists creator_fan_only boolean not null default false;

comment on column public.community_feed_posts.creator_fan_only is
  'When true, visible only to fans subscribed to post author (creator_user_id) or staff.';

create or replace function public.has_creator_fan_sub(
  p_viewer_id uuid,
  p_creator_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer_id is not null
    and p_creator_user_id is not null
    and (
      p_viewer_id = p_creator_user_id
      or exists (
        select 1
        from public.creator_subscriptions cs
        where cs.subscriber_user_id = p_viewer_id
          and cs.creator_user_id = p_creator_user_id
          and cs.status in ('active', 'trialing')
      )
      or exists (
        select 1
        from public.profiles p
        where p.user_id = p_viewer_id
          and p.role in ('admin', 'moderator')
      )
    );
$$;

grant execute on function public.has_creator_fan_sub(uuid, uuid) to authenticated, anon;

drop policy if exists community_feed_posts_select_public on public.community_feed_posts;
create policy community_feed_posts_select_public on public.community_feed_posts
  for select to anon, authenticated
  using (
    hidden_at is null
    and (
      (
        not coalesce(subscriber_only, false)
        and not coalesce(creator_fan_only, false)
      )
      or (
        coalesce(subscriber_only, false)
        and not coalesce(creator_fan_only, false)
        and public.lounge_viewer_is_subscriber_or_staff()
      )
      or (
        coalesce(creator_fan_only, false)
        and public.has_creator_fan_sub((select auth.uid()), user_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Fan room membership sync (service role + RPC)
-- ---------------------------------------------------------------------------
create or replace function public.creator_fan_sub_sync_chat_member(
  p_subscriber_user_id uuid,
  p_creator_user_id uuid,
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
  if p_subscriber_user_id is null or p_creator_user_id is null then
    return;
  end if;

  select cmp.fan_room_id into v_room_id
  from public.creator_monetization_profiles cmp
  where cmp.user_id = p_creator_user_id
    and cmp.fan_room_id is not null;

  if v_room_id is null then
    return;
  end if;

  if p_grant_access then
    insert into public.chat_room_members (room_id, user_id, role)
    values (v_room_id, p_subscriber_user_id, 'member')
    on conflict (room_id, user_id) do nothing;
  else
    delete from public.chat_room_members
    where room_id = v_room_id
      and user_id = p_subscriber_user_id
      and role = 'member';
  end if;
end;
$$;

revoke all on function public.creator_fan_sub_sync_chat_member(uuid, uuid, boolean) from public;
grant execute on function public.creator_fan_sub_sync_chat_member(uuid, uuid, boolean) to service_role;

create or replace function public.creator_fan_ensure_room(p_creator_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_handle text;
  v_title text;
  v_slug text;
begin
  if p_creator_user_id is null then
    raise exception 'creator user id required';
  end if;

  select cmp.fan_room_id into v_room_id
  from public.creator_monetization_profiles cmp
  where cmp.user_id = p_creator_user_id;

  if v_room_id is not null then
    return v_room_id;
  end if;

  select p.handle into v_handle
  from public.profiles p
  where p.user_id = p_creator_user_id;

  if v_handle is null or length(trim(v_handle)) = 0 then
    raise exception 'Set a profile handle before enabling fan subscriptions';
  end if;

  v_slug := 'fan-' || lower(trim(v_handle));
  v_title := '@' || trim(v_handle) || ' fan room';

  insert into public.chat_rooms (
    kind,
    slug,
    title,
    topic_key,
    max_members,
    subscriber_only,
    created_by,
    creator_user_id
  )
  values (
    'creator_fan',
    v_slug,
    v_title,
    'creator_fan:' || p_creator_user_id::text,
    500,
    false,
    p_creator_user_id,
    p_creator_user_id
  )
  returning id into v_room_id;

  insert into public.chat_room_members (room_id, user_id, role)
  values (v_room_id, p_creator_user_id, 'admin')
  on conflict (room_id, user_id) do update set role = 'admin';

  update public.creator_monetization_profiles
  set fan_room_id = v_room_id,
      updated_at = now()
  where user_id = p_creator_user_id;

  return v_room_id;
end;
$$;

revoke all on function public.creator_fan_ensure_room(uuid) from public;
grant execute on function public.creator_fan_ensure_room(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Client / RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.get_my_creator_fan_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_object_agg(
        'creator-fan:' || cs.creator_user_id::text,
        jsonb_build_object(
          'active', true,
          'status', cs.status,
          'current_period_end', cs.current_period_end,
          'cancel_at_period_end', cs.cancel_at_period_end,
          'fan_tier_key', cs.fan_tier_key,
          'creator_user_id', cs.creator_user_id
        )
      )
      from public.creator_subscriptions cs
      where cs.subscriber_user_id = auth.uid()
        and cs.status in ('active', 'trialing')
    ),
    '{}'::jsonb
  );
$$;

grant execute on function public.get_my_creator_fan_entitlements() to authenticated;

create or replace function public.get_my_creator_fan_monetization()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'fan_tier_key', cmp.fan_tier_key,
        'msrp_cents', tft.msrp_cents,
        'enabled', cmp.enabled,
        'connect_onboarding_complete', cmp.connect_onboarding_complete,
        'stripe_connect_account_id', cmp.stripe_connect_account_id,
        'fan_room_id', cmp.fan_room_id,
        'handle', p.handle
      )
      from public.creator_monetization_profiles cmp
      join public.creator_fan_tiers tft on tft.tier_key = cmp.fan_tier_key
      join public.profiles p on p.user_id = cmp.user_id
      where cmp.user_id = auth.uid()
    ),
    jsonb_build_object(
      'fan_tier_key', 'fan-tier-999',
      'msrp_cents', 999,
      'enabled', false,
      'connect_onboarding_complete', false,
      'stripe_connect_account_id', null,
      'fan_room_id', null,
      'handle', (select handle from public.profiles where user_id = auth.uid())
    )
  );
$$;

grant execute on function public.get_my_creator_fan_monetization() to authenticated;

create or replace function public.get_creator_fan_offer(p_creator_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'creator_user_id', p.user_id,
        'handle', p.handle,
        'enabled', cmp.enabled and cmp.connect_onboarding_complete,
        'fan_tier_key', cmp.fan_tier_key,
        'msrp_cents', tft.msrp_cents
      )
      from public.creator_monetization_profiles cmp
      join public.creator_fan_tiers tft on tft.tier_key = cmp.fan_tier_key
      join public.profiles p on p.user_id = cmp.user_id
      where cmp.user_id = p_creator_user_id
        and cmp.enabled
        and cmp.connect_onboarding_complete
        and p.banned_at is null
    ),
    null::jsonb
  );
$$;

grant execute on function public.get_creator_fan_offer(uuid) to authenticated, anon;

create or replace function public.creator_fan_save_monetization(
  p_fan_tier_key text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text;
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  if p_fan_tier_key is null or not exists (
    select 1 from public.creator_fan_tiers t
    where t.tier_key = p_fan_tier_key and t.active
  ) then
    raise exception 'Invalid fan tier';
  end if;

  select handle into v_handle from public.profiles where user_id = v_uid;
  if v_handle is null or length(trim(v_handle)) = 0 then
    raise exception 'Set a profile handle before fan subscriptions';
  end if;

  insert into public.creator_monetization_profiles (user_id, fan_tier_key, enabled)
  values (v_uid, p_fan_tier_key, false)
  on conflict (user_id) do update set
    fan_tier_key = excluded.fan_tier_key,
    updated_at = now();

  if p_enabled then
    if not exists (
      select 1 from public.creator_monetization_profiles cmp
      where cmp.user_id = v_uid
        and cmp.connect_onboarding_complete
        and cmp.stripe_connect_account_id is not null
    ) then
      raise exception 'Complete Stripe Connect onboarding first';
    end if;

    v_room_id := public.creator_fan_ensure_room(v_uid);

    update public.creator_monetization_profiles
    set enabled = true,
        fan_room_id = coalesce(fan_room_id, v_room_id),
        updated_at = now()
    where user_id = v_uid;
  else
    update public.creator_monetization_profiles
    set enabled = false,
        updated_at = now()
    where user_id = v_uid;
  end if;

  return public.get_my_creator_fan_monetization();
end;
$$;

grant execute on function public.creator_fan_save_monetization(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.creator_fan_tiers enable row level security;
alter table public.creator_monetization_profiles enable row level security;
alter table public.creator_subscriptions enable row level security;

drop policy if exists creator_fan_tiers_select_all on public.creator_fan_tiers;
create policy creator_fan_tiers_select_all on public.creator_fan_tiers
  for select to authenticated, anon
  using (active);

drop policy if exists creator_monetization_profiles_select_own on public.creator_monetization_profiles;
create policy creator_monetization_profiles_select_own on public.creator_monetization_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists creator_monetization_profiles_update_own on public.creator_monetization_profiles;
create policy creator_monetization_profiles_update_own on public.creator_monetization_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists creator_monetization_profiles_insert_own on public.creator_monetization_profiles;
create policy creator_monetization_profiles_insert_own on public.creator_monetization_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists creator_subscriptions_select_parties on public.creator_subscriptions;
create policy creator_subscriptions_select_parties on public.creator_subscriptions
  for select to authenticated
  using (
    subscriber_user_id = (select auth.uid())
    or creator_user_id = (select auth.uid())
  );

commit;
