-- Admin-only in-app comp: grant / revoke Slots Edge Lifetime (no mod powers).
-- Comp rows use stripe_subscription_id prefix admin_comp_lifetime_ (distinct from Stripe checkout).

begin;

create or replace function public.admin_assert_caller_is_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
end;
$$;

comment on function public.admin_assert_caller_is_admin() is
  'Raises unless authenticated caller has profiles.role = admin.';

create or replace function public.admin_member_slots_entitlements(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifetime public.user_subscriptions%rowtype;
  v_active boolean := false;
  v_admin_comp boolean := false;
  v_paid_lifetime boolean := false;
begin
  perform public.admin_assert_caller_is_admin();

  if p_target_user_id is null then
    raise exception 'target user required';
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_target_user_id) then
    raise exception 'profile not found';
  end if;

  select us.*
  into v_lifetime
  from public.user_subscriptions us
  where us.user_id = p_target_user_id
    and us.product_slug = 'slots-edge-lifetime'
    and us.status in ('active', 'trialing')
  order by us.updated_at desc
  limit 1;

  if found then
    v_active := true;
    v_admin_comp := coalesce(v_lifetime.stripe_subscription_id, '') like 'admin_comp_lifetime_%';
    v_paid_lifetime := not v_admin_comp;
  end if;

  return jsonb_build_object(
    'slots_edge_lifetime_active', v_active,
    'admin_comp_lifetime', v_admin_comp,
    'paid_lifetime', v_paid_lifetime,
    'slots_edge_pro_active', public.user_has_entitlement(p_target_user_id, 'slots-edge'),
    'slots_edge_starter_active', public.user_has_entitlement(p_target_user_id, 'slots-edge-starter')
  );
end;
$$;

create or replace function public.admin_comp_slots_edge_lifetime(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id text;
  v_cus_id text;
  v_existing public.user_subscriptions%rowtype;
begin
  perform public.admin_assert_caller_is_admin();

  if p_target_user_id is null then
    raise exception 'target user required';
  end if;

  select p.stripe_customer_id
  into v_cus_id
  from public.profiles p
  where p.user_id = p_target_user_id;

  if not found then
    raise exception 'profile not found';
  end if;

  select us.*
  into v_existing
  from public.user_subscriptions us
  where us.user_id = p_target_user_id
    and us.product_slug = 'slots-edge-lifetime'
    and us.status in ('active', 'trialing')
  limit 1;

  if found
    and coalesce(v_existing.stripe_subscription_id, '') not like 'admin_comp_lifetime_%'
  then
    raise exception 'Member already has Slots Edge Lifetime via billing.';
  end if;

  v_sub_id := 'admin_comp_lifetime_' || p_target_user_id::text;
  v_cus_id := coalesce(nullif(trim(v_cus_id), ''), 'admin_comp_cus_' || p_target_user_id::text);

  insert into public.user_subscriptions (
    user_id,
    product_slug,
    stripe_subscription_id,
    stripe_customer_id,
    status,
    cancel_at_period_end,
    current_period_end
  )
  values (
    p_target_user_id,
    'slots-edge-lifetime',
    v_sub_id,
    v_cus_id,
    'active',
    false,
    null
  )
  on conflict (user_id, product_slug) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id,
    status = 'active',
    cancel_at_period_end = false,
    current_period_end = null,
    updated_at = now();

  perform public.sync_profile_has_active_subscription(p_target_user_id);

  return public.admin_member_slots_entitlements(p_target_user_id);
end;
$$;

create or replace function public.admin_revoke_comp_slots_edge_lifetime(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  perform public.admin_assert_caller_is_admin();

  if p_target_user_id is null then
    raise exception 'target user required';
  end if;

  delete from public.user_subscriptions us
  where us.user_id = p_target_user_id
    and us.product_slug = 'slots-edge-lifetime'
    and coalesce(us.stripe_subscription_id, '') like 'admin_comp_lifetime_%';

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'No admin-comped Lifetime to revoke for this member.';
  end if;

  perform public.sync_profile_has_active_subscription(p_target_user_id);

  return public.admin_member_slots_entitlements(p_target_user_id);
end;
$$;

revoke all on function public.admin_assert_caller_is_admin() from public;
revoke all on function public.admin_member_slots_entitlements(uuid) from public;
revoke all on function public.admin_comp_slots_edge_lifetime(uuid) from public;
revoke all on function public.admin_revoke_comp_slots_edge_lifetime(uuid) from public;

grant execute on function public.admin_member_slots_entitlements(uuid) to authenticated;
grant execute on function public.admin_comp_slots_edge_lifetime(uuid) to authenticated;
grant execute on function public.admin_revoke_comp_slots_edge_lifetime(uuid) to authenticated;

comment on function public.admin_member_slots_entitlements(uuid) is
  'Admin-only: Slots Edge Lifetime / Pro / Starter flags for another member (profile comp UI).';

comment on function public.admin_comp_slots_edge_lifetime(uuid) is
  'Admin-only: grant comp Slots Edge Lifetime (admin_comp_lifetime_* row). Does not change profiles.role.';

comment on function public.admin_revoke_comp_slots_edge_lifetime(uuid) is
  'Admin-only: revoke admin-comped Lifetime only (not Stripe-paid Lifetime).';

commit;
