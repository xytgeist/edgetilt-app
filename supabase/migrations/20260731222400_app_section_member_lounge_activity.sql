-- Lounge posts + interaction counts on member activity breakdown.

create or replace function public.app_product_analytics_member_lounge_activity(
  p_user_id uuid,
  p_since_24h timestamptz,
  p_since_7d timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v24 int;
  v7 int;
begin
  if p_user_id is null then
    return '[]'::jsonb;
  end if;

  select
    count(*) filter (where p.created_at >= p_since_24h)::int,
    count(*) filter (where p.created_at >= p_since_7d)::int
  into v24, v7
  from public.community_feed_posts p
  where p.user_id = p_user_id
    and p.hidden_at is null
    and p.repost_of_post_id is null
    and p.repost_of_comment_id is null
    and coalesce(p.thread_part_index, 0) = 0
    and p.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'posts_original',
      'label', 'Original posts',
      'group', 'created',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where p.created_at >= p_since_24h)::int,
    count(*) filter (where p.created_at >= p_since_7d)::int
  into v24, v7
  from public.community_feed_posts p
  where p.user_id = p_user_id
    and p.hidden_at is null
    and (
      p.repost_of_post_id is not null
      or p.repost_of_comment_id is not null
      or coalesce(p.is_plain_repost, false) = true
    )
    and p.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'posts_repost_quote',
      'label', 'Reposts / quotes',
      'group', 'created',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where c.created_at >= p_since_24h)::int,
    count(*) filter (where c.created_at >= p_since_7d)::int
  into v24, v7
  from public.feed_comments c
  where c.user_id = p_user_id
    and c.hidden_at is null
    and c.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'comments',
      'label', 'Comments',
      'group', 'created',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where pl.created_at >= p_since_24h)::int,
    count(*) filter (where pl.created_at >= p_since_7d)::int
  into v24, v7
  from public.post_likes pl
  where pl.user_id = p_user_id
    and pl.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'post_likes_given',
      'label', 'Post likes',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where pr.created_at >= p_since_24h)::int,
    count(*) filter (where pr.created_at >= p_since_7d)::int
  into v24, v7
  from public.post_reposts pr
  where pr.user_id = p_user_id
    and pr.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'post_reposts_given',
      'label', 'Post reposts',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where pb.created_at >= p_since_24h)::int,
    count(*) filter (where pb.created_at >= p_since_7d)::int
  into v24, v7
  from public.post_bookmarks pb
  where pb.user_id = p_user_id
    and pb.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'post_bookmarks_given',
      'label', 'Post bookmarks',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where cl.created_at >= p_since_24h)::int,
    count(*) filter (where cl.created_at >= p_since_7d)::int
  into v24, v7
  from public.feed_comment_likes cl
  where cl.user_id = p_user_id
    and cl.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'comment_likes_given',
      'label', 'Comment likes',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where cr.created_at >= p_since_24h)::int,
    count(*) filter (where cr.created_at >= p_since_7d)::int
  into v24, v7
  from public.feed_comment_reposts cr
  where cr.user_id = p_user_id
    and cr.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'comment_reposts_given',
      'label', 'Comment reposts',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where cb.created_at >= p_since_24h)::int,
    count(*) filter (where cb.created_at >= p_since_7d)::int
  into v24, v7
  from public.feed_comment_bookmarks cb
  where cb.user_id = p_user_id
    and cb.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'comment_bookmarks_given',
      'label', 'Comment bookmarks',
      'group', 'interactions_given',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where pl.created_at >= p_since_24h)::int,
    count(*) filter (where pl.created_at >= p_since_7d)::int
  into v24, v7
  from public.post_likes pl
  join public.community_feed_posts p on p.id = pl.post_id
  where p.user_id = p_user_id
    and p.hidden_at is null
    and pl.user_id <> p_user_id
    and pl.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'post_likes_received',
      'label', 'Likes on their posts',
      'group', 'received',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  select
    count(*) filter (where c.created_at >= p_since_24h)::int,
    count(*) filter (where c.created_at >= p_since_7d)::int
  into v24, v7
  from public.feed_comments c
  join public.community_feed_posts p on p.id = c.post_id
  where p.user_id = p_user_id
    and p.hidden_at is null
    and c.user_id <> p_user_id
    and c.hidden_at is null
    and c.created_at >= p_since_7d;

  if v24 > 0 or v7 > 0 then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'metric_id', 'comments_received',
      'label', 'Comments on their posts',
      'group', 'received',
      'count_24h', v24,
      'count_7d', v7
    ));
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

