-- Edge Monitor billing drift v2: drop noisy stripe_customer_no_sub (orphan customer id).
-- Keep and extend rules that catch real paid-but-no-access / entitlement drift.

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

create or replace function public.admin_ops_system_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drift jsonb;
  v_jobs jsonb;
  v_gaps jsonb := '[
    {"id":"send_due_offer_reminders","label":"Offer push reminders","schedule_hint":"Edge fn exists · no pg_cron in repo","runbook_id":"prod-checklist","critical":true},
    {"id":"poker_catalog_sync_production","label":"Poker catalog sync","schedule_hint":"GitHub Actions only — add heartbeat in v2","runbook_id":"prod-checklist","critical":false}
  ]'::jsonb;
  v_drift_critical int;
  v_drift_warn int;
  v_drift_count int;
  v_jobs_ok int;
  v_jobs_issue int;
  v_jobs_total int;
  v_overall text := 'ok';
begin
  v_drift := public.admin_ops_billing_drift_snapshot();
  v_jobs := public.admin_ops_scheduled_jobs_snapshot();

  v_drift_count := coalesce((v_drift->>'drift_cases')::int, 0);
  v_drift_critical := coalesce((v_drift->>'drift_critical')::int, 0);
  v_drift_warn := coalesce((v_drift->>'drift_warn')::int, 0);
  v_jobs_ok := coalesce((v_jobs->>'jobs_ok')::int, 0);
  v_jobs_issue := coalesce((v_jobs->>'jobs_issue')::int, 0);
  v_jobs_total := coalesce((v_jobs->>'jobs_total')::int, 0);

  if v_drift_critical > 0 then
    v_overall := 'critical';
  elsif v_drift_warn > 0 or v_jobs_issue > 0 then
    v_overall := 'warn';
  else
    v_overall := 'ok';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'overall', v_overall,
      'jobs_ok', v_jobs_ok,
      'jobs_issue', v_jobs_issue,
      'drift_cases', v_drift_count,
      'drift_critical', v_drift_critical,
      'drift_warn', v_drift_warn,
      'jobs_total', v_jobs_total
    ),
    'scheduled_jobs', v_jobs->'scheduled_jobs',
    'billing_drift', v_drift->'billing_drift',
    'known_gaps', v_gaps
  );
end;
$$;

comment on function public.admin_ops_billing_drift_snapshot() is
  'Admin Edge Monitor: entitlement drift (incomplete stuck, profile flag mismatch, past_due lockout, fan incomplete). Drops orphan stripe_customer_id-only noise.';
