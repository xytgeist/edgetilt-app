-- ============================================================================
-- Clean NFL week (shop model, not tout farm)
-- - Mute Tue/Thu public predictive_pick cron
-- - Wed VIP TNF lean (11:00 AM PT)
-- - Sat VIP adds/kills stub (10:00 AM PT) … Edge skips when nothing real moved
-- Best Bet Hour forced VIP-only in Edge; Value Radar capped to one public look.
-- ============================================================================

do $$
begin
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
      if action not in (
        'poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar',
        'grade_picks', 'predictive_pick', 'nfl_slate_card', 'cfb_slate_card',
        'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot',
        'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap',
        'syndicate_monthly_scoreboard', 'calibrate_persona_models', 'ufc_slate_card',
        'nfl_wed_tnf_vip', 'nfl_sat_vip_adds_kills'
      ) then
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

        select net.http_post(
          url := base_url || '/functions/v1/lounge-odds-poll',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := body,
          timeout_milliseconds := 60000
        ) into req_id;
      end loop;
    end;
    $body$;
  $func$;

  grant execute on function public.invoke_lounge_odds_poll(text, boolean) to postgres, authenticated, service_role;

  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed … skip clean NFL week cron changes';
    return;
  end if;

  -- Mute Tue/Thu public predictive pick cron (tout-farm freebie)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_weekday_predictive_pick') then
    perform cron.unschedule('lounge_odds_weekday_predictive_pick');
  end if;

  -- Wed VIP TNF lean … 11:00 AM PT (18:00 UTC PDT)
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_wed_tnf_vip') then
    perform cron.unschedule('lounge_odds_nfl_wed_tnf_vip');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_wed_tnf_vip',
    '0 18 * * 3',
    'select public.invoke_lounge_odds_poll(''nfl_wed_tnf_vip'');'
  );

  -- Sat VIP adds/kills stub … 10:00 AM PT (17:00 UTC PDT). Edge no-ops if nothing flipped.
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sat_vip_adds_kills') then
    perform cron.unschedule('lounge_odds_nfl_sat_vip_adds_kills');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sat_vip_adds_kills',
    '0 17 * * 6',
    'select public.invoke_lounge_odds_poll(''nfl_sat_vip_adds_kills'');'
  );
end $$;
