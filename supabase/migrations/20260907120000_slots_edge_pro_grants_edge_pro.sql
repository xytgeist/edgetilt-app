-- Ryan 2026-09-07: Slots Edge Pro and Lifetime include Edge Pro social.
-- Starter does not. Supersedes the slug list in 20260906120000.

create or replace function public.has_edge_pro_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.product_slug in ('edge-pro', 'slots-edge', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.user_id = p_user_id
      and pr.role in ('admin', 'moderator')
  );
$$;

comment on function public.has_edge_pro_entitlement(uuid) is
  'True for Edge Pro, Slots Edge Pro, Slots Edge Lifetime, or staff. Starter is not enough.';

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
      and us.product_slug in ('edge-pro', 'slots-edge', 'slots-edge-lifetime')
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
  'Keeps has_active_subscription (Slots Pro / Lifetime / Edge Pro) and has_edge_pro (those plus staff) in sync. Starter is neither.';

create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_object_agg(
        us.product_slug,
        jsonb_build_object(
          'active', true,
          'status', us.status,
          'current_period_end', us.current_period_end,
          'cancel_at_period_end', us.cancel_at_period_end,
          'price_interval', us.price_interval,
          'billing_provider', us.billing_provider
        )
      )
      from public.user_subscriptions us
      where us.user_id = auth.uid()
        and us.status in ('active', 'trialing')
        and (us.current_period_end is null or us.current_period_end > now())
    ),
    '{}'::jsonb
  ) || jsonb_build_object(
    'platform', jsonb_build_object(
      'edge_pro', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.product_slug in ('edge-pro', 'slots-edge', 'slots-edge-lifetime')
          and us.status in ('active', 'trialing')
          and (us.current_period_end is null or us.current_period_end > now())
      ),
      'slots_edge_tier', coalesce(
        (
          select case
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge-lifetime'
                and status in ('active', 'trialing')
            ) then 'lifetime'
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge'
                and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now())
            ) then 'pro'
            when exists (
              select 1 from public.user_subscriptions
              where user_id = auth.uid()
                and product_slug = 'slots-edge-starter'
                and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now())
            ) then 'starter'
            else 'none'
          end
        ),
        'none'
      ),
      'has_active_subscription', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.status in ('active', 'trialing')
          and us.product_slug in ('slots-edge', 'slots-edge-lifetime', 'edge-pro')
          and (us.current_period_end is null or us.current_period_end > now())
      )
    ),
    'staff', jsonb_build_object(
      'is_staff', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role in ('admin', 'moderator')
      ),
      'is_admin', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role = 'admin'
      )
    )
  );
$$;

comment on column public.profiles.has_edge_pro is
  'True for Edge Pro, Slots Edge Pro, Slots Edge Lifetime, or staff. Drives the Pro-only Lounge stream and comment filter. Starter is not enough.';

update public.profiles p
set has_edge_pro = (
  exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p.user_id
      and us.product_slug in ('edge-pro', 'slots-edge', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
  )
  or p.role in ('admin', 'moderator')
);
