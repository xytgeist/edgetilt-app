-- Offer push reminders: pg_cron every minute → send-due-offer-reminders Edge fn.
-- Reuses Vault secrets: lounge_odds_poll_project_url, lounge_odds_poll_service_role_key
--
-- Manual smoke:
--   select public.invoke_send_due_offer_reminders();

create or replace function public.invoke_send_due_offer_reminders()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  service_key text;
  base_url text;
  req_id bigint;
begin
  select btrim(ds.decrypted_secret)
  into service_key
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_service_role_key'
  limit 1;

  select btrim(ds.decrypted_secret)
  into base_url
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_project_url'
  limit 1;

  if service_key is null or service_key = '' then
    raise warning 'invoke_send_due_offer_reminders: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_send_due_offer_reminders: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  select
    net.http_post(
      url := base_url || '/functions/v1/send-due-offer-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', service_key,
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('lookaheadMinutes', 1),
      timeout_milliseconds := 120000
    )
  into req_id;
exception
  when others then
    raise warning 'invoke_send_due_offer_reminders: %', sqlerrm;
end;
$$;

comment on function public.invoke_send_due_offer_reminders() is
  'pg_cron helper: POST send-due-offer-reminders (lookaheadMinutes=1). Vault: lounge_odds_poll_project_url, lounge_odds_poll_service_role_key.';

revoke all on function public.invoke_send_due_offer_reminders() from public;
grant execute on function public.invoke_send_due_offer_reminders() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'send_due_offer_reminders_minute'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'send_due_offer_reminders_minute',
    '* * * * *',
    $cron$select public.invoke_send_due_offer_reminders();$cron$
  );
end;
$$;

-- Edge Monitor: register offer reminder cron (was unscheduled gap).
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
  v_bot_publish_recent timestamptz;
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

  select max(l.created_at)
  into v_bot_publish_recent
  from public.lounge_bot_publish_log l
  where l.created_at >= v_now - interval '15 minutes'
    and l.status = 'published';

  for r in
    select *
    from jsonb_to_recordset(
      '[
        {"id":"lounge_activity_push_flush","jobname":"lounge_activity_push_flush","label":"Activity push flush","category":"push","schedule_hint":"Every 10s","max_stale_minutes":3,"critical":false,"runbook_id":"prod-checklist","heartbeat":"push_batches"},
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
        {"id":"lounge_market_symbol_sync_daily","jobname":"lounge_market_symbol_sync_daily","label":"Market symbol bulk sync","category":"ops","schedule_hint":"Intentionally disabled","max_stale_minutes":999999,"critical":false,"runbook_id":"prod-checklist","force_disabled":true},
        {"id":"poker_catalog_sync_production","jobname":null,"label":"Poker catalog sync","category":"catalog","kind":"external","schedule_hint":"GitHub Actions · every 3 days · 06:00 UTC","runbook_id":"prod-checklist"}
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

    if coalesce(r.kind, 'pg_cron') = 'external' then
      v_health := 'external';
      v_hint := 'Runs on GitHub Actions — check Actions tab for last run.';
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
          if v_push_recent is null or v_push_recent < v_now - interval '5 minutes' then
            v_health := 'stale';
            v_hint := 'No activity push batches sent in last 5 min — push flush cron may be stuck.';
          else
            v_hint := format('Push batches sent %s ago.', to_char(v_now - v_push_recent, 'FMMI"m "SS"s" ago"'));
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

    if v_health = 'ok' or v_health = 'external' then
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
