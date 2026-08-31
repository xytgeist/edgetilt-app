-- Multi-product Edge Pro ($9.99/mo) platform social tier
-- Spec: docs/entitlements-matrix.md §1 - §2
-- 1. Inserts edge-pro into public.subscription_products
-- 2. Updates sync_profile_has_active_subscription to include edge-pro
-- 3. Ensures has_edge_pro_entitlement checks user_subscriptions and staff

do $$
begin
  -- 1. Insert/Update edge-pro in subscription_products
  insert into public.subscription_products (slug, display_name, description, active, sort_order)
  values (
    'edge-pro',
    'Edge Pro',
    'Platform social tier: verified Pro badge, reply gating, and pro-only stream & comment filtering.',
    true,
    5
  )
  on conflict (slug) do update set
    display_name = excluded.display_name,
    description = excluded.description,
    active = excluded.active,
    sort_order = excluded.sort_order;

  -- 2. Update sync_profile_has_active_subscription
  execute $func$
  create or replace function public.sync_profile_has_active_subscription(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $body$
  declare
    active_sub boolean;
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

    update public.profiles p
    set has_active_subscription = active_sub
    where p.user_id = p_user_id
      and p.has_active_subscription is distinct from active_sub;
  end;
  $body$;
  $func$;

  -- 3. Update has_edge_pro_entitlement helper
  execute $func$
  create or replace function public.has_edge_pro_entitlement(p_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  set row_security = off
  as $body$
    select exists (
      select 1
      from public.user_subscriptions us
      where us.user_id = p_user_id
        and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
        and us.status in ('active', 'trialing')
        and (us.current_period_end is null or us.current_period_end > now())
    )
    or exists (
      select 1
      from public.profiles pr
      where pr.user_id = p_user_id
        and pr.role in ('admin', 'moderator')
    );
  $body$;
  $func$;

  grant execute on function public.has_edge_pro_entitlement(uuid) to authenticated, anon, service_role;
end $$;
