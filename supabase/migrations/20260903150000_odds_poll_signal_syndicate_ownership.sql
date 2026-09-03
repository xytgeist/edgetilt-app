-- Route odds cron by product ownership:
-- Signal alerts (poll_edges / live / coffee / BBH / VBR) → never @sharpesyndicate
-- Desk slate / VIP shop actions → only @sharpesyndicate when that bot exists
-- Shared: grade_picks, calibrate_persona_models → all running odds_api bots

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
begin
  action := lower(btrim(coalesce(p_action, '')));
  if action not in (
    'poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar',
    'grade_picks', 'predictive_pick', 'nfl_slate_card', 'cfb_slate_card',
    'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot',
    'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap',
    'syndicate_monthly_scoreboard', 'calibrate_persona_models', 'ufc_slate_card',
    'nfl_wed_tnf_vip', 'nfl_sat_vip_adds_kills',
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
    'nfl_wong_teaser', 'nfl_primetime_spotlight', 'nfl_halftime_pivot',
    'nfl_anytime_td', 'nfl_live_middle_arb', 'weekly_syndicate_recap',
    'syndicate_monthly_scoreboard', 'ufc_slate_card',
    'nfl_wed_tnf_vip', 'nfl_sat_vip_adds_kills',
    'cfb_wed_midweek_vip', 'cfb_thu_night_spotlight', 'cfb_sat_vip_adds_kills',
    'picks_for_today'
  );

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
        or (not signal_only and not desk_only)
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
      timeout_milliseconds := 60000
    ) into req_id;
  end loop;
end;
$body$;

comment on function public.invoke_lounge_odds_poll(text, boolean) is
  'pg_cron dispatcher for lounge-odds-poll. Signal alert actions skip sharpe-syndicate; desk actions prefer sharpe-syndicate only.';

grant execute on function public.invoke_lounge_odds_poll(text, boolean) to postgres, authenticated, service_role;

-- Strip Signal alert toggles on Syndicate desk bot (both envs when applied).
update public.lounge_bot_odds_config c
set
  line_movement_enabled = false,
  coffee_covers_enabled = false,
  daily_slate_enabled = false,
  live_edge_enabled = false,
  period_report_enabled = false,
  sharp_report_enabled = false,
  value_bet_radar_enabled = false,
  best_bet_hour_enabled = false,
  arb_watch_enabled = false,
  starter_spotlight_enabled = false,
  confirmed_starters_enabled = false,
  injury_impact_enabled = false,
  rest_travel_edge_enabled = false,
  fade_the_public_enabled = false,
  alert_audience = '{}'::jsonb
from public.lounge_bot_accounts a
where a.user_id = c.bot_user_id
  and a.slug = 'sharpe-syndicate';

notify pgrst, 'reload schema';

commit;
