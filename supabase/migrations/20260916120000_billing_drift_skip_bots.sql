-- Edge Monitor: do not page billing drift for Lounge bots.
-- Bots can have admin-comp edge-pro / lifetime so the paid flag is true
-- without a slots-edge Stripe row. That is not a customer lockout.

create or replace function public.admin_ops_billing_drift_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_drift jsonb;
  v_drift_critical int;
  v_drift_warn int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  with drift_rows as (
    -- Stripe checkout completed but row stuck incomplete; app still Free.
    select
      'platform_incomplete_stuck'::text as case_code,
      'critical'::text as severity,
      p.user_id,
      p.handle,
      p.display_name,
      us.product_slug,
      us.status as db_status,
      p.has_active_subscription,
      us.stripe_customer_id,
      us.stripe_subscription_id,
      us.updated_at as stuck_since,
      format(
        '%s (@%s) subscribed but stuck on %s — app shows %s',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle'),
        us.status,
        case when coalesce(p.has_active_subscription, false) then 'paid access' else 'Free' end
      ) as message,
      'Run platform billing reconcile or set status active then sync_profile_has_active_subscription.'::text as suggested_action
    from public.user_subscriptions us
    join public.profiles p on p.user_id = us.user_id
    where us.status = 'incomplete'
      and us.stripe_subscription_id is not null
      and us.updated_at < v_now - interval '15 minutes'
      and coalesce(p.is_bot, false) = false

    union all

    -- Active platform sub in DB but legacy profile flag still Free.
    select
      'platform_active_profile_free',
      'critical',
      p.user_id,
      p.handle,
      p.display_name,
      us.product_slug,
      us.status,
      p.has_active_subscription,
      us.stripe_customer_id,
      us.stripe_subscription_id,
      us.updated_at,
      format(
        '%s (@%s) has active %s in DB but profile flag is Free',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle'),
        us.product_slug
      ),
      'select public.sync_profile_has_active_subscription(user_id);'
    from public.user_subscriptions us
    join public.profiles p on p.user_id = us.user_id
    where us.status in ('active', 'trialing')
      and us.product_slug in ('slots-edge', 'slots-edge-lifetime')
      and coalesce(p.has_active_subscription, false) = false
      and coalesce(p.is_bot, false) = false

    union all

    -- Profile flag says paid but no active/trialing platform entitlement row.
    select
      'platform_profile_paid_no_sub',
      'critical',
      p.user_id,
      p.handle,
      p.display_name,
      null,
      null,
      p.has_active_subscription,
      p.stripe_customer_id,
      null,
      p.updated_at,
      format(
        '%s (@%s) profile shows paid access but no active slots-edge row in DB',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle')
      ),
      'select public.sync_profile_has_active_subscription(user_id); or restore row from Stripe reconcile.'
    from public.profiles p
    where coalesce(p.has_active_subscription, false) = true
      and coalesce(p.is_bot, false) = false
      and not exists (
        select 1
        from public.user_subscriptions us
        where us.user_id = p.user_id
          and us.product_slug in ('slots-edge', 'slots-edge-lifetime')
          and us.status in ('active', 'trialing')
      )

    union all

    -- Payment failed / lapsed; user locked out while Stripe may still be retrying.
    select
      'platform_past_due_no_access',
      'warn',
      p.user_id,
      p.handle,
      p.display_name,
      us.product_slug,
      us.status,
      p.has_active_subscription,
      us.stripe_customer_id,
      us.stripe_subscription_id,
      us.updated_at,
      format(
        '%s (@%s) platform sub past_due — app shows Free (Stripe may still be retrying)',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle')
      ),
      'Check Stripe subscription; customer may need to update payment method.'
    from public.user_subscriptions us
    join public.profiles p on p.user_id = us.user_id
    where us.status = 'past_due'
      and us.product_slug in ('slots-edge', 'slots-edge-lifetime')
      and us.stripe_subscription_id is not null
      and coalesce(p.has_active_subscription, false) = false
      and coalesce(p.is_bot, false) = false

    union all

    -- Creator fan checkout stuck incomplete.
    select
      'fan_incomplete_stuck',
      'critical',
      p.user_id,
      p.handle,
      p.display_name,
      cs.fan_tier_key,
      cs.status,
      null,
      cs.stripe_customer_id,
      cs.stripe_subscription_id,
      cs.updated_at,
      format(
        '%s (@%s) fan sub stuck on %s for creator tier %s',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle'),
        cs.status,
        coalesce(cs.fan_tier_key, 'unknown')
      ),
      'Run creator-fan-reconcile-stripe or fix row from Stripe.'
    from public.creator_subscriptions cs
    join public.profiles p on p.user_id = cs.subscriber_user_id
    where cs.status = 'incomplete'
      and cs.stripe_subscription_id is not null
      and cs.updated_at < v_now - interval '15 minutes'
      and coalesce(p.is_bot, false) = false
  )
  select coalesce(jsonb_agg(to_jsonb(d) order by d.severity desc, d.stuck_since asc nulls last), '[]'::jsonb)
  into v_drift
  from drift_rows d;

  select
    coalesce(count(*) filter (where elem->>'severity' = 'critical'), 0)::int,
    coalesce(count(*) filter (where elem->>'severity' = 'warn'), 0)::int
  into v_drift_critical, v_drift_warn
  from jsonb_array_elements(v_drift) elem;

  return jsonb_build_object(
    'generated_at', v_now,
    'billing_drift', v_drift,
    'drift_cases', jsonb_array_length(v_drift),
    'drift_critical', v_drift_critical,
    'drift_warn', v_drift_warn
  );
end;
$$;

comment on function public.admin_ops_billing_drift_snapshot() is
  'Admin Edge Monitor: entitlement drift (incomplete stuck, profile flag mismatch, past_due lockout, fan incomplete). Skips lounge bots. Drops orphan stripe_customer_id-only noise.';
