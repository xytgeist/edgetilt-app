-- Edge Monitor: guide read audit aggregates + scrape/intrusion signals (admin-only).

create or replace function public.admin_ops_security_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_1h timestamptz := v_now - interval '1 hour';
  v_reads_24h int;
  v_granted_24h int;
  v_denied_24h int;
  v_rate_limited_24h int;
  v_anon_granted_1h int;
  v_overall text := 'ok';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select
    count(*)::int,
    count(*) filter (where e.granted)::int,
    count(*) filter (where not e.granted)::int,
    count(*) filter (where e.deny_reason = 'rate_limit')::int
  into v_reads_24h, v_granted_24h, v_denied_24h, v_rate_limited_24h
  from public.guide_read_events e
  where e.created_at >= v_24h;

  select count(*)::int
  into v_anon_granted_1h
  from public.guide_read_events e
  where e.created_at >= v_1h
    and e.user_id is null
    and e.granted = true;

  if v_denied_24h >= 200 or v_rate_limited_24h >= 50 then
    v_overall := 'critical';
  elsif v_denied_24h >= 50 or v_anon_granted_1h >= 200 or v_granted_24h >= 2000 then
    v_overall := 'warn';
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'overall', v_overall,
    'guide_reads', jsonb_build_object(
      'events_24h', v_reads_24h,
      'granted_24h', v_granted_24h,
      'denied_24h', v_denied_24h,
      'rate_limited_24h', v_rate_limited_24h,
      'anon_granted_1h', v_anon_granted_1h
    ),
    'top_denied_slugs_24h', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'slug', s.guide_slug,
            'count', s.cnt,
            'top_reason', s.top_reason
          )
          order by s.cnt desc
        )
        from (
          select
            e.guide_slug,
            count(*)::int as cnt,
            mode() within group (order by coalesce(e.deny_reason, 'unknown')) as top_reason
          from public.guide_read_events e
          where e.created_at >= v_24h
            and not e.granted
          group by e.guide_slug
          order by count(*) desc
          limit 12
        ) s
      ),
      '[]'::jsonb
    ),
    'heavy_readers_24h', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', s.user_id,
            'handle', s.handle,
            'granted_count', s.granted_count,
            'denied_count', s.denied_count
          )
          order by s.granted_count desc
        )
        from (
          select
            e.user_id,
            p.handle,
            count(*) filter (where e.granted)::int as granted_count,
            count(*) filter (where not e.granted)::int as denied_count
          from public.guide_read_events e
          left join public.profiles p on p.user_id = e.user_id
          where e.created_at >= v_24h
            and e.user_id is not null
          group by e.user_id, p.handle
          having count(*) filter (where e.granted) >= 40
          order by count(*) filter (where e.granted) desc
          limit 15
        ) s
      ),
      '[]'::jsonb
    ),
    'rate_limits', jsonb_build_object(
      'events_24h', (
        select count(*)::int from public.rate_limit_events r where r.created_at >= v_24h
      ),
      'events_1h', (
        select count(*)::int from public.rate_limit_events r where r.created_at >= v_1h
      )
    ),
    'notes', jsonb_build_array(
      'Direct SELECT on guides.content_markdown is revoked for anon/authenticated; use get_guide_content().',
      'Heavy granted reads may indicate scraping even when each call passes entitlement checks.',
      'Compare denied_24h spikes with top_denied_slugs for targeted lock probing.'
    )
  );
end;
$$;

comment on function public.admin_ops_security_snapshot() is
  'Edge Monitor Security panel: guide read audit + coarse scrape signals.';

revoke all on function public.admin_ops_security_snapshot() from public;
grant execute on function public.admin_ops_security_snapshot() to authenticated;
