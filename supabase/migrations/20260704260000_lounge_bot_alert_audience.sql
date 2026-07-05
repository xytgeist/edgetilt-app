-- Freemium alert routing: subscriber_only feed posts + per-alert audience config.
-- Live in-game edge + period/halftime reports (Scott Share).

-- ---------------------------------------------------------------------------
-- Feed: subscriber-only posts hidden from anon / non-subscribers via RLS
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts
  add column if not exists subscriber_only boolean not null default false;

comment on column public.community_feed_posts.subscriber_only is
  'When true, post is visible only to signed-in users with has_active_subscription or staff role.';

create or replace function public.lounge_viewer_is_subscriber_or_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (
          coalesce(p.has_active_subscription, false)
          or p.role in ('admin', 'moderator')
        )
    );
$$;

comment on function public.lounge_viewer_is_subscriber_or_staff() is
  'True when the current session may read subscriber_only lounge feed posts.';

drop policy if exists community_feed_posts_select_public on public.community_feed_posts;
create policy community_feed_posts_select_public on public.community_feed_posts
  for select to anon, authenticated
  using (
    hidden_at is null
    and (
      not coalesce(subscriber_only, false)
      or public.lounge_viewer_is_subscriber_or_staff()
    )
  );

-- ---------------------------------------------------------------------------
-- Odds bot: per-alert audience + live content toggles
-- ---------------------------------------------------------------------------
alter table public.lounge_bot_odds_config
  add column if not exists alert_audience jsonb not null default '{
    "coffee_covers": "all",
    "edge": "subscribers",
    "line_movement": "subscribers",
    "in_game_edge": "subscribers",
    "period_report": "subscribers"
  }'::jsonb;

alter table public.lounge_bot_odds_config
  add column if not exists live_edge_enabled boolean not null default true;

alter table public.lounge_bot_odds_config
  add column if not exists period_report_enabled boolean not null default true;

alter table public.lounge_bot_odds_config
  add column if not exists min_live_edge_pct numeric not null default 4
    check (min_live_edge_pct between 2 and 15);

alter table public.lounge_bot_odds_config
  add column if not exists max_live_alerts_per_day integer not null default 8
    check (max_live_alerts_per_day between 1 and 24);

alter table public.lounge_bot_odds_config
  add column if not exists max_period_reports_per_day integer not null default 6
    check (max_period_reports_per_day between 1 and 24);

comment on column public.lounge_bot_odds_config.alert_audience is
  'Per post_kind audience: "all" (public feed) or "subscribers". Keys: coffee_covers, edge, line_movement, in_game_edge, period_report.';

-- Period report dedupe: one report per game per period milestone.
create table if not exists public.lounge_odds_game_period_state (
  bot_user_id uuid not null references public.lounge_bot_accounts (user_id) on delete cascade,
  event_id text not null,
  sport_key text not null,
  last_period_key text not null default '',
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now(),
  primary key (bot_user_id, event_id)
);

create index if not exists lounge_odds_game_period_state_bot_updated_idx
  on public.lounge_odds_game_period_state (bot_user_id, updated_at desc);

alter table public.lounge_odds_game_period_state enable row level security;

drop policy if exists lounge_odds_game_period_state_admin_select on public.lounge_odds_game_period_state;
create policy lounge_odds_game_period_state_admin_select on public.lounge_odds_game_period_state
  for select to authenticated
  using (public.play_log_viewer_is_admin());

alter table public.lounge_bot_publish_log
  drop constraint if exists lounge_bot_publish_log_post_kind_check;

alter table public.lounge_bot_publish_log
  add constraint lounge_bot_publish_log_post_kind_check
  check (post_kind in (
    'edge', 'slate', 'coffee_covers', 'wire', 'x', 'other',
    'line_movement', 'sharp_move', 'steam', 'rlm',
    'in_game_edge', 'period_report'
  ));

