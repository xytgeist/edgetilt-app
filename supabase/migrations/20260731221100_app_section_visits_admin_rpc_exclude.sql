create or replace function public.admin_ops_app_section_usage_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_7d timestamptz := v_now - interval '7 days';
  v_sections jsonb;
  v_unique_24h int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select count(distinct v.user_id)::int
  into v_unique_24h
  from public.app_section_visits v
  where v.visited_at >= v_24h
    and v.event_kind = 'visit'
    and v.sub_section_id is null
    and not public.app_product_analytics_user_excluded(v.user_id);

  select coalesce(jsonb_agg(row order by (row->>'sort')::int), '[]'::jsonb)
  into v_sections
  from (
    select jsonb_build_object(
      'section_id', s.section_id,
      'label', s.label,
      'sort', s.sort,
      'visits_24h', coalesce(stats.visits_24h, 0),
      'visits_7d', coalesce(stats.visits_7d, 0),
      'unique_users_24h', coalesce(stats.unique_users_24h, 0),
      'unique_users_7d', coalesce(stats.unique_users_7d, 0),
      'sessions_24h', coalesce(session_stats.sessions_24h, 0),
      'sessions_7d', coalesce(session_stats.sessions_7d, 0),
      'session_users_24h', coalesce(session_stats.session_users_24h, 0),
      'session_users_7d', coalesce(session_stats.session_users_7d, 0),
      'visit_breakdown', coalesce(visit_breakdown.rows, '[]'::jsonb),
      'session_breakdown', coalesce(session_breakdown.rows, '[]'::jsonb)
    ) as row
    from (
      values
        ('lounge', 'Lounge', 1),
        ('chat', 'Chat', 2),
        ('slots-hub', 'Slots hub', 3),
        ('guides', 'Guides', 4),
        ('calculators', 'Calculators', 5),
        ('bankroll', 'Bankroll', 6),
        ('play-logbook', 'Play Logbook', 7),
        ('offers', 'Offers', 8),
        ('poker-hub', 'Poker hub', 9),
        ('poker-bankroll', 'Poker Bankroll', 10),
        ('poker-stable', 'Poker Stable', 11),
        ('intel', 'Intel', 12),
        ('affiliates', 'Affiliates', 13),
        ('creator', 'Creator portal', 14)
    ) as s(section_id, label, sort)
    left join lateral (
      select
        count(*) filter (where v.visited_at >= v_24h)::int as visits_24h,
        count(*) filter (where v.visited_at >= v_7d)::int as visits_7d,
        count(distinct v.user_id) filter (where v.visited_at >= v_24h)::int as unique_users_24h,
        count(distinct v.user_id) filter (where v.visited_at >= v_7d)::int as unique_users_7d
      from public.app_section_visits v
      where v.section_id = s.section_id
        and v.event_kind = 'visit'
        and v.sub_section_id is null
        and v.visited_at >= v_7d
        and not public.app_product_analytics_user_excluded(v.user_id)
    ) stats on true
    left join lateral (
      select
        count(*) filter (where v.visited_at >= v_24h)::int as sessions_24h,
        count(*) filter (where v.visited_at >= v_7d)::int as sessions_7d,
        count(distinct v.user_id) filter (where v.visited_at >= v_24h)::int as session_users_24h,
        count(distinct v.user_id) filter (where v.visited_at >= v_7d)::int as session_users_7d
      from public.app_section_visits v
      where v.section_id = s.section_id
        and v.event_kind = 'session_recorded'
        and v.visited_at >= v_7d
        and not public.app_product_analytics_user_excluded(v.user_id)
    ) session_stats on s.section_id in ('play-logbook', 'poker-bankroll')
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'sub_section_id', b.sub_section_id,
          'label', b.label,
          'visits_24h', b.visits_24h,
          'visits_7d', b.visits_7d,
          'unique_users_24h', b.unique_users_24h,
          'unique_users_7d', b.unique_users_7d
        )
        order by b.visits_7d desc, b.label asc
      ), '[]'::jsonb) as rows
      from (
        select
          v.sub_section_id,
          initcap(replace(v.sub_section_id, '-', ' ')) as label,
          count(*) filter (where v.visited_at >= v_24h)::int as visits_24h,
          count(*) filter (where v.visited_at >= v_7d)::int as visits_7d,
          count(distinct v.user_id) filter (where v.visited_at >= v_24h)::int as unique_users_24h,
          count(distinct v.user_id) filter (where v.visited_at >= v_7d)::int as unique_users_7d
        from public.app_section_visits v
        where v.section_id = s.section_id
          and v.event_kind = 'visit'
          and v.sub_section_id is not null
          and v.visited_at >= v_7d
          and not public.app_product_analytics_user_excluded(v.user_id)
        group by v.sub_section_id
      ) b
    ) visit_breakdown on s.section_id = 'calculators'
    left join lateral (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'sub_section_id', b.sub_section_id,
          'label', b.label,
          'sessions_24h', b.sessions_24h,
          'sessions_7d', b.sessions_7d,
          'session_users_24h', b.session_users_24h,
          'session_users_7d', b.session_users_7d
        )
        order by b.sessions_7d desc, b.label asc
      ), '[]'::jsonb) as rows
      from (
        select
          v.sub_section_id,
          case
            when s.section_id = 'poker-bankroll' and v.sub_section_id = 'cash' then 'Cash game'
            when s.section_id = 'poker-bankroll' and v.sub_section_id = 'tournament' then 'Tournament'
            else coalesce(tpl.display_name, v.sub_section_id)
          end as label,
          count(*) filter (where v.visited_at >= v_24h)::int as sessions_24h,
          count(*) filter (where v.visited_at >= v_7d)::int as sessions_7d,
          count(distinct v.user_id) filter (where v.visited_at >= v_24h)::int as session_users_24h,
          count(distinct v.user_id) filter (where v.visited_at >= v_7d)::int as session_users_7d
        from public.app_section_visits v
        left join public.play_log_game_templates tpl
          on s.section_id = 'play-logbook'
         and tpl.id::text = v.sub_section_id
        where v.section_id = s.section_id
          and v.event_kind = 'session_recorded'
          and v.sub_section_id is not null
          and v.visited_at >= v_7d
          and not public.app_product_analytics_user_excluded(v.user_id)
        group by v.sub_section_id, tpl.display_name
      ) b
    ) session_breakdown on s.section_id in ('play-logbook', 'poker-bankroll')
  ) t;

  return jsonb_build_object(
    'generated_at', v_now,
    'unique_users_24h', coalesce(v_unique_24h, 0),
    'sections', v_sections
  );
end;
$$;
