-- ============================================================================
-- lounge_bot_picks: Multi-dimensional record breakdown (sport & timeframes)
-- Supports timeframe filtering (week, month, season, year, all_time)
-- Supports per-sport filtering (CFB, NFL, MLB, NBA, etc.)
-- Auto-computes best sport highlight text for profile about_me.
-- ============================================================================

create or replace function public.lounge_bot_get_picks_record(
  p_bot_user_id uuid,
  p_timeframe text default 'all_time',
  p_sport_key text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_time_cutoff timestamptz;
  v_overall jsonb;
  v_pickers jsonb := '{}'::jsonb;
  v_timeframes jsonb := '{}'::jsonb;
  v_sports jsonb := '[]'::jsonb;
  v_best_sport jsonb := null;
  v_highlight_text text := '';
  
  v_name text;
  v_wins int;
  v_losses int;
  v_pushes int;
  v_pending int;
  v_units numeric;
  v_win_rate numeric;
  v_roi numeric;
  v_total_resolved int;

  v_tf text;
  v_tf_cutoff timestamptz;
  
  -- Overall all-time summary for highlight
  v_at_wins int;
  v_at_losses int;
  v_at_units numeric;
begin
  -- Resolve primary timeframe filter cutoff
  if p_timeframe = 'week' then
    v_time_cutoff := now() - interval '7 days';
  elsif p_timeframe = 'month' then
    v_time_cutoff := date_trunc('month', now());
  elsif p_timeframe in ('season', 'year') then
    v_time_cutoff := date_trunc('year', now());
  else
    v_time_cutoff := null;
  end if;

  -- 1. Calculate overall stats for chosen timeframe & sport
  select
    coalesce(count(*) filter (where status = 'won'), 0),
    coalesce(count(*) filter (where status = 'lost'), 0),
    coalesce(count(*) filter (where status = 'push'), 0),
    coalesce(count(*) filter (where status = 'pending'), 0),
    coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0)
  into v_wins, v_losses, v_pushes, v_pending, v_units
  from public.lounge_bot_picks
  where bot_user_id = p_bot_user_id
    and (v_time_cutoff is null or commence_time >= v_time_cutoff)
    and (p_sport_key is null or p_sport_key = 'all' or sport_key = p_sport_key);

  v_total_resolved := v_wins + v_losses;
  v_win_rate := 0.0;
  v_roi := 0.0;
  if v_total_resolved > 0 then
    v_win_rate := round((v_wins::numeric / v_total_resolved::numeric) * 100.0, 1);
    v_roi := round((v_units / (v_total_resolved + v_pushes)::numeric) * 100.0, 1);
  end if;

  v_overall := jsonb_build_object(
    'wins', v_wins,
    'losses', v_losses,
    'pushes', v_pushes,
    'pending', v_pending,
    'win_rate_pct', v_win_rate,
    'roi_pct', v_roi,
    'units_net', round(v_units, 2),
    'timeframe', coalesce(p_timeframe, 'all_time'),
    'sport_key', coalesce(p_sport_key, 'all')
  );

  -- 2. Calculate stats for each persona (Scott, Rocco, Chedda, Tank) for chosen filter
  for v_name in select unnest(array['Scott', 'Rocco', 'Chedda', 'Tank']) loop
    select
      coalesce(count(*) filter (where status = 'won'), 0),
      coalesce(count(*) filter (where status = 'lost'), 0),
      coalesce(count(*) filter (where status = 'push'), 0),
      coalesce(count(*) filter (where status = 'pending'), 0),
      coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0)
    into v_wins, v_losses, v_pushes, v_pending, v_units
    from public.lounge_bot_picks
    where bot_user_id = p_bot_user_id
      and picker_name = v_name
      and (v_time_cutoff is null or commence_time >= v_time_cutoff)
      and (p_sport_key is null or p_sport_key = 'all' or sport_key = p_sport_key);

    v_total_resolved := v_wins + v_losses;
    v_win_rate := 0.0;
    if v_total_resolved > 0 then
      v_win_rate := round((v_wins::numeric / v_total_resolved::numeric) * 100.0, 1);
    end if;

    v_pickers := v_pickers || jsonb_build_object(
      v_name, jsonb_build_object(
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'pending', v_pending,
        'win_rate_pct', v_win_rate,
        'units_net', round(v_units, 2)
      )
    );
  end loop;

  -- 3. Multi-timeframe summary (week, month, season, all_time)
  for v_tf in select unnest(array['week', 'month', 'season', 'all_time']) loop
    if v_tf = 'week' then
      v_tf_cutoff := now() - interval '7 days';
    elsif v_tf = 'month' then
      v_tf_cutoff := date_trunc('month', now());
    elsif v_tf = 'season' then
      v_tf_cutoff := date_trunc('year', now());
    else
      v_tf_cutoff := null;
    end if;

    select
      coalesce(count(*) filter (where status = 'won'), 0),
      coalesce(count(*) filter (where status = 'lost'), 0),
      coalesce(count(*) filter (where status = 'push'), 0),
      coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0)
    into v_wins, v_losses, v_pushes, v_units
    from public.lounge_bot_picks
    where bot_user_id = p_bot_user_id
      and (v_tf_cutoff is null or commence_time >= v_tf_cutoff)
      and (p_sport_key is null or p_sport_key = 'all' or sport_key = p_sport_key);

    v_total_resolved := v_wins + v_losses;
    v_win_rate := 0.0;
    if v_total_resolved > 0 then
      v_win_rate := round((v_wins::numeric / v_total_resolved::numeric) * 100.0, 1);
    end if;

    v_timeframes := v_timeframes || jsonb_build_object(
      v_tf, jsonb_build_object(
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'win_rate_pct', v_win_rate,
        'units_net', round(v_units, 2)
      )
    );
  end loop;

  -- 4. Multi-sport breakdown
  select coalesce(jsonb_agg(sport_row order by units_net desc, wins desc), '[]'::jsonb)
  into v_sports
  from (
    select
      p.sport_key,
      case
        when p.sport_key = 'americanfootball_ncaaf' then 'CFB'
        when p.sport_key = 'americanfootball_nfl' then 'NFL'
        when p.sport_key = 'baseball_mlb' then 'MLB'
        when p.sport_key = 'basketball_nba' then 'NBA'
        when p.sport_key = 'basketball_ncaab' then 'CBB'
        when p.sport_key = 'basketball_wnba' then 'WNBA'
        when p.sport_key = 'icehockey_nhl' then 'NHL'
        when p.sport_key = 'mma_mixed_martial_arts' then 'UFC/MMA'
        when p.sport_key like 'soccer%' then 'Soccer'
        else upper(replace(replace(p.sport_key, 'americanfootball_', ''), 'basketball_', ''))
      end as sport_label,
      coalesce(count(*) filter (where p.status = 'won'), 0) as wins,
      coalesce(count(*) filter (where p.status = 'lost'), 0) as losses,
      coalesce(count(*) filter (where p.status = 'push'), 0) as pushes,
      coalesce(count(*) filter (where p.status = 'pending'), 0) as pending,
      round(coalesce(sum(p.units_net) filter (where p.status in ('won', 'lost', 'push')), 0), 2) as units_net,
      case
        when count(*) filter (where p.status in ('won', 'lost')) > 0 then
          round((count(*) filter (where p.status = 'won')::numeric / count(*) filter (where p.status in ('won', 'lost'))::numeric) * 100.0, 1)
        else 0.0
      end as win_rate_pct
    from public.lounge_bot_picks p
    where p.bot_user_id = p_bot_user_id
    group by p.sport_key
  ) sport_row;

  -- 5. Determine best sport highlight & construct headline text
  select row_to_json(r)::jsonb
  into v_best_sport
  from (
    select
      p.sport_key,
      case
        when p.sport_key = 'americanfootball_ncaaf' then 'CFB'
        when p.sport_key = 'americanfootball_nfl' then 'NFL'
        when p.sport_key = 'baseball_mlb' then 'MLB'
        when p.sport_key = 'basketball_nba' then 'NBA'
        when p.sport_key = 'basketball_ncaab' then 'CBB'
        when p.sport_key = 'basketball_wnba' then 'WNBA'
        when p.sport_key = 'icehockey_nhl' then 'NHL'
        when p.sport_key = 'mma_mixed_martial_arts' then 'UFC/MMA'
        when p.sport_key like 'soccer%' then 'Soccer'
        else upper(replace(replace(p.sport_key, 'americanfootball_', ''), 'basketball_', ''))
      end as sport_label,
      count(*) filter (where p.status = 'won') as wins,
      count(*) filter (where p.status = 'lost') as losses,
      round(sum(p.units_net) filter (where p.status in ('won', 'lost', 'push')), 2) as units_net
    from public.lounge_bot_picks p
    where p.bot_user_id = p_bot_user_id
      and p.status in ('won', 'lost', 'push')
    group by p.sport_key
    having sum(p.units_net) > 0 and count(*) filter (where p.status in ('won', 'lost')) >= 1
    order by sum(p.units_net) desc, count(*) filter (where p.status = 'won') desc
    limit 1
  ) r;

  -- Get all-time baseline numbers for highlight
  select
    coalesce(count(*) filter (where status = 'won'), 0),
    coalesce(count(*) filter (where status = 'lost'), 0),
    round(coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0), 2)
  into v_at_wins, v_at_losses, v_at_units
  from public.lounge_bot_picks
  where bot_user_id = p_bot_user_id;

  if v_best_sport is not null and (v_best_sport->>'units_net')::numeric > 0 then
    v_highlight_text := format(
      '🎯 Sharp Syndicate | %s: +%su (%s-%s) · All-Time: %su',
      v_best_sport->>'sport_label',
      v_best_sport->>'units_net',
      v_best_sport->>'wins',
      v_best_sport->>'losses',
      case when v_at_units >= 0 then '+' || v_at_units::text else v_at_units::text end
    );
  elsif (v_at_wins + v_at_losses) > 0 then
    v_highlight_text := format(
      '🎯 Sharp Syndicate | Verified Ledger: %su (%s-%s)',
      case when v_at_units >= 0 then '+' || v_at_units::text else v_at_units::text end,
      v_at_wins,
      v_at_losses
    );
  else
    v_highlight_text := '🎯 Sharp Syndicate | Scott, Rocco, Chedda & Tank predictive betting desk.';
  end if;

  return jsonb_build_object(
    'overall', v_overall,
    'pickers', v_pickers,
    'timeframes', v_timeframes,
    'sports', v_sports,
    'best_sport', v_best_sport,
    'highlight_text', v_highlight_text
  );
end;
$$;

revoke all on function public.lounge_bot_get_picks_record(uuid, text, text) from public;
grant execute on function public.lounge_bot_get_picks_record(uuid, text, text) to authenticated, anon, service_role;
