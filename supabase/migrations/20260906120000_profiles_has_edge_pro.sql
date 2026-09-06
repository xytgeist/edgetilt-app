-- Edge Pro-only stream must not treat Slots Edge Pro as Edge Pro.
-- profiles.has_active_subscription stays the Verified Subscriber / Slots grant.
-- profiles.has_edge_pro follows has_edge_pro_entitlement(): edge-pro, lifetime, or staff.

alter table public.profiles
  add column if not exists has_edge_pro boolean not null default false;

comment on column public.profiles.has_edge_pro is
  'True when the user has Edge Pro or Slots Edge Lifetime, or is staff. Drives the Pro-only Lounge stream and comment filter. Independent of has_active_subscription.';

create or replace function public.sync_profile_has_active_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_sub boolean;
  edge_pro boolean;
  staff_role boolean;
begin
  if p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.product_slug in ('slots-edge', 'slots-edge-lifetime', 'edge-pro')
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
  )
  into active_sub;

  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
  )
  into edge_pro;

  select exists (
    select 1
    from public.profiles pr
    where pr.user_id = p_user_id
      and pr.role in ('admin', 'moderator')
  )
  into staff_role;

  update public.profiles p
  set
    has_active_subscription = active_sub,
    has_edge_pro = (edge_pro or staff_role)
  where p.user_id = p_user_id
    and (
      p.has_active_subscription is distinct from active_sub
      or p.has_edge_pro is distinct from (edge_pro or staff_role)
    );
end;
$$;

comment on function public.sync_profile_has_active_subscription(uuid) is
  'Keeps profiles.has_active_subscription (Slots Pro / Lifetime / Edge Pro) and profiles.has_edge_pro (Edge Pro / Lifetime / staff) in sync.';

create or replace function public.profiles_guard_subscription_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.has_active_subscription is not distinct from old.has_active_subscription
    and new.has_edge_pro is not distinct from old.has_edge_pro then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if public.current_user_has_staff_role() then
    return new;
  end if;
  raise exception 'subscription flags may only be changed by staff or service role / SQL editor';
end;
$$;

update public.profiles p
set has_edge_pro = (
  exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p.user_id
      and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
  )
  or p.role in ('admin', 'moderator')
);
