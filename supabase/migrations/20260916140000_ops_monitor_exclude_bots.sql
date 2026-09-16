-- Edge Monitor user + subscription metrics exclude Lounge bots (current and future).
-- is_bot on profiles is the gate. Comp rows (Syndicate edge-pro, Signal lifetime) drop out.

create or replace function public.ops_monitor_is_human(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and coalesce(p.is_bot, false) = false
  );
$$;

comment on function public.ops_monitor_is_human(uuid) is
  'Edge Monitor: true for a real member profile. Lounge bots are never user/subscription metrics.';

revoke all on function public.ops_monitor_is_human(uuid) from public;
grant execute on function public.ops_monitor_is_human(uuid) to authenticated;

create or replace function public.app_product_analytics_user_excluded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join auth.users u on u.id = p.user_id
    where p.user_id = p_user_id
      and (
        coalesce(p.is_bot, false) = true
        or p.role = 'admin'
        or lower(btrim(coalesce(p.handle, ''))) in (
          select e.handle
          from public.app_product_analytics_excluded_handles e
        )
        or lower(btrim(coalesce(u.email, ''))) in (
          select em.email
          from public.app_product_analytics_excluded_emails em
        )
        or lower(btrim(coalesce(u.email, ''))) like '%@bots.edgetilt.local'
      )
  );
$$;

comment on function public.app_product_analytics_user_excluded(uuid) is
  'True when user is a Lounge bot, admin, blocklisted handle/email, or @bots.edgetilt.local.';

create or replace function public.ops_monitor_human_users_json(p_24h timestamptz, p_7d timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'total_profiles', (
      select count(*)::int from public.profiles p where coalesce(p.is_bot, false) = false
    ),
    'new_24h', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.created_at >= p_24h
    ),
    'new_7d', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.created_at >= p_7d
    ),
    'role_user', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.role = 'user'
    ),
    'role_moderator', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.role = 'moderator'
    ),
    'role_admin', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.role = 'admin'
    ),
    'has_active_subscription_flag', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.has_active_subscription = true
    ),
    'stripe_customer_linked', (
      select count(*)::int from public.profiles p
      where coalesce(p.is_bot, false) = false and p.stripe_customer_id is not null
    )
  );
$$;

create or replace function public.ops_monitor_human_subscriptions_json()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'rows_total', (
      select count(*)::int
      from public.user_subscriptions us
      where public.ops_monitor_is_human(us.user_id)
    ),
    'active_by_product', coalesce((
      select jsonb_agg(jsonb_build_object('product_slug', s.product_slug, 'count', s.cnt) order by s.product_slug)
      from (
        select us.product_slug, count(*)::int as cnt
        from public.user_subscriptions us
        where us.status in ('active', 'trialing')
          and public.ops_monitor_is_human(us.user_id)
        group by us.product_slug
      ) s
    ), '[]'::jsonb),
    'status_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
      from (
        select us.status, count(*)::int as cnt
        from public.user_subscriptions us
        where public.ops_monitor_is_human(us.user_id)
        group by us.status
      ) s
    ), '[]'::jsonb),
    'cancel_at_period_end', (
      select count(*)::int
      from public.user_subscriptions us
      where us.cancel_at_period_end = true
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
    ),
    'monthly_interval', (
      select count(*)::int
      from public.user_subscriptions us
      where us.price_interval = 'monthly'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
    ),
    'annual_interval', (
      select count(*)::int
      from public.user_subscriptions us
      where us.price_interval = 'annual'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
    ),
    'lifetime', (
      select count(*)::int
      from public.user_subscriptions us
      where us.product_slug = 'slots-edge-lifetime'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
    )
  );
$$;

create or replace function public.ops_monitor_filter_json_humans(p_arr jsonb, p_id_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(elem)
      from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) elem
      where nullif(elem->>p_id_key, '') is not null
        and public.ops_monitor_is_human((elem->>p_id_key)::uuid)
    ),
    '[]'::jsonb
  );
$$;

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
  where us.status in ('active', 'trialing')
    and public.ops_monitor_is_human(us.user_id);

  select count(*)::int
    into v_active_fan
  from public.creator_subscriptions cs
  where cs.status in ('active', 'trialing')
    and public.ops_monitor_is_human(cs.subscriber_user_id);

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

