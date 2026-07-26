-- Scott alert_audience: accept route objects { lounge, sub_chat, lounge_teaser_pct } per alert key.
-- Legacy string values (lounge, sub_chat, sub_chat_10, sub_chat_30) still accepted on write.

begin;

create or replace function public.admin_lounge_bot_save_settings(
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lounge_bot_accounts%rowtype;
  v_config jsonb;
  v_handle text;
  v_display_name text;
  v_min_edge numeric;
  v_key text;
  v_val jsonb;
  v_merged jsonb;
  v_live_edge numeric;
  v_hour_ev numeric;
  v_arb_pct numeric;
  v_radar_ev numeric;
  v_lounge boolean;
  v_sub_chat boolean;
  v_teaser int;
  v_legacy text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_user_id is null then raise exception 'p_user_id required'; end if;

  select * into v_row from public.lounge_bot_accounts where user_id = p_user_id;
  if not found then raise exception 'bot not found'; end if;

  v_config := coalesce(v_row.config, '{}'::jsonb);
  if p_patch ? 'config' and jsonb_typeof(p_patch->'config') = 'object' then
    v_config := v_config || (p_patch->'config');
  end if;

  if p_patch ? 'handle' then
    v_handle := lower(trim(p_patch->>'handle'));
    if v_handle is not null and v_handle <> '' and v_handle !~ '^[a-z0-9_]{2,30}$' then
      raise exception 'invalid handle';
    end if;
  end if;

  v_display_name := case
    when p_patch ? 'display_name' then nullif(trim(p_patch->>'display_name'), '')
    else null
  end;

  update public.lounge_bot_accounts
  set
    run_state = coalesce(nullif(p_patch->>'run_state', ''), run_state),
    display_name = coalesce(v_display_name, display_name),
    max_posts_per_day = coalesce((p_patch->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_hour = coalesce((p_patch->>'max_posts_per_hour')::int, max_posts_per_hour),
    publish_score_threshold = coalesce((p_patch->>'publish_score_threshold')::numeric, publish_score_threshold),
    category_pills_default = case
      when p_patch ? 'category_pills_default' and jsonb_typeof(p_patch->'category_pills_default') = 'array'
        then coalesce(
          (select array_agg(value)::text[] from jsonb_array_elements_text(p_patch->'category_pills_default')),
          category_pills_default
        )
      else category_pills_default
    end,
    config = v_config,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_row;

  update public.profiles
  set
    display_name = coalesce(v_display_name, display_name),
    handle = case when p_patch ? 'handle' then coalesce(nullif(v_handle, ''), handle) else handle end,
    avatar_url = case when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '') else avatar_url end,
    banner_url = case when p_patch ? 'banner_url' then nullif(p_patch->>'banner_url', '') else banner_url end,
    bio = case when p_patch ? 'bio' then left(nullif(trim(p_patch->>'bio'), ''), 160) else bio end,
    about_me = case when p_patch ? 'about_me' then left(nullif(trim(p_patch->>'about_me'), ''), 140) else about_me end,
    category_pills = case
      when p_patch ? 'category_pills' and jsonb_typeof(p_patch->'category_pills') = 'array'
        then coalesce(
          (select array_agg(distinct value)::text[] from jsonb_array_elements_text(p_patch->'category_pills')),
          category_pills
        )
      else category_pills
    end
  where user_id = p_user_id;

  if p_patch ? 'min_edge_pct' then
    if v_row.pipeline <> 'odds_api' then raise exception 'min_edge_pct applies to odds_api bots only'; end if;
    v_min_edge := (p_patch->>'min_edge_pct')::numeric;
    if v_min_edge is null or v_min_edge < 0.5 or v_min_edge > 15 then
      raise exception 'min_edge_pct must be between 0.5 and 15';
    end if;
    update public.lounge_bot_odds_config set min_edge_pct = round(v_min_edge, 2) where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  if p_patch ? 'alert_audience' then
    if v_row.pipeline <> 'odds_api' then raise exception 'alert_audience applies to odds_api bots only'; end if;
    if jsonb_typeof(p_patch->'alert_audience') <> 'object' then raise exception 'alert_audience must be a JSON object'; end if;
    select coalesce(o.alert_audience, '{}'::jsonb) into v_merged from public.lounge_bot_odds_config o where o.bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;

    for v_key, v_val in select key, value from jsonb_each(p_patch->'alert_audience') loop
      if v_key not in (
        'coffee_covers', 'edge', 'line_movement', 'in_game_edge', 'period_report',
        'best_bet_hour', 'arb_watch', 'sharp_report', 'value_bet_radar',
        'starter_spotlight', 'confirmed_starters', 'injury_impact', 'rest_travel_edge', 'fade_the_public'
      ) then
        raise exception 'invalid alert_audience key: %', v_key;
      end if;

      if jsonb_typeof(v_val) = 'object' then
        v_lounge := coalesce((v_val->>'lounge')::boolean, false);
        v_sub_chat := coalesce((v_val->>'sub_chat')::boolean, false);
        v_teaser := coalesce((v_val->>'lounge_teaser_pct')::int, 0);
        if v_teaser not in (0, 10, 30) then
          raise exception 'alert_audience.%.lounge_teaser_pct must be 0, 10, or 30', v_key;
        end if;
        if v_lounge then v_teaser := 0; end if;
        if v_teaser > 0 and not v_sub_chat then v_sub_chat := true; end if;
        if not v_lounge and not v_sub_chat then
          raise exception 'alert_audience.% must enable lounge and/or sub_chat', v_key;
        end if;
        v_merged := v_merged || jsonb_build_object(v_key, jsonb_build_object(
          'lounge', v_lounge,
          'sub_chat', v_sub_chat,
          'lounge_teaser_pct', v_teaser
        ));
      else
        v_legacy := trim(both '"' from v_val #>> '{}');
        v_legacy := case v_legacy
          when 'all' then 'lounge'
          when 'subscribers' then 'sub_chat'
          else v_legacy
        end;
        if v_legacy not in ('lounge', 'sub_chat', 'sub_chat_10', 'sub_chat_30') then
          raise exception 'alert_audience.% must be a route object or legacy lounge/sub_chat/sub_chat_10/sub_chat_30', v_key;
        end if;
        v_merged := v_merged || jsonb_build_object(v_key, to_jsonb(v_legacy));
      end if;
    end loop;

    update public.lounge_bot_odds_config set alert_audience = v_merged where bot_user_id = p_user_id;
  end if;

  if p_patch ? 'live_edge_enabled' or p_patch ? 'period_report_enabled'
     or p_patch ? 'min_live_edge_pct' or p_patch ? 'max_live_alerts_per_day'
     or p_patch ? 'max_period_reports_per_day' then
    if v_row.pipeline <> 'odds_api' then raise exception 'live content settings apply to odds_api bots only'; end if;
    if p_patch ? 'min_live_edge_pct' then
      v_live_edge := (p_patch->>'min_live_edge_pct')::numeric;
      if v_live_edge is null or v_live_edge < 2 or v_live_edge > 15 then raise exception 'min_live_edge_pct must be between 2 and 15'; end if;
    end if;
    update public.lounge_bot_odds_config
    set
      live_edge_enabled = case when p_patch ? 'live_edge_enabled' then (p_patch->>'live_edge_enabled')::boolean else live_edge_enabled end,
      period_report_enabled = case when p_patch ? 'period_report_enabled' then (p_patch->>'period_report_enabled')::boolean else period_report_enabled end,
      min_live_edge_pct = case when p_patch ? 'min_live_edge_pct' then round((p_patch->>'min_live_edge_pct')::numeric, 2) else min_live_edge_pct end,
      max_live_alerts_per_day = case when p_patch ? 'max_live_alerts_per_day' then (p_patch->>'max_live_alerts_per_day')::int else max_live_alerts_per_day end,
      max_period_reports_per_day = case when p_patch ? 'max_period_reports_per_day' then (p_patch->>'max_period_reports_per_day')::int else max_period_reports_per_day end
    where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  if p_patch ? 'best_bet_hour_enabled' or p_patch ? 'min_best_bet_hour_ev_pct' then
    if v_row.pipeline <> 'odds_api' then raise exception 'best bet hour settings apply to odds_api bots only'; end if;
    if p_patch ? 'min_best_bet_hour_ev_pct' then
      v_hour_ev := (p_patch->>'min_best_bet_hour_ev_pct')::numeric;
      if v_hour_ev is null or v_hour_ev < 2 or v_hour_ev > 15 then raise exception 'min_best_bet_hour_ev_pct must be between 2 and 15'; end if;
    end if;
    update public.lounge_bot_odds_config
    set
      best_bet_hour_enabled = case when p_patch ? 'best_bet_hour_enabled' then (p_patch->>'best_bet_hour_enabled')::boolean else best_bet_hour_enabled end,
      min_best_bet_hour_ev_pct = case when p_patch ? 'min_best_bet_hour_ev_pct' then round((p_patch->>'min_best_bet_hour_ev_pct')::numeric, 2) else min_best_bet_hour_ev_pct end
    where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  if p_patch ? 'arb_watch_enabled' or p_patch ? 'min_arb_profit_pct' or p_patch ? 'max_arb_alerts_per_day' then
    if v_row.pipeline <> 'odds_api' then raise exception 'arb watch settings apply to odds_api bots only'; end if;
    if p_patch ? 'min_arb_profit_pct' then
      v_arb_pct := (p_patch->>'min_arb_profit_pct')::numeric;
      if v_arb_pct is null or v_arb_pct < 1 or v_arb_pct > 10 then raise exception 'min_arb_profit_pct must be between 1 and 10'; end if;
    end if;
    update public.lounge_bot_odds_config
    set
      arb_watch_enabled = case when p_patch ? 'arb_watch_enabled' then (p_patch->>'arb_watch_enabled')::boolean else arb_watch_enabled end,
      min_arb_profit_pct = case when p_patch ? 'min_arb_profit_pct' then round((p_patch->>'min_arb_profit_pct')::numeric, 2) else min_arb_profit_pct end,
      max_arb_alerts_per_day = case when p_patch ? 'max_arb_alerts_per_day' then (p_patch->>'max_arb_alerts_per_day')::int else max_arb_alerts_per_day end
    where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  if p_patch ? 'sharp_report_enabled' or p_patch ? 'max_sharp_reports_per_day' then
    if v_row.pipeline <> 'odds_api' then raise exception 'sharp report settings apply to odds_api bots only'; end if;
    update public.lounge_bot_odds_config
    set
      sharp_report_enabled = case when p_patch ? 'sharp_report_enabled' then (p_patch->>'sharp_report_enabled')::boolean else sharp_report_enabled end,
      max_sharp_reports_per_day = case when p_patch ? 'max_sharp_reports_per_day' then (p_patch->>'max_sharp_reports_per_day')::int else max_sharp_reports_per_day end
    where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  if p_patch ? 'value_bet_radar_enabled' or p_patch ? 'min_value_bet_radar_ev_pct'
     or p_patch ? 'max_value_bet_radar_posts_per_day' then
    if v_row.pipeline <> 'odds_api' then raise exception 'value bet radar settings apply to odds_api bots only'; end if;
    if p_patch ? 'min_value_bet_radar_ev_pct' then
      v_radar_ev := (p_patch->>'min_value_bet_radar_ev_pct')::numeric;
      if v_radar_ev is null or v_radar_ev < 2 or v_radar_ev > 15 then raise exception 'min_value_bet_radar_ev_pct must be between 2 and 15'; end if;
    end if;
    update public.lounge_bot_odds_config
    set
      value_bet_radar_enabled = case when p_patch ? 'value_bet_radar_enabled' then (p_patch->>'value_bet_radar_enabled')::boolean else value_bet_radar_enabled end,
      min_value_bet_radar_ev_pct = case when p_patch ? 'min_value_bet_radar_ev_pct' then round((p_patch->>'min_value_bet_radar_ev_pct')::numeric, 2) else min_value_bet_radar_ev_pct end,
      max_value_bet_radar_posts_per_day = case when p_patch ? 'max_value_bet_radar_posts_per_day' then (p_patch->>'max_value_bet_radar_posts_per_day')::int else max_value_bet_radar_posts_per_day end
    where bot_user_id = p_user_id;
    if not found then raise exception 'odds config not found for this bot'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'run_state', v_row.run_state,
    'max_posts_per_day', v_row.max_posts_per_day,
    'max_posts_per_hour', v_row.max_posts_per_hour,
    'publish_score_threshold', v_row.publish_score_threshold,
    'min_edge_pct', (select o.min_edge_pct from public.lounge_bot_odds_config o where o.bot_user_id = p_user_id),
    'alert_audience', (select o.alert_audience from public.lounge_bot_odds_config o where o.bot_user_id = p_user_id)
  );
end;
$$;

comment on column public.lounge_bot_odds_config.alert_audience is
  'Per alert kind route: object { lounge, sub_chat, lounge_teaser_pct } and/or legacy string values.';

commit;
