-- System health perf v2: split billing drift (fast) from cron jobs (per-job lookback).
-- Avoids timeout from scanning cron.job_run_details for lounge_activity_push_flush (every 10s).

create or replace function public.admin_ops_billing_drift_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_drift jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  with drift_rows as (
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
      'Run reconcile or set status active then sync_profile_has_active_subscription.'::text as suggested_action
    from public.user_subscriptions us
    join public.profiles p on p.user_id = us.user_id
    where us.status = 'incomplete'
      and us.stripe_subscription_id is not null
      and us.updated_at < v_now - interval '15 minutes'

    union all

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

    select
      'platform_stripe_customer_no_sub',
      'warn',
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
        '%s (@%s) has Stripe customer %s but no platform subscription row',
        coalesce(nullif(btrim(p.display_name), ''), coalesce(p.handle, 'Unknown user')),
        coalesce(p.handle, 'no-handle'),
        p.stripe_customer_id
      ),
      'Check Stripe customer for active sub; run platform billing reconcile.'
    from public.profiles p
    where p.stripe_customer_id is not null
      and p.updated_at >= v_now - interval '14 days'
      and not exists (
        select 1 from public.user_subscriptions us where us.user_id = p.user_id
      )

    union all

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

  return jsonb_build_object(
    'generated_at', v_now,
    'billing_drift', v_drift,
    'drift_cases', jsonb_array_length(v_drift)
  );
end;
$$;

