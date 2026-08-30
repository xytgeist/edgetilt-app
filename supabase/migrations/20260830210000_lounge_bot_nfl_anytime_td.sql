-- ============================================================================
-- lounge_bot_nfl_anytime_td: Automated Anytime Touchdown & Player Props Engine
-- 1. Updates invoke_lounge_odds_poll to allow 'nfl_anytime_td'
-- 2. Modifies lounge_bot_picks market_key check constraint to allow 'player_anytime_td'
-- 3. Schedules automated pg_cron job for Sunday Morning Touchdown Prop drops:
--    - Sunday TD Props Drop: Sundays @ 9:15 AM PT (16:15 UTC)
-- ============================================================================

do $$
begin
  -- 1. Ensure market_key check constraint on lounge_bot_picks allows 'player_anytime_td'
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'lounge_bot_picks'
      and constraint_name = 'lounge_bot_picks_market_key_check'
  ) then
    alter table public.lounge_bot_picks
      drop constraint lounge_bot_picks_market_key_check;
  end if;

  alter table public.lounge_bot_picks
    add constraint lounge_bot_picks_market_key_check
    check (market_key in ('h2h', 'spreads', 'totals', 'teasers', 'player_anytime_td'));

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
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot', 'nfl_anytime_td', 'weekly_syndicate_recap', 'calibrate_persona_models') then
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

  -- 3. Sunday Morning TD Props Drop: Sundays @ 9:15 AM PT (16:15 UTC) - Day 0 UTC
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sunday_anytime_td') then
    perform cron.unschedule('lounge_odds_nfl_sunday_anytime_td');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sunday_anytime_td',
    '15 16 * * 0',
    'select public.invoke_lounge_odds_poll(''nfl_anytime_td'');'
  );

end $$;
