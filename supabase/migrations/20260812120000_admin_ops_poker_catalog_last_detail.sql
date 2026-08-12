-- Edge Monitor: expose poker catalog heartbeat last_detail (upsert / MTTDB counts)
-- and mark external jobs failed when last_status = failed.

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
  v_health text;
  v_hint text;
  v_last_start timestamptz;
  v_push_recent timestamptz;
  v_push_overdue int := 0;
  v_push_oldest_overdue timestamptz;
  v_bot_publish_recent timestamptz;
  v_ops_job_id text;
  v_ops_job_success timestamptz;
  v_ops_job_failure timestamptz;
  v_ops_job_status text;
  v_ops_job_detail jsonb;
  v_poker_catalog jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select max(b.sent_at)
  into v_push_recent
  from public.activity_push_batches b
  where b.sent_at >= v_now - interval '15 minutes';

  select count(*)::int, min(b.scheduled_send_at)
  into v_push_overdue, v_push_oldest_overdue
  from public.activity_push_batches b
  where b.sent_at is null
    and b.scheduled_send_at < v_now - interval '2 minutes';

  select max(l.created_at)
  into v_bot_publish_recent
  from public.lounge_bot_publish_log l
  where l.created_at >= v_now - interval '15 minutes'
    and l.status = 'published';

  for r in
    select *
    from jsonb_to_recordset(
      '[
        {"id":"lounge_activity_push_flush","jobname":"lounge_activity_push_flush","label":"Activity push flush","category":"push","schedule_hint":"Every 10s · stale if overdue batches","max_stale_minutes":3,"critical":false,"runbook_id":"prod-checklist","heartbeat":"push_batches"},
        {"id":"lounge_bot_publish_scheduled_odds","jobname":"lounge_bot_publish_scheduled_odds","label":"Bot scheduled publish drain","category":"bots","schedule_hint":"Every 1 min","max_stale_minutes":5,"critical":true,"runbook_id":"lounge-bot-sports-odds","heartbeat":"bot_publish_log"},
        {"id":"lounge_news_poll_market_edge","jobname":"lounge_news_poll_market_edge","label":"Market Edge news poll","category":"bots","schedule_hint":"Every 3 min","max_stale_minutes":10,"critical":false,"runbook_id":"lounge-bot-market-news"},
        {"id":"lounge_odds_poll_edges","jobname":"lounge_odds_poll_edges","label":"Scott odds +EV poll","category":"bots","schedule_hint":"Every 15 min","max_stale_minutes":30,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_daily_slates","jobname":"lounge_odds_poll_daily_slates","label":"Coffee & Covers daily slates","category":"bots","schedule_hint":"Every 5 min · 13-14 UTC (6-8am PT)","max_stale_minutes":1440,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_live","jobname":"lounge_odds_poll_live","label":"Scott live odds rundown","category":"bots","schedule_hint":"Every 5 min · game hours UTC","max_stale_minutes":30,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_best_bet_hour","jobname":"lounge_odds_poll_best_bet_hour","label":"Best Bet of the Hour","category":"bots","schedule_hint":"Minute 5 every hour","max_stale_minutes":90,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_odds_poll_value_bet_radar","jobname":"lounge_odds_poll_value_bet_radar","label":"Value Bet Radar","category":"bots","schedule_hint":"Minutes 5 and 35 every hour","max_stale_minutes":45,"critical":false,"runbook_id":"lounge-bot-sports-odds"},
        {"id":"lounge_x_ingest_editorial","jobname":"lounge_x_ingest_editorial","label":"X editorial ingest","category":"bots","schedule_hint":"Every 8 hours","max_stale_minutes":540,"critical":false,"runbook_id":"lounge-bot-editorial-queue"},
        {"id":"platform_billing_reconcile_hourly","jobname":"platform_billing_reconcile_hourly","label":"Platform billing reconcile","category":"billing","schedule_hint":"Hourly at :15 UTC","max_stale_minutes":130,"critical":true,"runbook_id":"billing-drift"},
        {"id":"creator_fan_reconcile_stripe_daily","jobname":"creator_fan_reconcile_stripe_daily","label":"Creator fan billing reconcile","category":"billing","schedule_hint":"Daily 08:30 UTC","max_stale_minutes":2160,"critical":true,"runbook_id":"stripe-handoff"},
        {"id":"send_due_offer_reminders","jobname":"send_due_offer_reminders_minute","label":"Offer push reminders","category":"offers","schedule_hint":"Every 1 min · lookahead 1m","max_stale_minutes":5,"critical":true,"runbook_id":"prod-checklist"},
        {"id":"starter_weekly_guide_drop_weekly","jobname":"starter_weekly_guide_drop_weekly","label":"Starter weekly guide drop","category":"ops","schedule_hint":"Mon 00:10 UTC","max_stale_minutes":11520,"critical":false,"runbook_id":"starter-drops"},
        {"id":"lounge_cf_stream_purge_pending_daily","jobname":"lounge_cf_stream_purge_pending_daily","label":"CF Stream pending purge","category":"ops","schedule_hint":"Daily 07:15 UTC","max_stale_minutes":2160,"critical":false,"runbook_id":"stream-purge"},
        {"id":"poker_catalog_sync_production","jobname":null,"label":"Poker catalog sync","category":"catalog","kind":"external","schedule_hint":"GitHub Actions · every 3 days · 06:00 UTC","max_stale_minutes":5760,"critical":false,"runbook_id":"poker-catalog-sync","heartbeat":"ops_job:poker_catalog_sync_production"}
      ]'::jsonb
    ) as x(
      id text, jobname text, label text, category text, schedule_hint text,
      max_stale_minutes int, critical boolean, runbook_id text, kind text,
      force_disabled boolean, heartbeat text
    )
  loop
    v_jobid := null;
    v_cron_active := false;
    v_cron_schedule := null;
    v_last_start := null;
    v_health := 'ok';
    v_hint := null;
    v_ops_job_id := null;
    v_ops_job_success := null;
    v_ops_job_failure := null;
    v_ops_job_status := null;
    v_ops_job_detail := null;

    if coalesce(r.kind, 'pg_cron') = 'external' then
      if coalesce(r.heartbeat, '') like 'ops_job:%' then
        v_ops_job_id := substring(r.heartbeat from 9);
        select h.last_success_at, h.last_failure_at, h.last_status, h.last_detail
        into v_ops_job_success, v_ops_job_failure, v_ops_job_status, v_ops_job_detail
        from public.admin_ops_job_heartbeats h
        where h.job_id = v_ops_job_id;

        v_last_start := coalesce(v_ops_job_failure, v_ops_job_success);
        if v_ops_job_status = 'failed' then
          v_health := 'failed';
          v_last_start := coalesce(v_ops_job_failure, v_ops_job_success);
          v_hint := coalesce(
            nullif(btrim(v_ops_job_detail->>'message'), ''),
            'Last GitHub Actions sync failed.'
          );
        elsif v_ops_job_success is null then
          v_health := 'stale';
          v_hint := 'No successful GitHub Actions sync recorded — run workflow manually or wait for schedule.';
        elsif v_ops_job_success < v_now - make_interval(mins => greatest(coalesce(r.max_stale_minutes, 5760), 60)) then
          v_health := 'stale';
          v_hint := format(
            'Last success %s UTC — expected every ~3 days.',
            to_char(v_ops_job_success at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          );
        else
          v_health := 'ok';
          v_last_start := v_ops_job_success;
          v_hint := format(
            'Last GitHub Actions sync %s ago.',
            to_char(v_now - v_ops_job_success, 'FMDD"d "HH24"h "FMMI"m" ago"')
          );
        end if;

        if v_ops_job_detail is not null then
          if coalesce(v_ops_job_detail->'upsert'->>'upserted', v_ops_job_detail->>'rows') is not null then
            v_hint := v_hint || format(
              ' Upserted %s.',
              coalesce(v_ops_job_detail->'upsert'->>'upserted', v_ops_job_detail->>'rows')
            );
          end if;
          if v_ops_job_detail ? 'mttdbOnlineRows' or v_ops_job_detail ? 'mttdbLiveRows' then
            v_hint := v_hint || format(
              ' MTTDB online %s · live %s.',
              coalesce(v_ops_job_detail->>'mttdbOnlineRows', '0'),
              coalesce(v_ops_job_detail->>'mttdbLiveRows', '0')
            );
          end if;
        end if;

        if r.id = 'poker_catalog_sync_production' then
          v_poker_catalog := jsonb_build_object(
            'job_id', v_ops_job_id,
            'health', v_health,
            'last_status', v_ops_job_status,
            'last_success_at', v_ops_job_success,
            'last_failure_at', v_ops_job_failure,
            'last_start', v_last_start,
            'hint', v_hint,
            'rows', nullif(v_ops_job_detail->>'rows', '')::int,
            'upserted', nullif(coalesce(v_ops_job_detail->'upsert'->>'upserted', v_ops_job_detail->>'rows'), '')::int,
            'pruned', nullif(v_ops_job_detail->'upsert'->>'pruned', '')::int,
            'skipped', nullif(v_ops_job_detail->'upsert'->>'skipped', '')::int,
            'mttdb_online', nullif(v_ops_job_detail->>'mttdbOnlineRows', '')::int,
            'mttdb_live', nullif(v_ops_job_detail->>'mttdbLiveRows', '')::int,
            'detail', v_ops_job_detail
          );
        end if;
      else
        v_health := 'external';
        v_hint := 'Runs on GitHub Actions — check Actions tab for last run.';
      end if;
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
        v_hint := 'pg_cron job missing or inactive — apply migration or unschedule in SQL.';
      else
        v_health := 'ok';
        v_hint := 'Scheduled and active (cron.job). Last run not queried — see Supabase cron logs if needed.';

        if r.heartbeat = 'push_batches' then
          v_last_start := v_push_recent;
          if v_push_overdue > 0 then
            v_health := 'stale';
            v_hint := format(
              '%s like/bookmark batch(es) overdue >2 min — flush cron or Edge push may be stuck. Oldest due %s.',
              v_push_overdue,
              coalesce(to_char(v_push_oldest_overdue, 'YYYY-MM-DD HH24:MI:SS'), '?')
            );
          elsif v_push_recent is not null then
            v_hint := format(
              'Cron active; no overdue batches. Last batch sent %s ago.',
              to_char(v_now - v_push_recent, 'FMMI"m "SS"s" ago"')
            );
          else
            v_hint := 'Cron active; no overdue batches (quiet traffic is OK — DMs/comments use immediate push).';
          end if;
        elsif r.heartbeat = 'bot_publish_log' then
          v_last_start := v_bot_publish_recent;
          if v_bot_publish_recent is null then
            v_hint := 'Cron active; no bot publishes in last 15 min (may be normal if queue empty).';
          else
            v_hint := format('Last bot publish %s ago.', to_char(v_now - v_bot_publish_recent, 'FMMI"m "SS"s" ago"'));
          end if;
        end if;
      end if;
    end if;

    if v_health in ('ok', 'external') then
      v_jobs_ok := v_jobs_ok + 1;
    else
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
        'cron_active', v_cron_active,
        'cron_schedule', v_cron_schedule,
        'last_start', v_last_start,
        'health', v_health,
        'hint', v_hint,
        'last_status', v_ops_job_status,
        'last_detail', v_ops_job_detail
      )
    );
  end loop;

  return jsonb_build_object(
    'generated_at', v_now,
    'scheduled_jobs', v_jobs,
    'jobs_ok', v_jobs_ok,
    'jobs_issue', v_jobs_issue,
    'jobs_total', jsonb_array_length(v_jobs),
    'poker_catalog', v_poker_catalog
  );
end;
$$;

comment on function public.admin_ops_scheduled_jobs_snapshot() is
  'Admin Edge Monitor: pg_cron + external heartbeats; poker_catalog last-run upsert/MTTDB counts.';
