-- Edge Monitor paid KPIs skip admin-comp / test grants.
-- Friend Lifetime rows stay entitled (admin_comp_lifetime_*) but do not count as paid.
-- Matches src/features/ops/opsMonitorSubscriberRoster.js billing source rules.

create or replace function public.ops_monitor_is_paid_billing(
  p_subscription_id text,
  p_customer_id text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when btrim(coalesce(p_subscription_id, '')) like 'admin_comp_%' then false
      when btrim(coalesce(p_customer_id, '')) like 'admin_comp_%' then false
      when btrim(coalesce(p_subscription_id, '')) like 'comp_lifetime_%' then false
      when btrim(coalesce(p_subscription_id, '')) like 'test_%' then false
      when btrim(coalesce(p_customer_id, '')) like 'test_cus_%' then false
      when btrim(coalesce(p_subscription_id, '')) like 'sub_%' then true
      when btrim(coalesce(p_subscription_id, '')) like 'pi_%' then true
      when btrim(coalesce(p_subscription_id, '')) like 'cs_%' then true
      when btrim(coalesce(p_customer_id, '')) like 'cus_%' then true
      else false
    end;
$$;

comment on function public.ops_monitor_is_paid_billing(text, text) is
  'True for real Stripe (sub_/pi_/cs_/cus_). False for admin_comp, legacy comp_lifetime, and test grants.';

revoke all on function public.ops_monitor_is_paid_billing(text, text) from public;

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
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
    ),
    'active_by_product', coalesce((
      select jsonb_agg(jsonb_build_object('product_slug', s.product_slug, 'count', s.cnt) order by s.product_slug)
      from (
        select us.product_slug, count(*)::int as cnt
        from public.user_subscriptions us
        where us.status in ('active', 'trialing')
          and public.ops_monitor_is_human(us.user_id)
          and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
        group by us.product_slug
      ) s
    ), '[]'::jsonb),
    'status_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
      from (
        select us.status, count(*)::int as cnt
        from public.user_subscriptions us
        where public.ops_monitor_is_human(us.user_id)
          and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
        group by us.status
      ) s
    ), '[]'::jsonb),
    'cancel_at_period_end', (
      select count(*)::int
      from public.user_subscriptions us
      where us.cancel_at_period_end = true
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
    ),
    'monthly_interval', (
      select count(*)::int
      from public.user_subscriptions us
      where us.price_interval = 'monthly'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
    ),
    'annual_interval', (
      select count(*)::int
      from public.user_subscriptions us
      where us.price_interval = 'annual'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
    ),
    'lifetime', (
      select count(*)::int
      from public.user_subscriptions us
      where us.product_slug = 'slots-edge-lifetime'
        and us.status in ('active', 'trialing')
        and public.ops_monitor_is_human(us.user_id)
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
    )
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
    and public.ops_monitor_is_human(us.user_id)
    and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id);

  select count(*)::int
    into v_active_fan
  from public.creator_subscriptions cs
  where cs.status in ('active', 'trialing')
    and public.ops_monitor_is_human(cs.subscriber_user_id)
    and public.ops_monitor_is_paid_billing(cs.stripe_subscription_id, cs.stripe_customer_id);

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

revoke all on function public.admin_ops_monitor_stripe_webhook_health(timestamptz, timestamptz) from public;

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
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
      group by sp.slug, sp.display_name, sp.sort_order
    ) s
  ), '[]'::jsonb));
  v := jsonb_set(v, '{platform,status_totals}', coalesce((
    select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.cnt) order by s.status)
    from (
      select us.status, count(*)::int as cnt
      from public.user_subscriptions us
      where public.ops_monitor_is_human(us.user_id)
        and public.ops_monitor_is_paid_billing(us.stripe_subscription_id, us.stripe_customer_id)
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
  'Admin Edge Monitor roster. Bots excluded. Product/status totals are paid Stripe only; lists still include comps.';

revoke all on function public.admin_ops_subscriber_roster() from public;
grant execute on function public.admin_ops_subscriber_roster() to authenticated;
revoke all on function public.ops_monitor_human_subscriptions_json() from public;
