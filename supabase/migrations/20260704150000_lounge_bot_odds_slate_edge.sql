-- Odds bot slate check-ins + edge alerts: publish log metadata + config caps.

alter table public.lounge_bot_publish_log
  add column if not exists post_kind text check (post_kind in ('edge', 'slate', 'wire', 'x', 'other'));

alter table public.lounge_bot_publish_log
  add column if not exists dedupe_key text;

create index if not exists lounge_bot_publish_log_bot_dedupe_idx
  on public.lounge_bot_publish_log (bot_user_id, dedupe_key, created_at desc)
  where dedupe_key is not null and status = 'published';

alter table public.lounge_bot_odds_config
  add column if not exists max_edge_alerts_per_day integer not null default 6
    check (max_edge_alerts_per_day between 1 and 24);

alter table public.lounge_bot_odds_config
  add column if not exists max_slate_posts_per_day integer not null default 10
    check (max_slate_posts_per_day between 1 and 24);

alter table public.lounge_bot_odds_config
  add column if not exists daily_slate_enabled boolean not null default true;

comment on column public.lounge_bot_odds_config.daily_slate_enabled is
  'When true, daily_slates poll action posts one slate check-in per calendar sport per day.';

-- Extend portal snapshot odds_config fields for slate/edge caps.
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