comment on function public.app_product_analytics_member_lounge_activity(uuid, timestamptz, timestamptz) is
  'Internal: per-member Lounge posts created, interactions given, and engagement received (24h + 7d).';

create or replace function public.app_product_analytics_member_breakdown(
  p_user_id uuid,
  p_since_24h timestamptz,
  p_since_7d timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stats jsonb;
  v_sections jsonb;
  v_calculators jsonb;
  v_sessions jsonb;
  v_lounge jsonb;
begin
  if p_user_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'events_24h', count(*) filter (where v.visited_at >= p_since_24h),
    'events_7d', count(*) filter (where v.visited_at >= p_since_7d),
    'tab_visits_24h', count(*) filter (
      where v.visited_at >= p_since_24h
        and v.event_kind = 'visit'
        and v.sub_section_id is null
    ),
    'tab_visits_7d', count(*) filter (
      where v.visited_at >= p_since_7d
        and v.event_kind = 'visit'
        and v.sub_section_id is null
    ),
    'sessions_24h', count(*) filter (
      where v.visited_at >= p_since_24h and v.event_kind = 'session_recorded'
    ),
    'sessions_7d', count(*) filter (
      where v.visited_at >= p_since_7d and v.event_kind = 'session_recorded'
    ),
    'last_active_at', max(v.visited_at)
  )
  into v_stats
  from public.app_section_visits v
  where v.user_id = p_user_id
    and v.visited_at >= p_since_7d;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'section_id', s.section_id,
      'label', s.label,
      'visits_24h', coalesce(row_stats.visits_24h, 0),
      'visits_7d', coalesce(row_stats.visits_7d, 0),
      'sessions_24h', coalesce(row_stats.sessions_24h, 0),
      'sessions_7d', coalesce(row_stats.sessions_7d, 0)
    )
    order by
      coalesce(row_stats.visits_7d, 0)
      + coalesce(row_stats.sessions_7d, 0)
      + coalesce(row_stats.visits_24h, 0)
      + coalesce(row_stats.sessions_24h, 0) desc,
      s.label asc
  ), '[]'::jsonb)
  into v_sections
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
          and v.visited_at >= p_since_24h
      )::int as visits_24h,
      count(*) filter (
        where v.event_kind = 'visit'
          and v.sub_section_id is null
          and v.visited_at >= p_since_7d
      )::int as visits_7d,
      count(*) filter (
        where v.event_kind = 'session_recorded'
          and v.visited_at >= p_since_24h
      )::int as sessions_24h,
      count(*) filter (
        where v.event_kind = 'session_recorded'
          and v.visited_at >= p_since_7d
      )::int as sessions_7d
    from public.app_section_visits v
    where v.user_id = p_user_id
      and v.section_id = s.section_id
      and v.visited_at >= p_since_7d
  ) row_stats on true
  where coalesce(row_stats.visits_24h, 0) > 0
     or coalesce(row_stats.visits_7d, 0) > 0
     or coalesce(row_stats.sessions_24h, 0) > 0
     or coalesce(row_stats.sessions_7d, 0) > 0;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sub_section_id', b.sub_section_id,
      'label', initcap(replace(b.sub_section_id, '-', ' ')),
      'visits_24h', b.visits_24h,
      'visits_7d', b.visits_7d
    )
    order by b.visits_7d desc, b.visits_24h desc, b.sub_section_id asc
  ), '[]'::jsonb)
  into v_calculators
  from (
    select
      v.sub_section_id,
      count(*) filter (where v.visited_at >= p_since_24h)::int as visits_24h,
      count(*) filter (where v.visited_at >= p_since_7d)::int as visits_7d
    from public.app_section_visits v
    where v.user_id = p_user_id
      and v.section_id = 'calculators'
      and v.event_kind = 'visit'
      and v.sub_section_id is not null
      and v.visited_at >= p_since_7d
    group by v.sub_section_id
  ) b;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'section_id', b.section_id,
      'label', b.label,
      'sub_section_id', b.sub_section_id,
      'sub_label', b.sub_label,
      'sessions_24h', b.sessions_24h,
      'sessions_7d', b.sessions_7d
    )
    order by b.sessions_7d desc, b.sessions_24h desc, b.label asc
  ), '[]'::jsonb)
  into v_sessions
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
      count(*) filter (where v.visited_at >= p_since_24h)::int as sessions_24h,
      count(*) filter (where v.visited_at >= p_since_7d)::int as sessions_7d
    from public.app_section_visits v
    left join public.play_log_game_templates tpl
      on v.section_id = 'play-logbook'
     and tpl.id::text = v.sub_section_id
    where v.user_id = p_user_id
      and v.event_kind = 'session_recorded'
      and v.visited_at >= p_since_7d
    group by v.section_id, v.sub_section_id, tpl.display_name
  ) b;

  v_lounge := public.app_product_analytics_member_lounge_activity(p_user_id, p_since_24h, p_since_7d);

  return coalesce(v_stats, '{}'::jsonb)
    || jsonb_build_object(
      'sections', coalesce(v_sections, '[]'::jsonb),
      'calculators', coalesce(v_calculators, '[]'::jsonb),
      'session_breakdown', coalesce(v_sessions, '[]'::jsonb),
      'lounge_activity', coalesce(v_lounge, '[]'::jsonb)
    );
