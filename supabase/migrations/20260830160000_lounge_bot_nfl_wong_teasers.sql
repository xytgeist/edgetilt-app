-- ============================================================================
-- lounge_bot_nfl_wong_teasers: Support Stanford Wong / Basic Strategy Teasers
-- 1. Updates market_key check constraint on lounge_bot_picks to allow 'teasers'
-- 2. Updates invoke_lounge_odds_poll to allow 'nfl_wong_teaser'
-- 3. Schedules lounge_odds_nfl_wong_teaser cron job (Fridays @ 1:30 PM PT / 20:30 UTC)
-- 4. Seeds baseline Bayesian factors for wong teasers in lounge_bot_persona_weights
-- ============================================================================

do $$
begin
  -- 1. Update market_key check constraint on lounge_bot_picks
  if exists (
    select 1 from pg_constraint
    where conname = 'lounge_bot_picks_market_key_check'
  ) then
    alter table public.lounge_bot_picks drop constraint lounge_bot_picks_market_key_check;
  end if;

  alter table public.lounge_bot_picks
    add constraint lounge_bot_picks_market_key_check
    check (market_key in ('h2h', 'spreads', 'totals', 'teasers'));

  -- 2. Update invoke_lounge_odds_poll allowed actions
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
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'calibrate_persona_models') then
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

  -- 3. Schedule Friday Afternoon NFL Wong Teaser of the Week: 1:30 PM PT (20:30 UTC) on Fridays
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_wong_teaser_friday') then
    perform cron.unschedule('lounge_odds_nfl_wong_teaser_friday');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_wong_teaser_friday',
    '30 20 * * 5',
    'select public.invoke_lounge_odds_poll(''nfl_wong_teaser'');'
  );

  -- 4. Seed baseline factors for Scott in lounge_bot_persona_weights
  insert into public.lounge_bot_persona_weights (picker_name, factor_key, prior_weight, calibrated_weight)
  values
    ('Scott', 'wong_teaser_key_numbers_3_7', 1.0, 1.0),
    ('Scott', 'nfl_basic_strategy', 1.0, 1.0)
  on conflict (picker_name, factor_key) do nothing;
end $$;
