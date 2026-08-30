-- ============================================================================
-- lounge_bot_weekly_ledger_recap: Tuesday Morning Syndicate Weekly Ledger
-- 1. Updates invoke_lounge_odds_poll to allow 'weekly_syndicate_recap'
-- 2. Schedules automated pg_cron job:
--    - Tuesday Morning Syndicate Weekly Ledger: Tuesdays @ 7:30 AM PT (14:30 UTC)
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
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'nfl_primetime_spotlight', 'weekly_syndicate_recap', 'calibrate_persona_models') then
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

  -- 2. Tuesday Morning Syndicate Weekly Ledger & Post-Mortem: Tuesdays @ 7:30 AM PT (14:30 UTC) - Day 2
  if exists (select 1 from cron.job where jobname = 'lounge_odds_tuesday_weekly_recap') then
    perform cron.unschedule('lounge_odds_tuesday_weekly_recap');
  end if;
  perform cron.schedule(
    'lounge_odds_tuesday_weekly_recap',
    '30 14 * * 2',
    'select public.invoke_lounge_odds_poll(''weekly_syndicate_recap'');'
  );

end $$;