create or replace function public.admin_ops_monitor_starter_pool_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select distinct lower(trim(coalesce(m.slug, g.slug))) as slug
    from public.guides g
    inner join public.machines m on m.id = g.machine_id
    where g.published = true
      and m.release_year >= 2020
      and lower(trim(coalesce(m.slug, g.slug))) <> ''
      and lower(trim(coalesce(m.slug, g.slug))) <> all (
        select unnest(public.starter_weekly_drop_free_guide_slugs())
      )
  ),
  active_starter as (
    select us.user_id
    from public.user_subscriptions us
    where us.product_slug = 'slots-edge-starter'
      and us.status in ('active', 'trialing')
      and public.ops_monitor_is_human(us.user_id)
  )
  select jsonb_build_object(
    'pool_size', (select count(*)::int from eligible),
    'active_starter_subs', (select count(*)::int from active_starter),
    'exhausted_starter_subs', (
      select count(*)::int
      from active_starter s
      where public.starter_has_exhausted_weekly_drop_pool(s.user_id)
    )
  );
$$;

create or replace function public.admin_ops_monitor_freemium_funnel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with limited_users as (
    select p.user_id
    from public.profiles p
    where p.role = 'user'
      and coalesce(p.is_bot, false) = false
      and not public.user_has_entitlement(p.user_id, 'slots-edge')
      and not public.user_has_entitlement(p.user_id, 'slots-edge-lifetime')
  ),
  bankroll_counts as (
    select bs.user_id, count(*)::int as cnt
    from public.bankroll_sessions bs
    inner join limited_users lu on lu.user_id = bs.user_id
    group by bs.user_id
  ),
  play_log_counts as (
    select e.user_id, count(*)::int as cnt
    from public.play_log_entries e
    inner join limited_users lu on lu.user_id = e.user_id
    group by e.user_id
  )
  select jsonb_build_object(
    'limits', jsonb_build_object(
      'bankroll_cap', 10,
      'play_log_cap', 10
    ),
    'limited_users', (select count(*)::int from limited_users),
    'bankroll', jsonb_build_object(
      'at_8', (select count(*)::int from bankroll_counts where cnt = 8),
      'at_9', (select count(*)::int from bankroll_counts where cnt = 9),
      'at_10', (select count(*)::int from bankroll_counts where cnt >= 10)
    ),
    'play_log', jsonb_build_object(
      'at_8', (select count(*)::int from play_log_counts where cnt = 8),
      'at_9', (select count(*)::int from play_log_counts where cnt = 9),
      'at_10', (select count(*)::int from play_log_counts where cnt >= 10)
    )
  );
$$;

create or replace function public.admin_ops_monitor_trends_daily(
  p_days integer,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with day_spine as (
    select d.day::date as day
    from generate_series(
      (p_now at time zone 'UTC')::date - (greatest(p_days, 1) - 1),
      (p_now at time zone 'UTC')::date,
      interval '1 day'
    ) as d(day)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', ds.day,
        'label', to_char(ds.day, 'Mon DD'),
        'signups', (
          select count(*)::int
          from public.profiles p
          where coalesce(p.is_bot, false) = false
            and (p.created_at at time zone 'UTC')::date = ds.day
        ),
        'posts', (
          select count(*)::int
          from public.community_feed_posts p
          where (p.created_at at time zone 'UTC')::date = ds.day
        ),
        'comments', (
          select count(*)::int
          from public.feed_comments c
          where (c.created_at at time zone 'UTC')::date = ds.day
        ),
        'chat_messages', (
          select count(*)::int
          from public.chat_messages m
          where (m.created_at at time zone 'UTC')::date = ds.day
        ),
        'activity', (
          select count(*)::int
          from public.activity_events ae
          where (ae.created_at at time zone 'UTC')::date = ds.day
        ),
        'searches', (
          select count(*)::int
          from public.lounge_search_analytics a
          where (a.created_at at time zone 'UTC')::date = ds.day
        ),
        'bankroll_sessions', (
          select count(*)::int
          from public.bankroll_sessions s
          where (s.created_at at time zone 'UTC')::date = ds.day
        )
      )
      order by ds.day
    ),
    '[]'::jsonb
  )
  from day_spine ds;
$$;