end;
$$;

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
  v_breakdown jsonb;
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
      'tab_visits_24h', coalesce((breakdown.bd->>'tab_visits_24h')::int, 0),
      'tab_visits_7d', agg.tab_visits_7d,
      'sessions_24h', coalesce((breakdown.bd->>'sessions_24h')::int, 0),
      'sessions_7d', agg.sessions_7d,
      'top_section_id', coalesce(top_section.section_id, ''),
      'top_section_label', coalesce(top_section.label, ''),
      'last_active_at', coalesce(breakdown.bd->>'last_active_at', agg.last_active_at::text),
      'sections', coalesce(breakdown.bd->'sections', '[]'::jsonb),
      'calculators', coalesce(breakdown.bd->'calculators', '[]'::jsonb),
      'session_breakdown', coalesce(breakdown.bd->'session_breakdown', '[]'::jsonb),
      'lounge_activity', coalesce(breakdown.bd->'lounge_activity', '[]'::jsonb)
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
    cross join lateral (
      select public.app_product_analytics_member_breakdown(agg.user_id, v_24h, v_7d) as bd
    ) breakdown
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
      v_breakdown := public.app_product_analytics_member_breakdown(v_target_user_id, v_24h, v_7d);

      select jsonb_build_object(
        'user_id', p.user_id,
        'handle', p.handle,
        'display_name', p.display_name,
        'events_24h', coalesce((v_breakdown->>'events_24h')::int, 0),
        'events_7d', coalesce((v_breakdown->>'events_7d')::int, 0),
        'tab_visits_24h', coalesce((v_breakdown->>'tab_visits_24h')::int, 0),
        'tab_visits_7d', coalesce((v_breakdown->>'tab_visits_7d')::int, 0),
        'sessions_24h', coalesce((v_breakdown->>'sessions_24h')::int, 0),
        'sessions_7d', coalesce((v_breakdown->>'sessions_7d')::int, 0),
        'last_active_at', v_breakdown->>'last_active_at',
        'sections', coalesce(v_breakdown->'sections', '[]'::jsonb),
        'calculators', coalesce(v_breakdown->'calculators', '[]'::jsonb),
        'session_breakdown', coalesce(v_breakdown->'session_breakdown', '[]'::jsonb),
        'lounge_activity', coalesce(v_breakdown->'lounge_activity', '[]'::jsonb)
      )
      into v_member
      from public.profiles p
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
  'Admin-only: top active members (7d) with section + Lounge breakdown; optional handle lookup.';
