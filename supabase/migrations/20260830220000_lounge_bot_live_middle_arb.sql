-- ============================================================================
-- lounge_bot_live_middle_arb: Live Middle & Cross-Book Arbitrage Scanner
-- 1. Updates invoke_lounge_odds_poll to allow 'nfl_live_middle_arb'
-- 2. Schedules automated pg_cron jobs for game-time middle & arb scanning:
--    - Sunday Game Day Middle Scanner: Sundays every 30 mins between 10am-7pm PT (17:00-02:00 UTC)
--    - Thursday / Monday Primetime Middle Scanner: Thursdays & Mondays @ 5:30 PM PT (00:30 UTC Fri/Tue)
-- ============================================================================

do $$
begin
  -- 1. Update invoke_lounge_odds_poll allowed actions
  execute $func$
    create or replace function public.invoke_lounge_odds_poll(p_action text, p_force boolean default false)
    returns void
    language plpgsql
    security definer
    set search_path = public, vault, net, cron, extensions, pg_temp
    as $body$
    declare
      service_key text;
      base_url text;
      req_id bigint;
      bot record;
      action text;
      body jsonb;
    begin
      action := lower(btrim(coalesce(p_action, '')));
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot', 'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap', 'calibrate_persona_models') then
        raise warning 'invoke_lounge_odds_poll: action must be valid odds poll action (got %)', p_action;
        return;
      end if;

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
        raise warning 'invoke_lounge_odds_poll: add vault secret lounge_odds_poll_service_role_key (service_role JWT)';
        return;
      end if;

      if base_url is null or btrim(base_url) = '' then
        raise warning 'invoke_lounge_odds_poll: add vault secret lounge_odds_poll_project_url';
        return;
      end if;

      if service_key ~* '^bearer\s+' then
        service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
      end if;

      base_url := rtrim(btrim(base_url), '/');

      for bot in
        select user_id, slug, run_state
        from public.lounge_bot_accounts
        where pipeline = 'sports_odds'
          and run_state = 'running'
      loop
        body := jsonb_build_object(
          'slug', bot.slug,
          'action', action,
          'force', coalesce(p_force, false)
        );

        select net.http_post(
          url := base_url || '/functions/v1/lounge-odds-poll',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := body,
          timeout_milliseconds := 55000
        ) into req_id;
      end loop;
    end;
    $body$;
  $func$;

  -- 2. Schedule pg_cron jobs for middle & arb scanning
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Sunday Game Day Scan: Every 30 mins between 17:00 and 02:00 UTC (10 AM - 7 PM PT)
    if exists (select 1 from cron.job where jobname = 'lounge_odds_sunday_middle_scan') then
      perform cron.unschedule('lounge_odds_sunday_middle_scan');
    end if;
    perform cron.schedule(
      'lounge_odds_sunday_middle_scan',
      '*/30 17-23,0-2 * * 0',
      'select public.invoke_lounge_odds_poll(''nfl_live_middle_arb'');'
    );

    -- Thursday Primetime Middle Scan: Thursdays @ 5:30 PM PT (00:30 UTC Friday)
    if exists (select 1 from cron.job where jobname = 'lounge_odds_thursday_middle_scan') then
      perform cron.unschedule('lounge_odds_thursday_middle_scan');
    end if;
    perform cron.schedule(
      'lounge_odds_thursday_middle_scan',
      '30 0 * * 5',
      'select public.invoke_lounge_odds_poll(''nfl_live_middle_arb'');'
    );

    -- Monday Primetime Middle Scan: Mondays @ 5:30 PM PT (00:30 UTC Tuesday)
    if exists (select 1 from cron.job where jobname = 'lounge_odds_monday_middle_scan') then
      perform cron.unschedule('lounge_odds_monday_middle_scan');
    end if;
    perform cron.schedule(
      'lounge_odds_monday_middle_scan',
      '30 0 * * 2',
      'select public.invoke_lounge_odds_poll(''nfl_live_middle_arb'');'
    );
  end if;
end $$;
