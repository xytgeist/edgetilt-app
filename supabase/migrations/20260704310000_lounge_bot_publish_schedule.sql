-- Human-paced Scott Share publishing — stagger odds alerts via scheduled queue + minute drain.
-- Apply after 20260704300000. Redeploy lounge-odds-poll + lounge-bot-publish-due after apply.

alter table public.lounge_bot_odds_config
  add column if not exists min_post_gap_minutes integer not null default 8
    check (min_post_gap_minutes between 3 and 30);

comment on column public.lounge_bot_odds_config.min_post_gap_minutes is
  'Minimum minutes between Scott Share feed posts (queue spacing for natural cadence).';

create table if not exists public.lounge_bot_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  bot_user_id uuid not null references auth.users(id) on delete cascade,
  caption text not null,
  category_pills text[] not null default '{}',
  subscriber_only boolean not null default false,
  post_kind text not null,
  dedupe_key text,
  score numeric,
  publish_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'failed', 'cancelled')),
  post_id uuid references public.community_feed_posts(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists lounge_bot_scheduled_posts_due_idx
  on public.lounge_bot_scheduled_posts (publish_at asc)
  where status = 'pending';

create unique index if not exists lounge_bot_scheduled_posts_pending_dedupe_idx
  on public.lounge_bot_scheduled_posts (bot_user_id, dedupe_key)
  where status = 'pending' and dedupe_key is not null;

alter table public.lounge_bot_scheduled_posts enable row level security;

comment on table public.lounge_bot_scheduled_posts is
  'Delayed Scott Share odds alerts — drained by lounge-bot-publish-due (publishScheduledOdds).';

create or replace function public.invoke_lounge_bot_publish_scheduled()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  service_key text;
  base_url text;
  req_id bigint;
begin
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
    raise warning 'invoke_lounge_bot_publish_scheduled: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_bot_publish_scheduled: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  begin
    select
      net.http_post(
        url := base_url || '/functions/v1/lounge-bot-publish-due',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object('publishScheduledOdds', true),
        timeout_milliseconds := 120000
      )
    into req_id;
  exception
    when others then
      raise warning 'invoke_lounge_bot_publish_scheduled: %', sqlerrm;
  end;
exception
  when others then
    raise warning 'invoke_lounge_bot_publish_scheduled: %', sqlerrm;
end;
$$;

comment on function public.invoke_lounge_bot_publish_scheduled() is
  'pg_cron helper: drain due lounge_bot_scheduled_posts via lounge-bot-publish-due.';

revoke all on function public.invoke_lounge_bot_publish_scheduled() from public;
grant execute on function public.invoke_lounge_bot_publish_scheduled() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_bot_publish_scheduled_odds'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'lounge_bot_publish_scheduled_odds',
  '* * * * *',
  $$select public.invoke_lounge_bot_publish_scheduled();$$
);

