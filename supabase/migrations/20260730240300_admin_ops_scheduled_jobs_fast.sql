-- System health perf v3: high-frequency crons use EXISTS (recent success), not full run scan.

create or replace function public.admin_ops_scheduled_jobs_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_jobs jsonb := '[]'::jsonb;
  v_jobs_ok int := 0;
  v_jobs_issue int := 0;
  r record;
  v_jobid bigint;
  v_cron_active boolean;
  v_cron_schedule text;
  v_last_status text;
  v_last_start timestamptz;
  v_last_end timestamptz;
  v_return_message text;
  v_health text;
  v_hint text;
  v_lookback_min int;
  v_recent_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  perform set_config('statement_timeout', '12000', true);

  for r in
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
    ) as x(
      id text, jobname text, label text, category text, schedule_hint text,
      max_stale_minutes int, critical boolean, runbook_id text, kind text, force_disabled boolean
    )
  loop
    v_jobid := null;
    v_cron_active := false;
    v_cron_schedule := null;
    v_last_status := null;
    v_last_start := null;
    v_last_end := null;
    v_return_message := null;
    v_health := 'ok';
    v_hint := null;
    v_recent_ok := false;

    if coalesce(r.kind, 'pg_cron') = 'external' then
      v_health := 'external';
      v_hint := 'Runs on GitHub Actions — check Actions tab for last run.';
    elsif coalesce(r.kind, 'pg_cron') = 'unscheduled' then
      v_health := 'unscheduled';
      v_hint := 'Not scheduled in Supabase — offer reminders only run from Offers UI today.';
    elsif coalesce(r.force_disabled, false) then
      v_health := 'disabled';
      v_hint := 'Intentionally unscheduled (on-demand backfill only).';
    else
      select j.jobid, coalesce(j.active, false), j.schedule
      into v_jobid, v_cron_active, v_cron_schedule
      from cron.job j
      where j.jobname = r.jobname
      limit 1;

      if v_jobid is null or not v_cron_active then
        v_health := 'disabled';
        v_hint := 'pg_cron job missing or inactive.';
      else
        v_lookback_min := least(greatest(coalesce(r.max_stale_minutes, 60) + 30, 15), 2880);

        if coalesce(r.max_stale_minutes, 60) <= 15 then
          select exists (
            select 1
            from cron.job_run_details d
            where d.jobid = v_jobid
              and d.start_time >= v_now - make_interval(mins => v_lookback_min)
              and d.status = 'succeeded'
          )
          into v_recent_ok;

          select d.status, d.start_time, d.end_time, left(coalesce(d.return_message, ''), 500)
          into v_last_status, v_last_start, v_last_end, v_return_message
          from cron.job_run_details d
          where d.jobid = v_jobid
            and d.start_time >= v_now - make_interval(mins => v_lookback_min)
          order by d.start_time desc
          limit 1;

          if v_recent_ok then
            v_health := 'ok';
          elsif v_last_status = 'failed' then
            v_health := 'failed';
            v_hint := coalesce(nullif(v_return_message, ''), 'Last pg_cron run failed.');
          else
            v_health := 'stale';
            v_hint := format('No successful run in last %s min.', v_lookback_min);
          end if;
        else
          select d.status, d.start_time, d.end_time, left(coalesce(d.return_message, ''), 500)
          into v_last_status, v_last_start, v_last_end, v_return_message
          from cron.job_run_details d
          where d.jobid = v_jobid
            and d.start_time >= v_now - make_interval(mins => v_lookback_min)
          order by d.start_time desc
          limit 1;

          if v_last_status = 'failed' then
            v_health := 'failed';
            v_hint := coalesce(nullif(v_return_message, ''), 'Last pg_cron run failed.');
          elsif v_last_start is null then
            v_health := 'stale';
            v_hint := 'No pg_cron run recorded in lookback window.';
          elsif v_last_start < v_now - make_interval(mins => greatest(coalesce(r.max_stale_minutes, 60), 1)) then
            v_health := 'stale';
            v_hint := format(
              'Last run %s ago (threshold %s min).',
              to_char(v_now - v_last_start, 'FMHH24"h "FMMI"m" ago"'),
              r.max_stale_minutes
            );
          else
            v_health := 'ok';
          end if;
        end if;
      end if;
    end if;

    if v_health = 'ok' then
      v_jobs_ok := v_jobs_ok + 1;
    elsif v_health in ('failed', 'stale') or (coalesce(r.critical, false) and v_health not in ('ok', 'disabled', 'external')) then
      v_jobs_issue := v_jobs_issue + 1;
    end if;

    v_jobs := v_jobs || jsonb_build_array(
      jsonb_build_object(
        'id', r.id,
        'jobname', r.jobname,
        'label', r.label,
        'category', r.category,
        'schedule_hint', r.schedule_hint,
        'max_stale_minutes', r.max_stale_minutes,
        'critical', coalesce(r.critical, false),
        'runbook_id', r.runbook_id,
        'kind', coalesce(r.kind, 'pg_cron'),
        'force_disabled', coalesce(r.force_disabled, false),
        'jobid', v_jobid,
        'cron_active', v_cron_active,
        'cron_schedule', v_cron_schedule,
        'last_status', v_last_status,
        'last_start', v_last_start,
        'last_end', v_last_end,
        'return_message', v_return_message,
        'health', v_health,
        'hint', v_hint
      )
    );
  end loop;

  return jsonb_build_object(
    'generated_at', v_now,
    'scheduled_jobs', v_jobs,
    'jobs_ok', v_jobs_ok,
    'jobs_issue', v_jobs_issue,
    'jobs_total', jsonb_array_length(v_jobs)
  );
end;
$$;

comment on function public.admin_ops_scheduled_jobs_snapshot() is
  'Admin Edge Monitor: pg_cron health. High-frequency jobs use short EXISTS lookback; loop avoids full table scan.';