create or replace function public.admin_ops_scheduled_jobs_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_jobs jsonb;
  v_jobs_ok int;
  v_jobs_issue int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  perform set_config('statement_timeout', '8000', true);

  with registry as (
    select *
    from jsonb_to_recordset(
      '[
        {"id":"lounge_activity_push_flush","jobname":"lounge_activity_push_flush","label":"Activity push flush","category":"push","schedule_hint":"Every 10s","max_stale_minutes":3,"critical":false,"runbook_id":"prod-checklist"},
        {"id":"lounge_bot_publish_scheduled_odds","jobname":"lounge_bot_publish_scheduled_odds","label":"Bot scheduled publish drain","category":"bots","schedule_hint":"Every 1 min","max_stale_minutes":5,"critical":true,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_news_poll_market_edge","jobname":"lounge_news_poll_market_edge","label":"Market Edge news poll","category":"bots","schedule_hint":"Every 3 min","max_stale_minutes":10,"critical":false,"runbook_id":"lounge-bot-market-news"},
        {"id":"lounge_odds_poll_edges","jobname":"lounge_odds_poll_edges","label":"Scott odds +EV poll","category":"bots","schedule_hint":"Every 15 min","max_stale_minutes":30,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_daily_slates","jobname":"lounge_odds_poll_daily_slates","label":"Coffee & Covers daily slates","category":"bots","schedule_hint":"Every 5 min · 13-14 UTC (6-8am PT)","max_stale_minutes":1440,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_live","jobname":"lounge_odds_poll_live","label":"Scott live odds rundown","category":"bots","schedule_hint":"Every 5 min · game hours UTC","max_stale_minutes":30,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_best_bet_hour","jobname":"lounge_odds_poll_best_bet_hour","label":"Best Bet of the Hour","category":"bots","schedule_hint":"Minute 5 every hour","max_stale_minutes":90,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_value_bet_radar","jobname":"lounge_odds_poll_value_bet_radar","label":"Value Bet Radar","category":"bots","schedule_hint":"Minutes 5 and 35 every hour","max_stale_minutes":45,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_x_ingest_editorial","jobname":"lounge_x_ingest_editorial","label":"X editorial ingest","category":"bots","schedule_hint":"Every 8 hours","max_stale_minutes":540,"critical":false,"runbook_id":"lounge-bot-editorial-queue"},
        {"id":"platform_billing_reconcile_hourly","jobname":"platform_billing_reconcile_hourly","label":"Platform billing reconcile","category":"billing","schedule_hint":"Hourly at :15 UTC","max_stale_minutes":130,"critical":true,"runbook_id":"billing-drift"},
        {"id":"creator_fan_reconcile_stripe_daily","jobname":"creator_fan_reconcile_stripe_daily","label":"Creator fan billing reconcile","category":"billing","schedule_hint":"Daily 08:30 UTC","max_stale_minutes":2160,"critical":true,"runbook_id":"stripe-handoff"},
        {"id":"starter_weekly_guide_drop_weekly","jobname":"starter_weekly_guide_drop_weekly","label":"Starter weekly guide drop","category":"ops","schedule_hint":"Mon 00:10 UTC","max_stale_minutes":11520,"critical":false,"runbook_id":"starter-drops"},
        {"id":"lounge_cf_stream_purge_pending_daily","jobname":"lounge_cf_stream_purge_pending_daily","label":"CF Stream pending purge","category":"ops","schedule_hint":"Daily 07:15 UTC","max_stale_minutes":2160,"critical":false,"runbook_id":"stream-purge"},
        {"id":"lounge_market_symbol_sync_daily","jobname":"lounge_market_symbol_sync_daily","label":"Market symbol bulk sync","category":"ops","schedule_hint":"Intentionally disabled","max_stale_minutes":999999,"critical":false,"runbook_id":"prod-checklist","force_disabled":true},
        {"id":"poker_catalog_sync_production","jobname":null,"label":"Poker catalog sync","category":"catalog","kind":"external","schedule_hint":"GitHub Actions · every 3 days · 06:00 UTC","runbook_id":"prod-checklist"},
        {"id":"send_due_offer_reminders","jobname":null,"label":"Offer push reminders","category":"offers","kind":"unscheduled","schedule_hint":"Edge fn exists · no pg_cron in repo","runbook_id":"prod-checklist","critical":true}
      ]'::jsonb
    ) as r(
      id text, jobname text, label text, category text, schedule_hint text,
      max_stale_minutes int, critical boolean, runbook_id text, kind text, force_disabled boolean
    )
  ),
  job_rows as (
    select
      r.id, r.jobname, r.label, r.category, r.schedule_hint, r.max_stale_minutes,
      coalesce(r.critical, false) as critical, r.runbook_id,
      coalesce(r.kind, 'pg_cron') as kind,
      coalesce(r.force_disabled, false) as force_disabled,
      j.jobid, coalesce(j.active, false) as cron_active, j.schedule as cron_schedule,
      lr.last_status, lr.last_start, lr.last_end, lr.return_message,
      case
        when coalesce(r.kind, 'pg_cron') = 'external' then 'external'
        when coalesce(r.kind, 'pg_cron') = 'unscheduled' then 'unscheduled'
        when coalesce(r.force_disabled, false) then 'disabled'
        when j.jobid is null or not coalesce(j.active, false) then 'disabled'
        when lr.last_status = 'failed' then 'failed'
        when lr.last_start is null then 'stale'
        when lr.last_start < v_now - make_interval(mins => greatest(r.max_stale_minutes, 1)) then 'stale'
        else 'ok'
      end as health,
      case
        when coalesce(r.kind, 'pg_cron') = 'external' then 'Runs on GitHub Actions — check Actions tab for last run.'
        when coalesce(r.kind, 'pg_cron') = 'unscheduled' then 'Not scheduled in Supabase — offer reminders only run from Offers UI today.'
        when coalesce(r.force_disabled, false) then 'Intentionally unscheduled (on-demand backfill only).'
        when j.jobid is null or not coalesce(j.active, false) then 'pg_cron job missing or inactive.'
        when lr.last_status = 'failed' then coalesce(nullif(lr.return_message, ''), 'Last pg_cron run failed.')
        when lr.last_start is null then 'No pg_cron run recorded yet.'
        when lr.last_start < v_now - make_interval(mins => greatest(r.max_stale_minutes, 1))
          then format('Last run %s ago (threshold %s min).', to_char(v_now - lr.last_start, 'FMHH24"h "FMMI"m" ago"'), r.max_stale_minutes)
        else null
      end as hint
    from registry r
    left join cron.job j on j.jobname = r.jobname
    left join lateral (
      select d.status as last_status, d.start_time as last_start, d.end_time as last_end,
        left(coalesce(d.return_message, ''), 500) as return_message
      from cron.job_run_details d
      where d.jobid = j.jobid
        and d.start_time >= v_now - make_interval(mins => least(greatest(r.max_stale_minutes + 30, 15), 2880))
      order by d.start_time desc
      limit 1
    ) lr on j.jobid is not null
  )
  select
    coalesce(jsonb_agg(to_jsonb(jr) order by jr.category, jr.label), '[]'::jsonb),
    coalesce(count(*) filter (where jr.health = 'ok'), 0)::int,
    coalesce(count(*) filter (where jr.health in ('failed', 'stale') or (jr.critical and jr.health not in ('ok', 'disabled', 'external'))), 0)::int
  into v_jobs, v_jobs_ok, v_jobs_issue
  from job_rows jr;

  return jsonb_build_object(
    'generated_at', v_now,
    'scheduled_jobs', v_jobs,
    'jobs_ok', v_jobs_ok,
    'jobs_issue', v_jobs_issue,
    'jobs_total', jsonb_array_length(v_jobs)
  );
end;
$$;

-- Legacy combined RPC: merge drift + jobs (client prefers parallel split).
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
  v_drift_count int;
  v_jobs_ok int;
  v_jobs_issue int;
  v_jobs_total int;
  v_overall text := 'ok';
begin
  v_drift := public.admin_ops_billing_drift_snapshot();
  v_jobs := public.admin_ops_scheduled_jobs_snapshot();

  v_drift_count := coalesce((v_drift->>'drift_cases')::int, 0);
  v_jobs_ok := coalesce((v_jobs->>'jobs_ok')::int, 0);
  v_jobs_issue := coalesce((v_jobs->>'jobs_issue')::int, 0);
  v_jobs_total := coalesce((v_jobs->>'jobs_total')::int, 0);

  if v_drift_count > 0 then
    v_overall := 'critical';
  elsif v_jobs_issue > 0 then
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
      'jobs_total', v_jobs_total
    ),
    'scheduled_jobs', v_jobs->'scheduled_jobs',
    'billing_drift', v_drift->'billing_drift',
    'known_gaps', v_gaps
  );
end;
$$;

revoke all on function public.admin_ops_billing_drift_snapshot() from public;
grant execute on function public.admin_ops_billing_drift_snapshot() to authenticated;
revoke all on function public.admin_ops_scheduled_jobs_snapshot() from public;
grant execute on function public.admin_ops_scheduled_jobs_snapshot() to authenticated;

comment on function public.admin_ops_billing_drift_snapshot() is
  'Admin Edge Monitor: users paid but stuck (incomplete, profile flag drift, etc.).';
comment on function public.admin_ops_scheduled_jobs_snapshot() is
  'Admin Edge Monitor: pg_cron registry health with per-job run_details lookback window.';