-- Portal snapshot: expose min_post_gap_minutes
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
    'editorial_pending', (select count(*)::int from public.lounge_bot_queue q where q.status = 'pending_review'),
    'editorial_scheduled', (select count(*)::int from public.lounge_bot_queue q where q.status = 'scheduled'),
    'bots', coalesce((
      select jsonb_agg(bot_row order by bot_row->>'slug')
      from (
        select jsonb_build_object(
          'user_id', a.user_id, 'slug', a.slug, 'pipeline', a.pipeline, 'review_mode', a.review_mode,
          'display_name', a.display_name, 'run_state', a.run_state, 'enabled', a.enabled,
          'max_posts_per_day', a.max_posts_per_day, 'max_posts_per_hour', a.max_posts_per_hour,
          'publish_score_threshold', a.publish_score_threshold,
          'category_pills_default', coalesce(a.category_pills_default, '{}'::text[]),
          'config', coalesce(a.config, '{}'::jsonb),
          'last_poll_at', a.last_poll_at, 'last_publish_at', a.last_publish_at, 'created_at', a.created_at,
          'handle', p.handle, 'avatar_url', p.avatar_url, 'banner_url', p.banner_url,
          'bio', p.bio, 'about_me', p.about_me, 'is_bot', coalesce(p.is_bot, false),
          'pending_review', (select count(*)::int from public.lounge_bot_queue q where q.bot_user_id = a.user_id and q.status = 'pending_review'),
          'posts_today', (select count(*)::int from public.lounge_bot_publish_log l where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_day_start),
          'posts_last_hour', (select count(*)::int from public.lounge_bot_publish_log l where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_hour_start),
          'scheduled_posts_pending', (select count(*)::int from public.lounge_bot_scheduled_posts s where s.bot_user_id = a.user_id and s.status = 'pending'),
          'odds_config', (
            select jsonb_build_object(
              'min_edge_pct', o.min_edge_pct, 'sports_keys', o.sports_keys, 'regions', o.regions, 'markets', o.markets,
              'max_picks_per_run', o.max_picks_per_run, 'max_edge_alerts_per_day', o.max_edge_alerts_per_day,
              'max_slate_posts_per_day', o.max_slate_posts_per_day, 'daily_slate_enabled', o.daily_slate_enabled,
              'coffee_covers_enabled', o.coffee_covers_enabled, 'line_movement_enabled', o.line_movement_enabled,
              'max_line_alerts_per_day', o.max_line_alerts_per_day, 'min_spread_move_pts', o.min_spread_move_pts,
              'min_total_move_pts', o.min_total_move_pts, 'min_ml_move_pts', o.min_ml_move_pts,
              'alert_audience', o.alert_audience, 'live_edge_enabled', o.live_edge_enabled,
              'period_report_enabled', o.period_report_enabled, 'min_live_edge_pct', o.min_live_edge_pct,
              'max_live_alerts_per_day', o.max_live_alerts_per_day, 'max_period_reports_per_day', o.max_period_reports_per_day,
              'best_bet_hour_enabled', o.best_bet_hour_enabled, 'min_best_bet_hour_ev_pct', o.min_best_bet_hour_ev_pct,
              'arb_watch_enabled', o.arb_watch_enabled, 'min_arb_profit_pct', o.min_arb_profit_pct,
              'max_arb_alerts_per_day', o.max_arb_alerts_per_day,
              'sharp_report_enabled', o.sharp_report_enabled, 'max_sharp_reports_per_day', o.max_sharp_reports_per_day,
              'value_bet_radar_enabled', o.value_bet_radar_enabled,
              'min_value_bet_radar_ev_pct', o.min_value_bet_radar_ev_pct,
              'max_value_bet_radar_posts_per_day', o.max_value_bet_radar_posts_per_day,
              'min_post_gap_minutes', o.min_post_gap_minutes,
              'enabled', o.enabled
            )
            from public.lounge_bot_odds_config o where o.bot_user_id = a.user_id
          ),
          'sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'name', s.name, 'kind', s.kind, 'enabled', s.enabled,
              'poll_interval_sec', s.poll_interval_sec, 'last_polled_at', s.last_polled_at, 'last_error', s.last_error
            ) order by s.name) from public.lounge_news_sources s where s.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'x_sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', xs.id, 'x_handle', xs.x_handle, 'enabled', xs.enabled,
              'last_polled_at', xs.last_polled_at, 'last_error', xs.last_error
            ) order by xs.x_handle) from public.lounge_bot_x_sources xs where xs.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'recent_posts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'post_id', c.id, 'caption', c.caption, 'category_pills', coalesce(c.category_pills, '{}'::text[]),
              'subscriber_only', coalesce(c.subscriber_only, false), 'created_at', c.created_at,
              'edited_at', c.edited_at, 'like_count', c.like_count, 'comment_count', c.comment_count
            ) order by c.created_at desc)
            from (select c.* from public.community_feed_posts c where c.user_id = a.user_id and c.hidden_at is null order by c.created_at desc limit 20) c
          ), '[]'::jsonb),
          'recent_log', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id, 'status', l.status, 'caption', left(l.caption, 240), 'score', l.score,
              'post_id', l.post_id, 'post_kind', l.post_kind, 'error_message', l.error_message, 'created_at', l.created_at
            ) order by l.created_at desc)
            from (select l.* from public.lounge_bot_publish_log l where l.bot_user_id = a.user_id order by l.created_at desc limit 15) l
          ), '[]'::jsonb)
        ) as bot_row
        from public.lounge_bot_accounts a
        left join public.profiles p on p.user_id = a.user_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;
