-- Stripe webhook health: persist failures (do not delete audit rows) + Edge Monitor status.

alter table public.stripe_webhook_events
  add column if not exists processing_status text not null default 'processed'
    check (processing_status in ('processed', 'failed'));

alter table public.stripe_webhook_events
  add column if not exists error_message text;

comment on column public.stripe_webhook_events.processing_status is
  'processed = handler finished OK; failed = handler threw (row kept for Monitor + ops triage).';

create index if not exists stripe_webhook_events_status_received_idx
  on public.stripe_webhook_events (processing_status, received_at desc);

create or replace function public.admin_ops_monitor_stripe_webhook_health(
  p_24h timestamptz,
  p_7d timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last_success timestamptz;
  v_last_failure timestamptz;
  v_last_failure_type text;
  v_last_failure_message text;
  v_active_platform int;
  v_active_fan int;
  v_billing_expects boolean;
  v_status text := 'ok';
  v_summary text;
  v_stale_threshold interval := interval '96 hours';
begin
  select max(w.received_at)
    into v_last_success
  from public.stripe_webhook_events w
  where w.processing_status = 'processed';

  select w.received_at, w.event_type, left(coalesce(w.error_message, ''), 240)
    into v_last_failure, v_last_failure_type, v_last_failure_message
  from public.stripe_webhook_events w
  where w.processing_status = 'failed'
  order by w.received_at desc
  limit 1;

  select count(*)::int
    into v_active_platform
  from public.user_subscriptions us
  where us.status in ('active', 'trialing');

  select count(*)::int
    into v_active_fan
  from public.creator_subscriptions cs
  where cs.status in ('active', 'trialing');

  v_billing_expects := (v_active_platform + v_active_fan) > 0;

  if v_last_failure is not null and (v_last_success is null or v_last_failure > v_last_success) then
    v_status := 'critical';
    v_summary := format(
      'Processing failed %s (%s)',
      to_char(v_last_failure at time zone 'UTC', 'Mon DD HH24:MI UTC'),
      coalesce(v_last_failure_type, 'event')
    );
  elsif v_billing_expects and (v_last_success is null or v_last_success < now() - v_stale_threshold) then
    v_status := 'warn';
    if v_last_success is null then
      v_summary := 'Active billing subs but no successful webhook recorded';
    else
      v_summary := format(
        'No successful webhook since %s (expected with %s active billing subs)',
        to_char(v_last_success at time zone 'UTC', 'Mon DD HH24:MI UTC'),
        v_active_platform + v_active_fan
      );
    end if;
  elsif v_last_success is not null then
    v_summary := format('Last OK %s', to_char(v_last_success at time zone 'UTC', 'Mon DD HH24:MI UTC'));
  else
    v_summary := 'No webhook activity recorded (OK when no active billing subs)';
  end if;

  return jsonb_build_object(
    'events_24h', (
      select count(*)::int
      from public.stripe_webhook_events w
      where w.processing_status = 'processed'
        and w.received_at >= p_24h
    ),
    'events_7d', (
      select count(*)::int
      from public.stripe_webhook_events w
      where w.processing_status = 'processed'
        and w.received_at >= p_7d
    ),
    'failures_24h', (
      select count(*)::int
      from public.stripe_webhook_events w
      where w.processing_status = 'failed'
        and w.received_at >= p_24h
    ),
    'failures_7d', (
      select count(*)::int
      from public.stripe_webhook_events w
      where w.processing_status = 'failed'
        and w.received_at >= p_7d
    ),
    'last_success_at', v_last_success,
    'last_failure_at', v_last_failure,
    'last_failure_type', v_last_failure_type,
    'last_failure_message', nullif(v_last_failure_message, ''),
    'active_billing_subs', v_active_platform + v_active_fan,
    'billing_expects_webhooks', v_billing_expects,
    'health_status', v_status,
    'health_summary', v_summary
  );
end;
$$;

comment on function public.admin_ops_monitor_stripe_webhook_health(timestamptz, timestamptz) is
  'Edge Monitor: Stripe webhook volume, last success/failure, and ok/warn/critical status.';

revoke all on function public.admin_ops_monitor_stripe_webhook_health(timestamptz, timestamptz) from public;

-- Point snapshot at health helper (single-line change from 20260723270000 body).
create or replace function public.admin_ops_monitor_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_7d timestamptz := v_now - interval '7 days';
  v_pool jsonb := public.admin_ops_monitor_starter_pool_stats();
  v_body jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  v_body := jsonb_build_object(
    'generated_at', v_now,
    'users', jsonb_build_object(
      'total_profiles', (select count(*)::int from public.profiles),
      'new_24h', (select count(*)::int from public.profiles p where p.created_at >= v_24h),
      'new_7d', (select count(*)::int from public.profiles p where p.created_at >= v_7d),
      'role_user', (select count(*)::int from public.profiles p where p.role = 'user'),
      'role_moderator', (select count(*)::int from public.profiles p where p.role = 'moderator'),
      'role_admin', (select count(*)::int from public.profiles p where p.role = 'admin'),
      'has_active_subscription_flag', (
        select count(*)::int from public.profiles p where p.has_active_subscription = true
      ),
      'stripe_customer_linked', (
        select count(*)::int from public.profiles p where p.stripe_customer_id is not null
      )
    ),
    'subscriptions', jsonb_build_object(
      'rows_total', (select count(*)::int from public.user_subscriptions),
      'active_by_product', coalesce((
        select jsonb_agg(jsonb_build_object('product_slug', s.product_slug, 'count', s.cnt) order by s.product_slug)
        from (
          select us.product_slug, count(*)::int as cnt
          from public.user_subscriptions us
          where us.status in ('active', 'trialing')
          group by us.product_slug
        ) s
      ), '[]'::jsonb),
      'status_breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
        from (
          select us.status, count(*)::int as cnt
          from public.user_subscriptions us
          group by us.status
        ) s
      ), '[]'::jsonb),
      'cancel_at_period_end', (
        select count(*)::int from public.user_subscriptions us
        where us.cancel_at_period_end = true and us.status in ('active', 'trialing')
      ),
      'monthly_interval', (
        select count(*)::int from public.user_subscriptions us
        where us.price_interval = 'monthly' and us.status in ('active', 'trialing')
      ),
      'annual_interval', (
        select count(*)::int from public.user_subscriptions us
        where us.price_interval = 'annual' and us.status in ('active', 'trialing')
      ),
      'lifetime', (
        select count(*)::int from public.user_subscriptions us
        where us.product_slug = 'slots-edge-lifetime' and us.status in ('active', 'trialing')
      )
    ),
    'lounge', jsonb_build_object(
      'posts_total', (select count(*)::int from public.community_feed_posts),
      'posts_visible', (
        select count(*)::int from public.community_feed_posts p where p.hidden_at is null
      ),
      'posts_hidden', (
        select count(*)::int from public.community_feed_posts p where p.hidden_at is not null
      ),
      'posts_24h', (
        select count(*)::int from public.community_feed_posts p where p.created_at >= v_24h
      ),
      'posts_7d', (
        select count(*)::int from public.community_feed_posts p where p.created_at >= v_7d
      ),
      'pinned', (
        select count(*)::int from public.community_feed_posts p
        where p.pinned = true and p.hidden_at is null
      ),
      'with_stream_video', (
        select count(*)::int from public.community_feed_posts p where p.stream_video_uid is not null
      ),
      'comments_total', (select count(*)::int from public.feed_comments),
      'comments_24h', (
        select count(*)::int from public.feed_comments c where c.created_at >= v_24h
      ),
      'likes_total', (select count(*)::int from public.post_likes),
      'bookmarks_total', (select count(*)::int from public.post_bookmarks),
      'follows_total', (select count(*)::int from public.profile_follows)
    ),
    'search', jsonb_build_object(
      'searches_24h', (
        select count(*)::int from public.lounge_search_analytics a where a.created_at >= v_24h
      ),
      'searches_7d', (
        select count(*)::int from public.lounge_search_analytics a where a.created_at >= v_7d
      ),
      'unique_searchers_24h', (
        select count(distinct a.user_id)::int
        from public.lounge_search_analytics a
        where a.created_at >= v_24h and a.user_id is not null
      ),
      'top_queries_7d', public.admin_ops_monitor_top_search_queries(7, 15),
      'top_queries_30d', public.admin_ops_monitor_top_search_queries(30, 15)
    ),
    'rate_limits', jsonb_build_object(
      'events_24h', (
        select count(*)::int from public.rate_limit_events e where e.created_at >= v_24h
      ),
      'events_7d', (
        select count(*)::int from public.rate_limit_events e where e.created_at >= v_7d
      ),
      'by_kind_24h', coalesce((
        select jsonb_agg(jsonb_build_object('kind', k.kind, 'count', k.cnt) order by k.cnt desc, k.kind)
        from (
          select e.kind, count(*)::int as cnt
          from public.rate_limit_events e
          where e.created_at >= v_24h
          group by e.kind
        ) k
      ), '[]'::jsonb)
    ),
    'chat', jsonb_build_object(
      'rooms_total', (select count(*)::int from public.chat_rooms),
      'messages_total', (select count(*)::int from public.chat_messages),
      'messages_24h', (
        select count(*)::int from public.chat_messages m where m.created_at >= v_24h
      ),
      'messages_7d', (
        select count(*)::int from public.chat_messages m where m.created_at >= v_7d
      ),
      'members_total', (select count(*)::int from public.chat_room_members)
    ),
    'guides', jsonb_build_object(
      'published', (select count(*)::int from public.guides g where g.published = true),
      'unpublished', (select count(*)::int from public.guides g where g.published = false),
      'machines_total', (select count(*)::int from public.machines)
    ),
    'bankroll', jsonb_build_object(
      'sessions_total', (select count(*)::int from public.bankroll_sessions),
      'sessions_7d', (
        select count(*)::int from public.bankroll_sessions s where s.created_at >= v_7d
      ),
      'profiles_with_sessions', (
        select count(distinct s.user_id)::int from public.bankroll_sessions s
      )
    ),
    'play_log', jsonb_build_object(
      'entries_total', (select count(*)::int from public.play_log_entries),
      'entries_7d', (
        select count(*)::int from public.play_log_entries e where e.created_at >= v_7d
      ),
      'users_with_entries', (
        select count(distinct e.user_id)::int from public.play_log_entries e
      )
    ),
    'offers', jsonb_build_object(
      'events_total', (select count(*)::int from public.offer_events),
      'uploads_total', (select count(*)::int from public.offer_uploads)
    ),
    'push', jsonb_build_object(
      'subscriptions_total', (select count(*)::int from public.push_subscriptions)
    ),
    'starter_drops', jsonb_build_object(
      'unlocks_total', (select count(*)::int from public.starter_weekly_guide_unlocks),
      'pending_reveal', (
        select count(*)::int from public.starter_weekly_guide_unlocks u
        where u.scratch_revealed_at is null
      ),
      'grants_7d', (
        select count(*)::int from public.starter_weekly_guide_unlocks u where u.granted_at >= v_7d
      ),
      'pool_size', v_pool->'pool_size',
      'active_starter_subs', v_pool->'active_starter_subs',
      'exhausted_starter_subs', v_pool->'exhausted_starter_subs'
    ),
    'freemium_funnel', public.admin_ops_monitor_freemium_funnel(),
    'activity', jsonb_build_object(
      'events_24h', (
        select count(*)::int from public.activity_events ae where ae.created_at >= v_24h
      ),
      'events_7d', (
        select count(*)::int from public.activity_events ae where ae.created_at >= v_7d
      ),
      'by_type_24h', public.admin_ops_monitor_activity_by_type(v_24h),
      'by_type_7d', public.admin_ops_monitor_activity_by_type(v_7d)
    ),
    'stripe_webhooks', public.admin_ops_monitor_stripe_webhook_health(v_24h, v_7d),
    'trends', public.admin_ops_monitor_trends_7d(v_now),
    'trends_30d', public.admin_ops_monitor_trends_daily(30, v_now),
    'trends_90d', public.admin_ops_monitor_trends_weekly(13, v_now)
  );

  return v_body;
end;
$$;

comment on function public.admin_ops_monitor_snapshot() is
  'Admin-only JSON snapshot for Edge Monitor (Stripe webhook health + subscription cadence).';