create or replace function public.admin_ops_monitor_trends_weekly(
  p_weeks integer,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with week_spine as (
    select w.week_start::date as week_start
    from generate_series(
      date_trunc('week', timezone('UTC', p_now))::date - ((greatest(p_weeks, 1) - 1) * 7),
      date_trunc('week', timezone('UTC', p_now))::date,
      interval '7 days'
    ) as w(week_start)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', ws.week_start,
        'label', to_char(ws.week_start, 'Mon DD'),
        'signups', (
          select count(*)::int
          from public.profiles p
          where coalesce(p.is_bot, false) = false
            and date_trunc('week', timezone('UTC', p.created_at))::date = ws.week_start
        ),
        'posts', (
          select count(*)::int
          from public.community_feed_posts p
          where date_trunc('week', timezone('UTC', p.created_at))::date = ws.week_start
        ),
        'activity', (
          select count(*)::int
          from public.activity_events ae
          where date_trunc('week', timezone('UTC', ae.created_at))::date = ws.week_start
        ),
        'chat_messages', (
          select count(*)::int
          from public.chat_messages m
          where date_trunc('week', timezone('UTC', m.created_at))::date = ws.week_start
        ),
        'searches', (
          select count(*)::int
          from public.lounge_search_analytics a
          where date_trunc('week', timezone('UTC', a.created_at))::date = ws.week_start
        )
      )
      order by ws.week_start
    ),
    '[]'::jsonb
  )
  from week_spine ws;
$$;

do $rename$
begin
  if to_regprocedure('public.admin_ops_monitor_snapshot_unfiltered()') is null
     and to_regprocedure('public.admin_ops_monitor_snapshot()') is not null then
    alter function public.admin_ops_monitor_snapshot() rename to admin_ops_monitor_snapshot_unfiltered;
  end if;
end
$rename$;

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
  v_raw jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  v_raw := public.admin_ops_monitor_snapshot_unfiltered();
  v_raw := v_raw || jsonb_build_object(
    'users', public.ops_monitor_human_users_json(v_24h, v_7d),
    'subscriptions', public.ops_monitor_human_subscriptions_json()
  );
  if v_raw ? 'search' then
    v_raw := jsonb_set(
      v_raw,
      '{search,unique_searchers_24h}',
      to_jsonb((
        select count(distinct a.user_id)::int
        from public.lounge_search_analytics a
        where a.created_at >= v_24h
          and a.user_id is not null
          and public.ops_monitor_is_human(a.user_id)
      ))
    );
  end if;
  if v_raw ? 'bankroll' then
    v_raw := jsonb_set(
      v_raw,
      '{bankroll,profiles_with_sessions}',
      to_jsonb((
        select count(distinct s.user_id)::int
        from public.bankroll_sessions s
        where public.ops_monitor_is_human(s.user_id)
      ))
    );
  end if;
  if v_raw ? 'play_log' then
    v_raw := jsonb_set(
      v_raw,
      '{play_log,users_with_entries}',
      to_jsonb((
        select count(distinct e.user_id)::int
        from public.play_log_entries e
        where public.ops_monitor_is_human(e.user_id)
      ))
    );
  end if;
  return v_raw;
end;
$$;

comment on function public.admin_ops_monitor_snapshot() is
  'Admin Edge Monitor snapshot. User and subscription KPIs exclude Lounge bots via ops_monitor_is_human.';

revoke all on function public.admin_ops_monitor_snapshot() from public;
grant execute on function public.admin_ops_monitor_snapshot() to authenticated;
revoke all on function public.admin_ops_monitor_snapshot_unfiltered() from public;

do $rename_roster$
begin
  if to_regprocedure('public.admin_ops_subscriber_roster_unfiltered()') is null
     and to_regprocedure('public.admin_ops_subscriber_roster()') is not null then
    alter function public.admin_ops_subscriber_roster() rename to admin_ops_subscriber_roster_unfiltered;
  end if;
end
$rename_roster$;

