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
  where v.visited_at >= v_24h;

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
      'unique_users_7d', coalesce(stats.unique_users_7d, 0)
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
        and v.visited_at >= v_7d
    ) stats on true
  ) t;

  return jsonb_build_object(
    'generated_at', v_now,
    'unique_users_24h', coalesce(v_unique_24h, 0),
    'sections', v_sections
  );
end;
$$;
