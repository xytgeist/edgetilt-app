-- ============================================================================
-- lounge_odds_poll: Wire NFL/CFB Slate Cards, Predictive Solo Spots, and Auto-Grading into pg_cron
-- Supports actions: poll_edges, poll_live, daily_slates, best_bet_hour, value_bet_radar, grade_picks, predictive_pick, nfl_slate_card
-- ============================================================================

do $$
begin
  -- 1. Create or replace function invoke_lounge_odds_poll
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
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card') then
        raise warning 'invoke_lounge_odds_poll: action must be poll_edges, poll_live, daily_slates, best_bet_hour, value_bet_radar, grade_picks, predictive_pick, or nfl_slate_card (got %)', p_action;
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
        select a.slug
        from public.lounge_bot_accounts a
        where a.pipeline = 'odds_api'
          and a.run_state = 'running'
          and a.enabled = true
        order by a.slug
      loop
        body := jsonb_build_object(
          'slug', bot.slug,
          'action', action,
          'force', coalesce(p_force, false)
        );

        begin
          select
            net.http_post(
              url := base_url || '/functions/v1/lounge-odds-poll',
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'apikey', service_key,
                'Authorization', 'Bearer ' || service_key
              ),
              body := body,
              timeout_milliseconds := 180000
            )
          into req_id;
        exception
          when others then
            raise warning 'invoke_lounge_odds_poll: % for bot % — %', action, bot.slug, sqlerrm;
        end;
      end loop;
    exception
      when others then
        raise warning 'invoke_lounge_odds_poll: %', sqlerrm;
    end;
    $body$;
  $func$;

  grant execute on function public.invoke_lounge_odds_poll(text, boolean) to postgres, authenticated, service_role;

  -- 2. Sunday NFL Syndicate Slate Card: 8:30 AM PT (15:30 UTC) on Sundays (Day 0)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sunday_slate') then
    perform cron.unschedule('lounge_odds_nfl_sunday_slate');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sunday_slate',
    '30 15 * * 0',
    'select public.invoke_lounge_odds_poll(''nfl_slate_card'');'
  );

  -- 3. Saturday College Football Syndicate Slate Card: 8:30 AM PT (15:30 UTC) on Saturdays (Day 6)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_cfb_saturday_slate') then
    perform cron.unschedule('lounge_odds_cfb_saturday_slate');
  end if;
  perform cron.schedule(
    'lounge_odds_cfb_saturday_slate',
    '30 15 * * 6',
    'select public.invoke_lounge_odds_poll(''nfl_slate_card'');'
  );

  -- 4. Weekday Solo Spot / Syndicate Pick: Tuesday & Thursday @ 11:30 AM PT (18:30 UTC)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_weekday_predictive_pick') then
    perform cron.unschedule('lounge_odds_weekday_predictive_pick');
  end if;
  perform cron.schedule(
    'lounge_odds_weekday_predictive_pick',
    '30 18 * * 2,4',
    'select public.invoke_lounge_odds_poll(''predictive_pick'');'
  );

  -- 5. Auto-Grading & Settlement Poll: Runs every 2 hours between 10 AM and 11 PM PT (17:00-06:00 UTC)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_grade_picks_poll') then
    perform cron.unschedule('lounge_odds_grade_picks_poll');
  end if;
  perform cron.schedule(
    'lounge_odds_grade_picks_poll',
    '15 17-23,0-6/2 * * *',
    'select public.invoke_lounge_odds_poll(''grade_picks'');'
  );
end $$;