create or replace function public.admin_ops_subscriber_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_24h timestamptz := v_now - interval '24 hours';
  v_7d timestamptz := v_now - interval '7 days';
  v_30d timestamptz := v_now - interval '30 days';
  v_60d timestamptz := v_now - interval '60 days';
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  v := public.admin_ops_subscriber_roster_unfiltered();
  v := jsonb_set(v, '{users,new_24h}', to_jsonb((
    select count(*)::int from public.profiles p
    where coalesce(p.is_bot, false) = false and p.created_at >= v_24h
  )));
  v := jsonb_set(v, '{users,new_7d}', to_jsonb((
    select count(*)::int from public.profiles p
    where coalesce(p.is_bot, false) = false and p.created_at >= v_7d
  )));
  v := jsonb_set(v, '{users,new_30d}', to_jsonb((
    select count(*)::int from public.profiles p
    where coalesce(p.is_bot, false) = false and p.created_at >= v_30d
  )));
  v := jsonb_set(v, '{users,new_prev_30d}', to_jsonb((
    select count(*)::int from public.profiles p
    where coalesce(p.is_bot, false) = false
      and p.created_at >= v_60d
      and p.created_at < v_30d
  )));
  v := jsonb_set(v, '{users,recent}', public.ops_monitor_filter_json_humans(v->'users'->'recent', 'user_id'));
  v := jsonb_set(v, '{platform,active_roster}', public.ops_monitor_filter_json_humans(v->'platform'->'active_roster', 'user_id'));
  v := jsonb_set(v, '{platform,pending_cancel}', public.ops_monitor_filter_json_humans(v->'platform'->'pending_cancel', 'user_id'));
  v := jsonb_set(v, '{platform,canceled_recent}', public.ops_monitor_filter_json_humans(v->'platform'->'canceled_recent', 'user_id'));
  v := jsonb_set(v, '{platform,all_rows}', public.ops_monitor_filter_json_humans(v->'platform'->'all_rows', 'user_id'));
  v := jsonb_set(v, '{platform,by_product}', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'product_slug', s.product_slug,
        'display_name', s.display_name,
        'active_count', s.active_count,
        'trialing_count', s.trialing_count,
        'pending_cancel_count', s.pending_cancel_count,
        'total_rows', s.total_rows
      )
      order by s.sort_order, s.product_slug
    )
    from (
      select
        sp.slug as product_slug,
        sp.display_name,
        sp.sort_order,
        count(us.*)::int as total_rows,
        count(*) filter (where us.status = 'active')::int as active_count,
        count(*) filter (where us.status = 'trialing')::int as trialing_count,
        count(*) filter (
          where us.cancel_at_period_end = true
            and us.status in ('active', 'trialing')
        )::int as pending_cancel_count
      from public.subscription_products sp
      left join public.user_subscriptions us
        on us.product_slug = sp.slug
        and public.ops_monitor_is_human(us.user_id)
      group by sp.slug, sp.display_name, sp.sort_order
    ) s
  ), '[]'::jsonb));
  v := jsonb_set(v, '{platform,status_totals}', coalesce((
    select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
    from (
      select us.status, count(*)::int as cnt
      from public.user_subscriptions us
      where public.ops_monitor_is_human(us.user_id)
      group by us.status
    ) s
  ), '[]'::jsonb));
  if v ? 'creator_fan' then
    v := jsonb_set(v, '{creator_fan,active_roster}', public.ops_monitor_filter_json_humans(v->'creator_fan'->'active_roster', 'subscriber_user_id'));
    v := jsonb_set(v, '{creator_fan,pending_cancel}', public.ops_monitor_filter_json_humans(v->'creator_fan'->'pending_cancel', 'subscriber_user_id'));
    v := jsonb_set(v, '{creator_fan,canceled_recent}', public.ops_monitor_filter_json_humans(v->'creator_fan'->'canceled_recent', 'subscriber_user_id'));
    v := jsonb_set(v, '{creator_fan,all_rows}', public.ops_monitor_filter_json_humans(v->'creator_fan'->'all_rows', 'subscriber_user_id'));
  end if;
  return v;
end;
$$;

comment on function public.admin_ops_subscriber_roster() is
  'Admin Edge Monitor roster. Platform and fan rows exclude Lounge bots.';

revoke all on function public.admin_ops_subscriber_roster() from public;
grant execute on function public.admin_ops_subscriber_roster() to authenticated;
revoke all on function public.admin_ops_subscriber_roster_unfiltered() from public;

revoke all on function public.ops_monitor_human_users_json(timestamptz, timestamptz) from public;
revoke all on function public.ops_monitor_human_subscriptions_json() from public;
revoke all on function public.ops_monitor_filter_json_humans(jsonb, text) from public;
revoke all on function public.admin_ops_monitor_stripe_webhook_health(timestamptz, timestamptz) from public;
revoke all on function public.admin_ops_monitor_starter_pool_stats() from public;
revoke all on function public.admin_ops_monitor_freemium_funnel() from public;
revoke all on function public.admin_ops_monitor_trends_daily(integer, timestamptz) from public;
revoke all on function public.admin_ops_monitor_trends_weekly(integer, timestamptz) from public;
revoke all on function public.app_product_analytics_user_excluded(uuid) from public;
