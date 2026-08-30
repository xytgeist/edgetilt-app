-- ============================================================================
-- lounge_bot_persona_weights & Bayesian Adaptive Calibration
-- Supports storing dynamic empirical Bayesian weights for Sharpe Syndicate personas
-- (Scott, Rocco, Chedda, Tank) with metadata situational tagging.
-- ============================================================================

do $$
begin
  -- 1. Ensure metadata column exists on lounge_bot_picks for situational tagging
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'lounge_bot_picks' 
      and column_name = 'metadata'
  ) then
    alter table public.lounge_bot_picks add column metadata jsonb default '{}'::jsonb;
  end if;

  -- 2. Create table lounge_bot_persona_weights for calibrated empirical weights
  create table if not exists public.lounge_bot_persona_weights (
    id uuid primary key default gen_random_uuid(),
    picker_name text not null, -- 'Scott' | 'Rocco' | 'Chedda' | 'Tank'
    factor_key text not null,  -- e.g. 'wind_unders', 'travel_fatigue', 'dog_sweet_spot', 'short_favorites', 'model_ev'
    prior_weight numeric not null default 1.0,
    calibrated_weight numeric not null default 1.0,
    sample_size integer not null default 0,
    wins integer not null default 0,
    losses integer not null default 0,
    pushes integer not null default 0,
    net_units numeric not null default 0.0,
    roi_pct numeric not null default 0.0,
    last_calibrated_at timestamptz default now(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    constraint lounge_bot_persona_weights_picker_factor_unique unique (picker_name, factor_key)
  );

  -- 3. Enable RLS
  alter table public.lounge_bot_persona_weights enable row level security;

  -- 4. Public / Authenticated read access
  drop policy if exists "Public read lounge_bot_persona_weights" on public.lounge_bot_persona_weights;
  create policy "Public read lounge_bot_persona_weights"
    on public.lounge_bot_persona_weights
    for select
    using (true);

  -- 5. Service role full access
  drop policy if exists "Service role manage lounge_bot_persona_weights" on public.lounge_bot_persona_weights;
  create policy "Service role manage lounge_bot_persona_weights"
    on public.lounge_bot_persona_weights
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

  -- 6. Seed initial baseline factors for all 4 personas
  insert into public.lounge_bot_persona_weights (picker_name, factor_key, prior_weight, calibrated_weight)
  values
    ('Tank', 'wind_unders', 1.0, 1.0),
    ('Tank', 'travel_fatigue', 1.0, 1.0),
    ('Tank', 'rest_advantage', 1.0, 1.0),
    ('Tank', 'extreme_cold_unders', 1.0, 1.0),
    ('Chedda', 'dog_sweet_spot_130_175', 1.0, 1.0),
    ('Chedda', 'dog_longshot_180_plus', 1.0, 1.0),
    ('Chedda', 'home_dog_value', 1.0, 1.0),
    ('Rocco', 'short_favorites_1_to_4', 1.0, 1.0),
    ('Rocco', 'key_number_3_value', 1.0, 1.0),
    ('Rocco', 'home_favorite_dominance', 1.0, 1.0),
    ('Scott', 'model_clv_high_ev', 1.0, 1.0),
    ('Scott', 'market_consensus_edge', 1.0, 1.0)
  on conflict (picker_name, factor_key) do nothing;

  -- 7. Update invoke_lounge_odds_poll to allow 'calibrate_persona_models'
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
      if action not in ('poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'calibrate_persona_models') then
        raise warning 'invoke_lounge_odds_poll: action must be poll_edges, poll_live, daily_slates, best_bet_hour, value_bet_radar, grade_picks, predictive_pick, nfl_slate_card, or calibrate_persona_models (got %)', p_action;
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

      body := jsonb_build_object(
        'action', action,
        'force', p_force
      );

      req_id := net.http_post(
        url := rtrim(base_url, '/') || '/functions/v1/lounge-odds-poll',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := body,
        timeout_milliseconds := 60000
      );

      raise notice 'invoke_lounge_odds_poll(%) dispatched via net.http_post (request id %)', action, req_id;
    end;
    $body$;
  $func$;

  -- 8. Schedule Tuesday 6:00 AM PT post-game adaptive calibration cron
  -- Tuesday 6:00 AM PT = 13:00 UTC (during standard time) / 14:00 UTC
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'lounge_odds_calibrate_personas') then
      perform cron.unschedule('lounge_odds_calibrate_personas');
    end if;

    perform cron.schedule(
      'lounge_odds_calibrate_personas',
      '0 14 * * 2', -- Every Tuesday at 14:00 UTC (~7:00 AM PT / 6:00 AM PST)
      'select public.invoke_lounge_odds_poll(''calibrate_persona_models'')'
    );
  end if;

end $$;
