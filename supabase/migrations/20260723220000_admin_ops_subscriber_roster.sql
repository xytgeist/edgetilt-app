-- Edge Monitor: admin subscriber roster (platform + creator fan subs, identities, cancels).
-- Client: EdgeMonitorSubscriberRosterPanel via RPC admin_ops_subscriber_roster().

create or replace function public.admin_ops_subscriber_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_7d timestamptz := v_now - interval '7 days';
  v_30d timestamptz := v_now - interval '30 days';
  v_body jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  v_body := jsonb_build_object(
    'generated_at', v_now,
    'users', jsonb_build_object(
      'new_24h', (select count(*)::int from public.profiles p where p.created_at >= v_24h),
      'new_7d', (select count(*)::int from public.profiles p where p.created_at >= v_7d),
      'new_30d', (select count(*)::int from public.profiles p where p.created_at >= v_30d),
      'recent', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'role', r.role,
            'created_at', r.created_at,
            'stripe_customer_id', r.stripe_customer_id,
            'has_active_subscription_flag', r.has_active_subscription
          )
          order by r.created_at desc
        )
        from (
          select
            p.user_id,
            p.handle,
            p.display_name,
            u.email,
            p.role,
            p.created_at,
            p.stripe_customer_id,
            p.has_active_subscription
          from public.profiles p
          join auth.users u on u.id = p.user_id
          order by p.created_at desc
          limit 100
        ) r
      ), '[]'::jsonb)
    ),
    'platform', jsonb_build_object(
      'by_product', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'product_slug', s.product_slug,
            'display_name', s.display_name,
            'active_count', s.active_count,
            'trialing_count', s.trialing_count,
            'pending_cancel_count', s.pending_cancel_count,
            'total_rows', s.total_rows
          )
          order by s.sort_order, s.product_slug
        )
        from (
          select
            sp.slug as product_slug,
            sp.display_name,
            sp.sort_order,
            count(us.*)::int as total_rows,
            count(*) filter (where us.status = 'active')::int as active_count,
            count(*) filter (where us.status = 'trialing')::int as trialing_count,
            count(*) filter (
              where us.cancel_at_period_end = true
                and us.status in ('active', 'trialing')
            )::int as pending_cancel_count
          from public.subscription_products sp
          left join public.user_subscriptions us on us.product_slug = sp.slug
          group by sp.slug, sp.display_name, sp.sort_order
        ) s
      ), '[]'::jsonb),
      'status_totals', coalesce((
        select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
        from (
          select us.status, count(*)::int as cnt
          from public.user_subscriptions us
          group by us.status
        ) s
      ), '[]'::jsonb),
      'active_roster', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'product_slug', r.product_slug,
            'product_display_name', r.product_display_name,
            'status', r.status,
            'price_interval', r.price_interval,
            'cancel_at_period_end', r.cancel_at_period_end,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'stripe_customer_id', r.stripe_customer_id,
            'subscribed_at', r.created_at,
            'updated_at', r.updated_at
          )
          order by r.product_slug, r.handle nulls last, r.created_at desc
        )
        from (
          select
            us.user_id,
            p.handle,
            p.display_name,
            u.email,
            us.product_slug,
            sp.display_name as product_display_name,
            us.status,
            us.price_interval,
            us.cancel_at_period_end,
            us.current_period_end,
            us.stripe_subscription_id,
            us.stripe_customer_id,
            us.created_at,
            us.updated_at
          from public.user_subscriptions us
          join public.profiles p on p.user_id = us.user_id
          join auth.users u on u.id = us.user_id
          join public.subscription_products sp on sp.slug = us.product_slug
          where us.status in ('active', 'trialing')
        ) r
      ), '[]'::jsonb),
      'pending_cancel', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'product_slug', r.product_slug,
            'product_display_name', r.product_display_name,
            'status', r.status,
            'price_interval', r.price_interval,
            'cancel_at_period_end', r.cancel_at_period_end,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'subscribed_at', r.created_at
          )
          order by r.current_period_end nulls last, r.product_slug, r.handle nulls last
        )
        from (
          select
            us.user_id,
            p.handle,
            p.display_name,
            u.email,
            us.product_slug,
            sp.display_name as product_display_name,
            us.status,
            us.price_interval,
            us.cancel_at_period_end,
            us.current_period_end,
            us.stripe_subscription_id,
            us.created_at
          from public.user_subscriptions us
          join public.profiles p on p.user_id = us.user_id
          join auth.users u on u.id = us.user_id
          join public.subscription_products sp on sp.slug = us.product_slug
          where us.cancel_at_period_end = true
            and us.status in ('active', 'trialing')
        ) r
      ), '[]'::jsonb),
      'canceled_recent', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'product_slug', r.product_slug,
            'product_display_name', r.product_display_name,
            'status', r.status,
            'price_interval', r.price_interval,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'canceled_at', r.updated_at
          )
          order by r.updated_at desc
        )
        from (
          select
            us.user_id,
            p.handle,
            p.display_name,
            u.email,
            us.product_slug,
            sp.display_name as product_display_name,
            us.status,
            us.price_interval,
            us.current_period_end,
            us.stripe_subscription_id,
            us.updated_at
          from public.user_subscriptions us
          join public.profiles p on p.user_id = us.user_id
          join auth.users u on u.id = us.user_id
          join public.subscription_products sp on sp.slug = us.product_slug
          where us.status in ('canceled', 'unpaid', 'past_due', 'incomplete_expired')
            and us.updated_at >= v_30d
        ) r
      ), '[]'::jsonb),
      'all_rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'product_slug', r.product_slug,
            'product_display_name', r.product_display_name,
            'status', r.status,
            'price_interval', r.price_interval,
            'cancel_at_period_end', r.cancel_at_period_end,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'subscribed_at', r.created_at,
            'updated_at', r.updated_at
          )
          order by r.updated_at desc
        )
        from (
          select
            us.user_id,
            p.handle,
            p.display_name,
            u.email,
            us.product_slug,
            sp.display_name as product_display_name,
            us.status,
            us.price_interval,
            us.cancel_at_period_end,
            us.current_period_end,
            us.stripe_subscription_id,
            us.created_at,
            us.updated_at
          from public.user_subscriptions us
          join public.profiles p on p.user_id = us.user_id
          join auth.users u on u.id = us.user_id
          join public.subscription_products sp on sp.slug = us.product_slug
        ) r
      ), '[]'::jsonb)
    ),
    'creator_fan', jsonb_build_object(
      'monetized_creators', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'creator_user_id', r.user_id,
            'handle', r.handle,
            'display_name', r.display_name,
            'email', r.email,
            'fan_tier_key', r.fan_tier_key,
            'msrp_cents', r.msrp_cents,
            'enabled', r.enabled,
            'connect_onboarding_complete', r.connect_onboarding_complete,
            'stripe_connect_account_id', r.stripe_connect_account_id,
            'active_subscriber_count', r.active_subscriber_count,
            'pending_cancel_count', r.pending_cancel_count,
            'total_subscriber_rows', r.total_subscriber_rows,
            'profile_created_at', r.profile_created_at
          )
          order by r.active_subscriber_count desc, r.handle nulls last
        )
        from (
          select
            cmp.user_id,
            p.handle,
            p.display_name,
            u.email,
            cmp.fan_tier_key,
            tft.msrp_cents,
            cmp.enabled,
            cmp.connect_onboarding_complete,
            cmp.stripe_connect_account_id,
            p.created_at as profile_created_at,
            count(cs.*)::int as total_subscriber_rows,
            count(*) filter (where cs.status in ('active', 'trialing'))::int as active_subscriber_count,
            count(*) filter (
              where cs.cancel_at_period_end = true
                and cs.status in ('active', 'trialing')
            )::int as pending_cancel_count
          from public.creator_monetization_profiles cmp
          join public.profiles p on p.user_id = cmp.user_id
          join auth.users u on u.id = cmp.user_id
          join public.creator_fan_tiers tft on tft.tier_key = cmp.fan_tier_key
          left join public.creator_subscriptions cs on cs.creator_user_id = cmp.user_id
          group by
            cmp.user_id,
            p.handle,
            p.display_name,
            u.email,
            cmp.fan_tier_key,
            tft.msrp_cents,
            cmp.enabled,
            cmp.connect_onboarding_complete,
            cmp.stripe_connect_account_id,
            p.created_at
        ) r
      ), '[]'::jsonb),
      'active_roster', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'subscriber_user_id', r.subscriber_user_id,
            'subscriber_handle', r.subscriber_handle,
            'subscriber_display_name', r.subscriber_display_name,
            'subscriber_email', r.subscriber_email,
            'creator_user_id', r.creator_user_id,
            'creator_handle', r.creator_handle,
            'creator_display_name', r.creator_display_name,
            'fan_tier_key', r.fan_tier_key,
            'msrp_cents', r.msrp_cents,
            'status', r.status,
            'cancel_at_period_end', r.cancel_at_period_end,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'subscribed_at', r.created_at
          )
          order by r.creator_handle nulls last, r.created_at desc
        )
        from (
          select
            cs.subscriber_user_id,
            sp.handle as subscriber_handle,
            sp.display_name as subscriber_display_name,
            su.email as subscriber_email,
            cs.creator_user_id,
            cp.handle as creator_handle,
            cp.display_name as creator_display_name,
            cs.fan_tier_key,
            tft.msrp_cents,
            cs.status,
            cs.cancel_at_period_end,
            cs.current_period_end,
            cs.stripe_subscription_id,
            cs.created_at
          from public.creator_subscriptions cs
          join public.profiles sp on sp.user_id = cs.subscriber_user_id
          join auth.users su on su.id = cs.subscriber_user_id
          join public.profiles cp on cp.user_id = cs.creator_user_id
          left join public.creator_fan_tiers tft on tft.tier_key = cs.fan_tier_key
          where cs.status in ('active', 'trialing')
        ) r
      ), '[]'::jsonb),
      'pending_cancel', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'subscriber_user_id', r.subscriber_user_id,
            'subscriber_handle', r.subscriber_handle,
            'subscriber_display_name', r.subscriber_display_name,
            'subscriber_email', r.subscriber_email,
            'creator_user_id', r.creator_user_id,
            'creator_handle', r.creator_handle,
            'creator_display_name', r.creator_display_name,
            'fan_tier_key', r.fan_tier_key,
            'status', r.status,
            'current_period_end', r.current_period_end,
            'subscribed_at', r.created_at
          )
          order by r.current_period_end nulls last, r.creator_handle nulls last
        )
        from (
          select
            cs.subscriber_user_id,
            sp.handle as subscriber_handle,
            sp.display_name as subscriber_display_name,
            su.email as subscriber_email,
            cs.creator_user_id,
            cp.handle as creator_handle,
            cp.display_name as creator_display_name,
            cs.fan_tier_key,
            cs.status,
            cs.current_period_end,
            cs.created_at
          from public.creator_subscriptions cs
          join public.profiles sp on sp.user_id = cs.subscriber_user_id
          join auth.users su on su.id = cs.subscriber_user_id
          join public.profiles cp on cp.user_id = cs.creator_user_id
          where cs.cancel_at_period_end = true
            and cs.status in ('active', 'trialing')
        ) r
      ), '[]'::jsonb),
      'canceled_recent', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'subscriber_user_id', r.subscriber_user_id,
            'subscriber_handle', r.subscriber_handle,
            'subscriber_display_name', r.subscriber_display_name,
            'subscriber_email', r.subscriber_email,
            'creator_user_id', r.creator_user_id,
            'creator_handle', r.creator_handle,
            'creator_display_name', r.creator_display_name,
            'fan_tier_key', r.fan_tier_key,
            'status', r.status,
            'current_period_end', r.current_period_end,
            'canceled_at', r.updated_at
          )
          order by r.updated_at desc
        )
        from (
          select
            cs.subscriber_user_id,
            sp.handle as subscriber_handle,
            sp.display_name as subscriber_display_name,
            su.email as subscriber_email,
            cs.creator_user_id,
            cp.handle as creator_handle,
            cp.display_name as creator_display_name,
            cs.fan_tier_key,
            cs.status,
            cs.current_period_end,
            cs.updated_at
          from public.creator_subscriptions cs
          join public.profiles sp on sp.user_id = cs.subscriber_user_id
          join auth.users su on su.id = cs.subscriber_user_id
          join public.profiles cp on cp.user_id = cs.creator_user_id
          where cs.status in ('canceled', 'unpaid', 'past_due', 'incomplete_expired')
            and cs.updated_at >= v_30d
        ) r
      ), '[]'::jsonb),
      'all_rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'subscriber_user_id', r.subscriber_user_id,
            'subscriber_handle', r.subscriber_handle,
            'subscriber_display_name', r.subscriber_display_name,
            'subscriber_email', r.subscriber_email,
            'creator_user_id', r.creator_user_id,
            'creator_handle', r.creator_handle,
            'creator_display_name', r.creator_display_name,
            'fan_tier_key', r.fan_tier_key,
            'msrp_cents', r.msrp_cents,
            'status', r.status,
            'cancel_at_period_end', r.cancel_at_period_end,
            'current_period_end', r.current_period_end,
            'stripe_subscription_id', r.stripe_subscription_id,
            'subscribed_at', r.created_at,
            'updated_at', r.updated_at
          )
          order by r.updated_at desc
        )
        from (
          select
            cs.subscriber_user_id,
            sp.handle as subscriber_handle,
            sp.display_name as subscriber_display_name,
            su.email as subscriber_email,
            cs.creator_user_id,
            cp.handle as creator_handle,
            cp.display_name as creator_display_name,
            cs.fan_tier_key,
            tft.msrp_cents,
            cs.status,
            cs.cancel_at_period_end,
            cs.current_period_end,
            cs.stripe_subscription_id,
            cs.created_at,
            cs.updated_at
          from public.creator_subscriptions cs
          join public.profiles sp on sp.user_id = cs.subscriber_user_id
          join auth.users su on su.id = cs.subscriber_user_id
          join public.profiles cp on cp.user_id = cs.creator_user_id
          left join public.creator_fan_tiers tft on tft.tier_key = cs.fan_tier_key
        ) r
      ), '[]'::jsonb)
    )
  );

  return v_body;
end;
$$;

revoke all on function public.admin_ops_subscriber_roster() from public;
grant execute on function public.admin_ops_subscriber_roster() to authenticated;

comment on function public.admin_ops_subscriber_roster() is
  'Admin-only Edge Monitor subscriber roster: platform + creator fan subs, emails, pending cancels.';
