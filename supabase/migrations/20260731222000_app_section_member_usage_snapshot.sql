create or replace function public.admin_ops_app_section_member_usage_snapshot(
  p_lookup_handle text default null,
  p_top_limit int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_7d timestamptz := v_now - interval '7 days';
  v_lookup text := lower(btrim(regexp_replace(coalesce(p_lookup_handle, ''), '^@+', '')));
  v_limit int := greatest(1, least(coalesce(p_top_limit, 25), 100));
  v_top jsonb;
  v_member jsonb;
  v_target_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select coalesce(jsonb_agg(row order by (row->>'events_7d')::int desc, (row->>'handle') asc), '[]'::jsonb)
  into v_top
  from (
    select jsonb_build_object(
      'user_id', agg.user_id,
      'handle', agg.handle,
      'display_name', agg.display_name,
      'events_24h', agg.events_24h,
      'events_7d', agg.events_7d,
      'tab_visits_7d', agg.tab_visits_7d,
      'sessions_7d', agg.sessions_7d,
      'top_section_id', coalesce(top_section.section_id, ''),
      'top_section_label', coalesce(top_section.label, ''),
      'last_active_at', agg.last_active_at
    ) as row
    from (
      select
        v.user_id,
        p.handle,
        p.display_name,
        count(*) filter (where v.visited_at >= v_24h)::int as events_24h,
        count(*) filter (where v.visited_at >= v_7d)::int as events_7d,
        count(*) filter (
          where v.visited_at >= v_7d
            and v.event_kind = 'visit'
            and v.sub_section_id is null
        )::int as tab_visits_7d,
        count(*) filter (
          where v.visited_at >= v_7d
            and v.event_kind = 'session_recorded'
        )::int as sessions_7d,
        max(v.visited_at) as last_active_at
      from public.app_section_visits v
      join public.profiles p on p.user_id = v.user_id
      where v.visited_at >= v_7d
        and not public.app_product_analytics_user_excluded(v.user_id)
      group by v.user_id, p.handle, p.display_name
      order by events_7d desc, tab_visits_7d desc, p.handle asc
      limit v_limit
    ) agg
    left join lateral (
      select s.section_id, s.label
      from public.app_section_visits v
      join (
        values
          ('lounge', 'Lounge'),
          ('chat', 'Chat'),
          ('slots-hub', 'Slots hub'),
          ('guides', 'Guides'),
          ('calculators', 'Calculators'),
          ('bankroll', 'Bankroll'),
          ('play-logbook', 'Play Logbook'),
          ('offers', 'Offers'),
          ('poker-hub', 'Poker hub'),
          ('poker-bankroll', 'Poker Bankroll'),
          ('poker-stable', 'Poker Stable'),
          ('affiliates', 'Affiliates'),
          ('creator', 'Creator portal')
      ) as s(section_id, label) on s.section_id = v.section_id
      where v.user_id = agg.user_id
        and v.visited_at >= v_7d
        and not public.app_product_analytics_user_excluded(v.user_id)
      group by s.section_id, s.label
      order by count(*) desc, s.label asc
      limit 1
    ) top_section on true
  ) t;

  if v_lookup <> '' then
    select p.user_id
    into v_target_user_id
    from public.profiles p
    where lower(btrim(coalesce(p.handle, ''))) = v_lookup
    limit 1;

    if v_target_user_id is not null
      and not public.app_product_analytics_user_excluded(v_target_user_id)
    then
      select jsonb_build_object(
        'user_id', p.user_id,
        'handle', p.handle,
        'display_name', p.display_name,
        'events_24h', coalesce(stats.events_24h, 0),
        'events_7d', coalesce(stats.events_7d, 0),
        'tab_visits_24h', coalesce(stats.tab_visits_24h, 0),
        'tab_visits_7d', coalesce(stats.tab_visits_7d, 0),
        'sessions_24h', coalesce(stats.sessions_24h, 0),
        'sessions_7d', coalesce(stats.sessions_7d, 0),
        'last_active_at', stats.last_active_at,
        'sections', coalesce(section_rows.rows, '[]'::jsonb),
        'calculators', coalesce(calc_rows.rows, '[]'::jsonb),
        'session_breakdown', coalesce(session_rows.rows, '[]'::jsonb)
      )
      into v_member
      from public.profiles p
      left join lateral (
        select
          count(*) filter (where v.visited_at >= v_24h)::int as events_24h,
          count(*) filter (where v.visited_at >= v_7d)::int as events_7d,
          count(*) filter (
            where v.visited_at >= v_24h
              and v.event_kind = 'visit'
              and v.sub_section_id is null
          )::int as tab_visits_24h,
          count(*) filter (
            where v.visited_at >= v_7d
              and v.event_kind = 'visit'
              and v.sub_section_id is null
          )::int as tab_visits_7d,
          count(*) filter (
            where v.visited_at >= v_24h and v.event_kind = 'session_recorded'
          )::int as sessions_24h,
          count(*) filter (
            where v.visited_at >= v_7d and v.event_kind = 'session_recorded'
          )::int as sessions_7d,
          max(v.visited_at) as last_active_at
        from public.app_section_visits v
        where v.user_id = p.user_id
          and v.visited_at >= v_7d
      ) stats on true
      left join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'section_id', s.section_id,
            'label', s.label,
            'visits_7d', coalesce(row_stats.visits_7d, 0),
            'sessions_7d', coalesce(row_stats.sessions_7d, 0)
          )
          order by coalesce(row_stats.visits_7d, 0) + coalesce(row_stats.sessions_7d, 0) desc, s.label asc
        ), '[]'::jsonb) as rows
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
            ('affiliates', 'Affiliates', 12),
            ('creator', 'Creator portal', 13)
        ) as s(section_id, label, sort)
        left join lateral (
          select
            count(*) filter (
              where v.event_kind = 'visit'
                and v.sub_section_id is null
            )::int as visits_7d,
            count(*) filter (where v.event_kind = 'session_recorded')::int as sessions_7d
          from public.app_section_visits v
          where v.user_id = p.user_id
            and v.section_id = s.section_id
            and v.visited_at >= v_7d
        ) row_stats on true
        where coalesce(row_stats.visits_7d, 0) > 0
           or coalesce(row_stats.sessions_7d, 0) > 0
      ) section_rows on true
      left join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'sub_section_id', b.sub_section_id,
            'label', initcap(replace(b.sub_section_id, '-', ' ')),
            'visits_7d', b.visits_7d
          )
          order by b.visits_7d desc, b.sub_section_id asc
        ), '[]'::jsonb) as rows
        from (
          select
            v.sub_section_id,
            count(*)::int as visits_7d
          from public.app_section_visits v
          where v.user_id = p.user_id
            and v.section_id = 'calculators'
            and v.event_kind = 'visit'
            and v.sub_section_id is not null
            and v.visited_at >= v_7d
          group by v.sub_section_id
        ) b
      ) calc_rows on true
      left join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'section_id', b.section_id,
            'label', b.label,
            'sub_section_id', b.sub_section_id,
            'sub_label', b.sub_label,
            'sessions_7d', b.sessions_7d
          )
          order by b.sessions_7d desc, b.label asc
        ), '[]'::jsonb) as rows
        from (
          select
            v.section_id,
            case v.section_id
              when 'play-logbook' then 'Play Logbook'
              when 'poker-bankroll' then 'Poker Bankroll'
              else v.section_id
            end as label,
            v.sub_section_id,
            case
              when v.section_id = 'poker-bankroll' and v.sub_section_id = 'cash' then 'Cash game'
              when v.section_id = 'poker-bankroll' and v.sub_section_id = 'tournament' then 'Tournament'
              else coalesce(tpl.display_name, v.sub_section_id)
            end as sub_label,
            count(*)::int as sessions_7d
          from public.app_section_visits v
          left join public.play_log_game_templates tpl
            on v.section_id = 'play-logbook'
           and tpl.id::text = v.sub_section_id
          where v.user_id = p.user_id
            and v.event_kind = 'session_recorded'
            and v.visited_at >= v_7d
          group by v.section_id, v.sub_section_id, tpl.display_name
        ) b
      ) session_rows on true
      where p.user_id = v_target_user_id;
    elsif v_target_user_id is not null then
      v_member := jsonb_build_object(
        'excluded', true,
        'handle', v_lookup
      );
    else
      v_member := jsonb_build_object(
        'not_found', true,
        'handle', v_lookup
      );
    end if;
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'top_limit', v_limit,
    'lookup_handle', nullif(v_lookup, ''),
    'top_members', v_top,
    'member', v_member
  );
end;
$$;

comment on function public.admin_ops_app_section_member_usage_snapshot(text, int) is
  'Admin-only: top active members (7d) + optional handle lookup with section/calculator/session breakdown.';