-- ---------------------------------------------------------------------------
-- Portal save: alert_audience + live toggles
-- ---------------------------------------------------------------------------
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
  v_audience jsonb;
  v_key text;
  v_val text;
  v_merged jsonb;
  v_live_edge numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id required';
  end if;

  select * into v_row from public.lounge_bot_accounts where user_id = p_user_id;
  if not found then
    raise exception 'bot not found';
  end if;

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
    handle = case
      when p_patch ? 'handle' then coalesce(nullif(v_handle, ''), handle)
      else handle
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else avatar_url
    end,
    banner_url = case
      when p_patch ? 'banner_url' then nullif(p_patch->>'banner_url', '')
      else banner_url
    end,
    bio = case
      when p_patch ? 'bio' then left(nullif(trim(p_patch->>'bio'), ''), 160)
      else bio
    end,
    about_me = case
      when p_patch ? 'about_me' then left(nullif(trim(p_patch->>'about_me'), ''), 140)
      else about_me
    end,
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
    if v_row.pipeline <> 'odds_api' then
      raise exception 'min_edge_pct applies to odds_api bots only';
    end if;

    v_min_edge := (p_patch->>'min_edge_pct')::numeric;
    if v_min_edge is null or v_min_edge < 0.5 or v_min_edge > 15 then
      raise exception 'min_edge_pct must be between 0.5 and 15';
    end if;

    update public.lounge_bot_odds_config
    set min_edge_pct = round(v_min_edge, 2)
    where bot_user_id = p_user_id;

    if not found then
      raise exception 'odds config not found for this bot';
    end if;
  end if;

  if p_patch ? 'alert_audience' then
    if v_row.pipeline <> 'odds_api' then
      raise exception 'alert_audience applies to odds_api bots only';
    end if;
    if jsonb_typeof(p_patch->'alert_audience') <> 'object' then
      raise exception 'alert_audience must be a JSON object';
    end if;

    select coalesce(o.alert_audience, '{}'::jsonb) into v_merged
    from public.lounge_bot_odds_config o
    where o.bot_user_id = p_user_id;

    if not found then
      raise exception 'odds config not found for this bot';
    end if;

    for v_key, v_val in
      select key, value #>> '{}'
      from jsonb_each(p_patch->'alert_audience')
    loop
      if v_key not in ('coffee_covers', 'edge', 'line_movement', 'in_game_edge', 'period_report') then
        raise exception 'invalid alert_audience key: %', v_key;
      end if;
      if v_val not in ('all', 'subscribers') then
        raise exception 'alert_audience.% must be all or subscribers', v_key;
      end if;
      v_merged := v_merged || jsonb_build_object(v_key, v_val);
    end loop;

    update public.lounge_bot_odds_config
    set alert_audience = v_merged
    where bot_user_id = p_user_id;
  end if;

  if p_patch ? 'live_edge_enabled' or p_patch ? 'period_report_enabled'
     or p_patch ? 'min_live_edge_pct' or p_patch ? 'max_live_alerts_per_day'
     or p_patch ? 'max_period_reports_per_day' then
    if v_row.pipeline <> 'odds_api' then
      raise exception 'live content settings apply to odds_api bots only';
    end if;

    if p_patch ? 'min_live_edge_pct' then
      v_live_edge := (p_patch->>'min_live_edge_pct')::numeric;
      if v_live_edge is null or v_live_edge < 2 or v_live_edge > 15 then
        raise exception 'min_live_edge_pct must be between 2 and 15';
      end if;
    end if;

    update public.lounge_bot_odds_config
    set
      live_edge_enabled = case
        when p_patch ? 'live_edge_enabled' then (p_patch->>'live_edge_enabled')::boolean
        else live_edge_enabled
      end,
      period_report_enabled = case
        when p_patch ? 'period_report_enabled' then (p_patch->>'period_report_enabled')::boolean
        else period_report_enabled
      end,
      min_live_edge_pct = case
        when p_patch ? 'min_live_edge_pct' then round((p_patch->>'min_live_edge_pct')::numeric, 2)
        else min_live_edge_pct
      end,
      max_live_alerts_per_day = case
        when p_patch ? 'max_live_alerts_per_day' then (p_patch->>'max_live_alerts_per_day')::int
        else max_live_alerts_per_day
      end,
      max_period_reports_per_day = case
        when p_patch ? 'max_period_reports_per_day' then (p_patch->>'max_period_reports_per_day')::int
        else max_period_reports_per_day
      end
    where bot_user_id = p_user_id;

    if not found then
      raise exception 'odds config not found for this bot';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'run_state', v_row.run_state,
    'max_posts_per_day', v_row.max_posts_per_day,
    'max_posts_per_hour', v_row.max_posts_per_hour,
    'publish_score_threshold', v_row.publish_score_threshold,
    'min_edge_pct', (
      select o.min_edge_pct
      from public.lounge_bot_odds_config o
      where o.bot_user_id = p_user_id
    ),
    'alert_audience', (
      select o.alert_audience
      from public.lounge_bot_odds_config o
      where o.bot_user_id = p_user_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal snapshot: expose alert_audience + live settings
-- ---------------------------------------------------------------------------
create or replace function public.admin_lounge_bot_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  v_hour_start timestamptz := v_now - interval '1 hour';
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'editorial_pending', (
      select count(*)::int from public.lounge_bot_queue q where q.status = 'pending_review'
    ),
    'editorial_scheduled', (
      select count(*)::int from public.lounge_bot_queue q where q.status = 'scheduled'
    ),
    'bots', coalesce((
      select jsonb_agg(bot_row order by bot_row->>'slug')
      from (
        select jsonb_build_object(
          'user_id', a.user_id,
          'slug', a.slug,
          'pipeline', a.pipeline,
          'review_mode', a.review_mode,
          'display_name', a.display_name,
          'run_state', a.run_state,
          'enabled', a.enabled,
          'max_posts_per_day', a.max_posts_per_day,
          'max_posts_per_hour', a.max_posts_per_hour,
          'publish_score_threshold', a.publish_score_threshold,
          'category_pills_default', coalesce(a.category_pills_default, '{}'::text[]),
          'config', coalesce(a.config, '{}'::jsonb),
          'last_poll_at', a.last_poll_at,
          'last_publish_at', a.last_publish_at,
          'created_at', a.created_at,
          'handle', p.handle,
          'avatar_url', p.avatar_url,
          'banner_url', p.banner_url,
          'bio', p.bio,
          'about_me', p.about_me,
          'is_bot', coalesce(p.is_bot, false),
          'pending_review', (
            select count(*)::int from public.lounge_bot_queue q
            where q.bot_user_id = a.user_id and q.status = 'pending_review'
          ),
          'posts_today', (
            select count(*)::int from public.lounge_bot_publish_log l
            where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_day_start
          ),
          'posts_last_hour', (
            select count(*)::int from public.lounge_bot_publish_log l
            where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_hour_start
          ),
          'odds_config', (
            select jsonb_build_object(
              'min_edge_pct', o.min_edge_pct,
              'sports_keys', o.sports_keys,
              'regions', o.regions,
              'markets', o.markets,
              'max_picks_per_run', o.max_picks_per_run,
              'max_edge_alerts_per_day', o.max_edge_alerts_per_day,
              'max_slate_posts_per_day', o.max_slate_posts_per_day,
              'daily_slate_enabled', o.daily_slate_enabled,
              'coffee_covers_enabled', o.coffee_covers_enabled,
              'line_movement_enabled', o.line_movement_enabled,
              'max_line_alerts_per_day', o.max_line_alerts_per_day,
              'min_spread_move_pts', o.min_spread_move_pts,
              'min_total_move_pts', o.min_total_move_pts,
              'min_ml_move_pts', o.min_ml_move_pts,
              'alert_audience', o.alert_audience,
              'live_edge_enabled', o.live_edge_enabled,
              'period_report_enabled', o.period_report_enabled,
              'min_live_edge_pct', o.min_live_edge_pct,
              'max_live_alerts_per_day', o.max_live_alerts_per_day,
              'max_period_reports_per_day', o.max_period_reports_per_day,
              'enabled', o.enabled
            )
            from public.lounge_bot_odds_config o
            where o.bot_user_id = a.user_id
          ),
          'sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'name', s.name, 'kind', s.kind, 'enabled', s.enabled,
              'poll_interval_sec', s.poll_interval_sec, 'last_polled_at', s.last_polled_at,
              'last_error', s.last_error
            ) order by s.name)
            from public.lounge_news_sources s where s.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'x_sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', xs.id, 'x_handle', xs.x_handle, 'enabled', xs.enabled,
              'last_polled_at', xs.last_polled_at, 'last_error', xs.last_error
            ) order by xs.x_handle)
            from public.lounge_bot_x_sources xs where xs.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'recent_posts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'post_id', c.id, 'caption', c.caption,
              'category_pills', coalesce(c.category_pills, '{}'::text[]),
              'subscriber_only', coalesce(c.subscriber_only, false),
              'created_at', c.created_at, 'edited_at', c.edited_at,
              'like_count', c.like_count, 'comment_count', c.comment_count
            ) order by c.created_at desc)
            from (
              select c.* from public.community_feed_posts c
              where c.user_id = a.user_id and c.hidden_at is null
              order by c.created_at desc limit 20
            ) c
          ), '[]'::jsonb),
          'recent_log', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id, 'status', l.status, 'caption', left(l.caption, 240),
              'score', l.score, 'post_id', l.post_id, 'post_kind', l.post_kind,
              'error_message', l.error_message,
              'created_at', l.created_at
            ) order by l.created_at desc)
            from (
              select l.* from public.lounge_bot_publish_log l
              where l.bot_user_id = a.user_id order by l.created_at desc limit 15
            ) l
          ), '[]'::jsonb)
        ) as bot_row
        from public.lounge_bot_accounts a
        left join public.profiles p on p.user_id = a.user_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;
