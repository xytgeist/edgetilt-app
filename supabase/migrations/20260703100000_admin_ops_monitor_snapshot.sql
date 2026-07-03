-- Edge Monitor: admin-only aggregate snapshot for in-app ops dashboard.
-- Client: EdgeMonitorScreen via RPC admin_ops_monitor_snapshot().

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
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'users', jsonb_build_object(
      'total_profiles', (select count(*)::int from public.profiles),
      'new_24h', (
        select count(*)::int from public.profiles p where p.created_at >= v_24h
      ),
      'new_7d', (
        select count(*)::int from public.profiles p where p.created_at >= v_7d
      ),
      'role_user', (
        select count(*)::int from public.profiles p where p.role = 'user'
      ),
      'role_moderator', (
        select count(*)::int from public.profiles p where p.role = 'moderator'
      ),
      'role_admin', (
        select count(*)::int from public.profiles p where p.role = 'admin'
      ),
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
        select jsonb_agg(
          jsonb_build_object(
            'product_slug', s.product_slug,
            'count', s.cnt
          )
          order by s.product_slug
        )
        from (
          select us.product_slug, count(*)::int as cnt
          from public.user_subscriptions us
          where us.status in ('active', 'trialing')
          group by us.product_slug
        ) s
      ), '[]'::jsonb),
      'status_breakdown', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'status', s.status,
            'count', s.cnt
          )
          order by s.status
        )
        from (
          select us.status, count(*)::int as cnt
          from public.user_subscriptions us
          group by us.status
        ) s
      ), '[]'::jsonb),
      'cancel_at_period_end', (
        select count(*)::int
        from public.user_subscriptions us
        where us.cancel_at_period_end = true
          and us.status in ('active', 'trialing')
      ),
      'monthly_interval', (
        select count(*)::int
        from public.user_subscriptions us
        where us.price_interval = 'monthly'
          and us.status in ('active', 'trialing')
      ),
      'annual_interval', (
        select count(*)::int
        from public.user_subscriptions us
        where us.price_interval = 'annual'
          and us.status in ('active', 'trialing')
      )
    ),
    'lounge', jsonb_build_object(
      'posts_total', (select count(*)::int from public.community_feed_posts),
      'posts_visible', (
        select count(*)::int
        from public.community_feed_posts p
        where p.hidden_at is null
      ),
      'posts_hidden', (
        select count(*)::int
        from public.community_feed_posts p
        where p.hidden_at is not null
      ),
      'posts_24h', (
        select count(*)::int
        from public.community_feed_posts p
        where p.created_at >= v_24h
      ),
      'posts_7d', (
        select count(*)::int
        from public.community_feed_posts p
        where p.created_at >= v_7d
      ),
      'pinned', (
        select count(*)::int
        from public.community_feed_posts p
        where p.pinned = true and p.hidden_at is null
      ),
      'with_stream_video', (
        select count(*)::int
        from public.community_feed_posts p
        where p.stream_video_uid is not null
      ),
      'comments_total', (select count(*)::int from public.feed_comments),
      'comments_24h', (
        select count(*)::int
        from public.feed_comments c
        where c.created_at >= v_24h
      ),
      'likes_total', (select count(*)::int from public.post_likes),
      'bookmarks_total', (select count(*)::int from public.post_bookmarks),
      'follows_total', (select count(*)::int from public.profile_follows)
    ),
    'search', jsonb_build_object(
      'searches_24h', (
        select count(*)::int
        from public.lounge_search_analytics a
        where a.created_at >= v_24h
      ),
      'searches_7d', (
        select count(*)::int
        from public.lounge_search_analytics a
        where a.created_at >= v_7d
      ),
      'unique_searchers_24h', (
        select count(distinct a.user_id)::int
        from public.lounge_search_analytics a
        where a.created_at >= v_24h
          and a.user_id is not null
      )
    ),
    'rate_limits', jsonb_build_object(
      'events_24h', (
        select count(*)::int
        from public.rate_limit_events e
        where e.created_at >= v_24h
      ),
      'events_7d', (
        select count(*)::int
        from public.rate_limit_events e
        where e.created_at >= v_7d
      ),
      'by_kind_24h', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'kind', k.kind,
            'count', k.cnt
          )
          order by k.cnt desc, k.kind
        )
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
        select count(*)::int
        from public.chat_messages m
        where m.created_at >= v_24h
      ),
      'messages_7d', (
        select count(*)::int
        from public.chat_messages m
        where m.created_at >= v_7d
      ),
      'members_total', (select count(*)::int from public.chat_room_members)
    ),
    'guides', jsonb_build_object(
      'published', (
        select count(*)::int from public.guides g where g.published = true
      ),
      'unpublished', (
        select count(*)::int from public.guides g where g.published = false
      ),
      'machines_total', (select count(*)::int from public.machines)
    ),
    'bankroll', jsonb_build_object(
      'sessions_total', (select count(*)::int from public.bankroll_sessions),
      'sessions_7d', (
        select count(*)::int
        from public.bankroll_sessions s
        where s.created_at >= v_7d
      ),
      'profiles_with_sessions', (
        select count(distinct s.user_id)::int from public.bankroll_sessions s
      )
    ),
    'play_log', jsonb_build_object(
      'entries_total', (select count(*)::int from public.play_log_entries),
      'entries_7d', (
        select count(*)::int
        from public.play_log_entries e
        where e.created_at >= v_7d
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
        select count(*)::int
        from public.starter_weekly_guide_unlocks u
        where u.scratch_revealed_at is null
      ),
      'grants_7d', (
        select count(*)::int
        from public.starter_weekly_guide_unlocks u
        where u.granted_at >= v_7d
      )
    ),
    'activity', jsonb_build_object(
      'events_24h', (
        select count(*)::int
        from public.activity_events ae
        where ae.created_at >= v_24h
      ),
      'events_7d', (
        select count(*)::int
        from public.activity_events ae
        where ae.created_at >= v_7d
      )
    ),
    'stripe_webhooks', jsonb_build_object(
      'events_24h', (
        select count(*)::int
        from public.stripe_webhook_events w
        where w.received_at >= v_24h
      ),
      'events_7d', (
        select count(*)::int
        from public.stripe_webhook_events w
        where w.received_at >= v_7d
      )
    )
  );
end;
$$;

revoke all on function public.admin_ops_monitor_snapshot() from public;
grant execute on function public.admin_ops_monitor_snapshot() to authenticated;

comment on function public.admin_ops_monitor_snapshot() is
  'Admin-only JSON snapshot of Edge product metrics for the in-app Monitor tab.';
