-- NFL Sunday card: Friday is a lean. Sat steam confirm/kill. Sunday inactives lock by window.
-- CFB Friday noon house lock is unchanged. TNF/SNF/MNF stay on primetime lock.

begin;

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
  signal_only boolean;
  desk_only boolean;
  shared_once boolean;
  timeout_ms int;
  carrier_slug text;
begin
  action := lower(btrim(coalesce(p_action, '')));
  if action not in (
    'poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar',
    'grade_picks', 'predictive_pick', 'nfl_slate_card', 'cfb_slate_card',
    'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_primetime_lock', 'nfl_halftime_pivot',
    'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap',
    'syndicate_monthly_scoreboard', 'calibrate_persona_models', 'ufc_slate_card',
    'nfl_wed_tnf_vip', 'nfl_sat_vip_adds_kills', 'nfl_sat_steam',
    'nfl_sunday_early_lock', 'nfl_sunday_late_lock',
    'cfb_wed_midweek_vip', 'cfb_thu_night_spotlight', 'cfb_sat_vip_adds_kills',
    'picks_for_today'
  ) then
    raise warning 'invoke_lounge_odds_poll: action must be valid odds poll action (got %)', p_action;
    return;
  end if;

  signal_only := action in (
    'poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar'
  );
  desk_only := action in (
    'predictive_pick', 'nfl_slate_card', 'cfb_slate_card',
    'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_primetime_lock', 'nfl_halftime_pivot',
    'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap',
    'syndicate_monthly_scoreboard', 'ufc_slate_card',
    'nfl_wed_tnf_vip', 'nfl_sat_vip_adds_kills', 'nfl_sat_steam',
    'nfl_sunday_early_lock', 'nfl_sunday_late_lock',
    'cfb_wed_midweek_vip', 'cfb_thu_night_spotlight', 'cfb_sat_vip_adds_kills',
    'picks_for_today'
  );
  shared_once := action in ('grade_picks', 'calibrate_persona_models');
  timeout_ms := case when action = 'grade_picks' then 150000 else 60000 end;

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

  if service_key is null or btrim(service_key) = '' then
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

  if shared_once then
    select a.slug
    into carrier_slug
    from public.lounge_bot_accounts a
    where a.pipeline = 'odds_api'
      and a.run_state = 'running'
      and a.enabled = true
    order by case when a.slug = 'sports-odds' then 0 else 1 end, a.slug
    limit 1;

    if carrier_slug is null then
      raise warning 'invoke_lounge_odds_poll: no running odds_api bot for %', action;
      return;
    end if;

    body := jsonb_build_object(
      'slug', carrier_slug,
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
      timeout_milliseconds := timeout_ms
    ) into req_id;
    return;
  end if;

  for bot in
    select a.slug
    from public.lounge_bot_accounts a
    where a.pipeline = 'odds_api'
      and a.run_state = 'running'
      and a.enabled = true
      and (
        (signal_only and a.slug is distinct from 'sharpe-syndicate')
        or (
          desk_only
          and (
            a.slug = 'sharpe-syndicate'
            or (
              a.slug is distinct from 'sharpe-syndicate'
              and not exists (
                select 1
                from public.lounge_bot_accounts s
                where s.slug = 'sharpe-syndicate'
                  and s.enabled = true
                  and s.run_state = 'running'
              )
            )
          )
        )
      )
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
      timeout_milliseconds := timeout_ms
    ) into req_id;
  end loop;
end;
$body$;

comment on function public.invoke_lounge_odds_poll(text, boolean) is
  'pg_cron dispatcher for lounge-odds-poll. Signal skips syndicate; desk prefers syndicate; grade_picks/calibrate fire once.';

grant execute on function public.invoke_lounge_odds_poll(text, boolean) to postgres, authenticated, service_role;

-- PDT (UTC-7): Sat 7pm steam … Sun 8-10:50am early lock … Sun 11am-1:50pm late lock.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sat_vip_adds_kills') then
    perform cron.unschedule('lounge_odds_nfl_sat_vip_adds_kills');
  end if;
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sat_steam') then
    perform cron.unschedule('lounge_odds_nfl_sat_steam');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sat_steam',
    '0 2 * * 0',
    'select public.invoke_lounge_odds_poll(''nfl_sat_steam'');'
  );

  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sunday_early_lock') then
    perform cron.unschedule('lounge_odds_nfl_sunday_early_lock');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sunday_early_lock',
    '*/10 15-17 * * 0',
    'select public.invoke_lounge_odds_poll(''nfl_sunday_early_lock'');'
  );

  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_sunday_late_lock') then
    perform cron.unschedule('lounge_odds_nfl_sunday_late_lock');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_sunday_late_lock',
    '*/10 18-20 * * 0',
    'select public.invoke_lounge_odds_poll(''nfl_sunday_late_lock'');'
  );
end $$;

notify pgrst, 'reload schema';

commit;
