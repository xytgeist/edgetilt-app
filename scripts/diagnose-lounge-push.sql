-- Run in Supabase SQL Editor (test project) when Lounge/Chat pushes fail.
--
-- IMPORTANT: The SQL Editor only shows the result of the LAST statement in a script.
-- Run the "QUICK HEALTH CHECK" block below alone, OR scroll to optional detail sections.
--
-- pg_net deletes http_request_queue rows when done — check 7 filters _http_response JSON
-- bodies from lounge-send-activity-push, NOT a join to the queue URL.

-- ===========================================================================
-- QUICK HEALTH CHECK — run this block by itself (select through semicolon)
-- ===========================================================================
select check_id, status, detail
from (
  select
    1 as ord,
    '1_enqueue_push'::text as check_id,
    case
      when p.prosrc like '%activity_push_invoke_lounge_edge%' then 'OK — vault invoke path'
      when p.prosrc like '%current_setting(''app.supabase_url''%' then 'BROKEN — apply 20260607190000_activity_events_enqueue_push_restore.sql'
      else 'UNKNOWN — inspect activity_events_enqueue_push prosrc'
    end as status,
    left(p.prosrc, 120) as detail
  from pg_proc p
  where p.proname = 'activity_events_enqueue_push'

  union all

  select
    2,
    '2_vault_secrets',
    case
      when count(*) = 3 then 'OK — 3 secrets present'
      when count(*) > 0 then 'PARTIAL — expected 3, found ' || count(*)::text
      else 'MISSING — add lounge_activity_push_* vault secrets'
    end,
    coalesce(string_agg(s.name, ', ' order by s.name), '(none)')
  from vault.secrets s
  where s.name like 'lounge_activity_push%'

  union all

  select
    3,
    '3_emitters_row_security',
    case
      when count(*) filter (where p.proconfig @> array['row_security=off']) = count(*)
        then 'OK — all ' || count(*)::text || ' emitters have row_security=off'
      else 'BROKEN — apply 20260607220000_activity_events_emitters_row_security.sql'
    end,
    coalesce(
      string_agg(
        p.proname || '=' || case when p.proconfig @> array['row_security=off'] then 'OK' else 'MISSING' end,
        ', '
        order by p.proname
      ),
      '(no emitter functions found)'
    )
  from pg_proc p
  where p.proname in (
    'activity_events_insert_safe',
    'activity_events_emit_mentions',
    'activity_events_on_post_like_insert',
    'activity_events_on_feed_comment_like_insert',
    'activity_events_on_post_bookmark_insert',
    'activity_events_on_feed_comment_bookmark_insert',
    'activity_events_on_feed_post_insert',
    'activity_events_on_profile_follow_insert',
    'activity_events_on_feed_comment_insert'
  )

  union all

  select
    4,
    '4_comment_trigger',
    case
      when count(*) > 0 and bool_and(t.tgenabled = 'O') then 'OK — trg_activity_events_feed_comment_insert enabled'
      when count(*) > 0 then 'WARN — trigger exists but not fully enabled'
      else 'MISSING — apply 20260607200000 or 20260607210000'
    end,
    coalesce(max(t.tgname), '(not found)')
  from pg_trigger t
  where t.tgrelid = 'public.feed_comments'::regclass
    and t.tgname = 'trg_activity_events_feed_comment_insert'
    and not t.tgisinternal

  union all

  select
    45,
    '4b_enqueue_trigger',
    case
      when count(*) > 0 and bool_and(t.tgenabled = 'O') then 'OK — trg_activity_events_enqueue_push enabled'
      when count(*) > 0 then 'WARN — enqueue trigger exists but not fully enabled'
      else 'MISSING — apply 20260523160000_lounge_activity_events_push.sql'
    end,
    coalesce(max(t.tgname), '(not found)')
  from pg_trigger t
  where t.tgrelid = 'public.activity_events'::regclass
    and t.tgname = 'trg_activity_events_enqueue_push'
    and not t.tgisinternal

  union all

  select
    5,
    '5_cron_flush',
    case
      when count(*) filter (where j.active) > 0 then 'OK — lounge_activity_push_flush active'
      else 'MISSING or inactive — likes/bookmarks batch flush broken'
    end,
    coalesce(max(j.schedule), '(no job)')
  from cron.job j
  where j.jobname = 'lounge_activity_push_flush'

  union all

  select
    6,
    '6_vault_anon_key_format',
    coalesce(
      (
        select case
          when btrim(ds.decrypted_secret) ~* '^bearer\s+' then 'WRONG — vault value includes "Bearer " prefix; store raw eyJ… only'
          when btrim(ds.decrypted_secret) ~ '^sb_publishable_' then 'WRONG — still sb_publishable_; use legacy eyJ anon from API settings'
          when btrim(ds.decrypted_secret) ~ '^eyJ'
            and position('.' in btrim(ds.decrypted_secret)) > 0
            and length(btrim(ds.decrypted_secret)) >= 80
            then 'OK — legacy JWT shape (eyJ…, length ' || length(btrim(ds.decrypted_secret))::text || ')'
          else 'SUSPICIOUS — prefix ' || left(btrim(ds.decrypted_secret), 16) || ' len=' || length(btrim(ds.decrypted_secret))::text
        end
        from vault.decrypted_secrets ds
        where ds.name = 'lounge_activity_push_supabase_anon_key'
      ),
      'MISSING — lounge_activity_push_supabase_anon_key not in vault'
    ),
    'Vault secret lounge_activity_push_supabase_anon_key (not Edge Function secrets)'

  union all

  select
    7,
    '7_push_edge_responses_15m',
    (
      select
        '200: ' || count(*) filter (where r.status_code = 200)::text
        || ' | 401: ' || count(*) filter (where r.status_code = 401)::text
        || ' | other: ' || count(*) filter (where r.status_code is distinct from 200 and r.status_code is distinct from 401)::text
      from net._http_response r
      where r.created > now() - interval '15 minutes'
        and (
          coalesce(r.content, '') ~ '"sent"\s*:'
          or coalesce(r.content, '') ~ '"batched"\s*:'
          or coalesce(r.content, '') ilike '%Activity event not found%'
          or coalesce(r.content, '') ilike '%Push batch not found%'
          or coalesce(r.content, '') ilike '%Missing activityEventId%'
          or coalesce(r.content, '') ilike '%preference_disabled%'
          or coalesce(r.content, '') ilike '%empty_batch%'
        )
    ),
    coalesce(
      (
        select left(r2.content, 120)
        from net._http_response r2
        where r2.created > now() - interval '15 minutes'
          and (
            coalesce(r2.content, '') ~ '"sent"\s*:'
            or coalesce(r2.content, '') ~ '"batched"\s*:'
            or coalesce(r2.content, '') ilike '%Activity event not found%'
            or coalesce(r2.content, '') ilike '%Push batch not found%'
            or coalesce(r2.content, '') ilike '%Missing activityEventId%'
            or coalesce(r2.content, '') ilike '%preference_disabled%'
            or coalesce(r2.content, '') ilike '%empty_batch%'
          )
        order by r2.created desc
        limit 1
      ),
      '(none — filter by push JSON body; queue URL join does not work after pg_net completes)'
    )

  union all

  select
    75,
    '7b_like_batches_15m',
    (
      select
        'pending: ' || count(*) filter (where b.sent_at is null)::text
        || ' | sent: ' || count(*) filter (where b.sent_at is not null)::text
      from public.activity_push_batches b
      where b.created_at > now() - interval '15 minutes'
        and b.event_type in ('like', 'bookmark')
    ),
    coalesce(
      (
        select max(b.scheduled_send_at)::text
        from public.activity_push_batches b
        where b.created_at > now() - interval '15 minutes'
          and b.event_type in ('like', 'bookmark')
          and b.sent_at is null
      ),
      '(no like/bookmark batches in 15m)'
    )

  union all

  select
    8,
    '8_all_pgnet_24h_note',
    '200: ' || count(*) filter (where r.status_code = 200)::text
      || ' | 401: ' || count(*) filter (where r.status_code = 401)::text
      || ' | other: ' || count(*) filter (where r.status_code is distinct from 200 and r.status_code is distinct from 401)::text,
    'Includes stream purge + other cron — ignore for push; use check 7 instead'
  from net._http_response r
  where r.created > now() - interval '24 hours'

  union all

  select
    9,
    '9_recent_activity_events',
    count(*)::text || ' rows in last 24h',
    coalesce(
      (select string_agg(distinct ae.event_type, ', ' order by ae.event_type)
       from public.activity_events ae
       where ae.created_at > now() - interval '24 hours'),
      '(none — emitters may still be broken)'
    )
  from public.activity_events ae
  where ae.created_at > now() - interval '24 hours'
) checks
order by ord;

-- ===========================================================================
-- OPTIONAL DETAIL — run ONE section at a time if a check above fails
-- ===========================================================================

-- Detail: enqueue function source
-- select proname, prosrc from pg_proc where proname = 'activity_events_enqueue_push';

-- Detail: vault secret names
-- select name, created_at from vault.secrets where name like 'lounge_activity_push%' order by name;

-- Detail: lounge-send-activity-push responses only (last 15 min) — by JSON body, not queue URL
-- select r.id, r.status_code, left(r.content, 200) as content_preview, r.created
-- from net._http_response r
-- where r.created > now() - interval '15 minutes'
--   and (
--     coalesce(r.content, '') ~ '"sent"\s*:'
--     or coalesce(r.content, '') ~ '"batched"\s*:'
--     or coalesce(r.content, '') ilike '%Activity event not found%'
--   )
-- order by r.created desc
-- limit 10;

-- Detail: vault anon key shape (never paste full key in chat)
-- select case
--   when decrypted_secret ~ '^eyJ' then 'eyJ OK len=' || length(btrim(decrypted_secret))::text
--   else 'prefix=' || left(btrim(decrypted_secret), 20)
-- end as anon_key_check
-- from vault.decrypted_secrets
-- where name = 'lounge_activity_push_supabase_anon_key';

-- Detail: manual push invoke (uses latest activity_events row)
-- select public.activity_push_invoke_lounge_edge(
--   jsonb_build_object('activityEventId', (select id from public.activity_events order by created_at desc limit 1))
-- );
-- wait ~5s, then run "lounge-send-activity-push only" detail query above.

-- Detail: all pg_net (includes stream purge 401 noise)
-- select id, status_code, left(content, 500) as content_preview, error_msg, created
-- from net._http_response
-- where created > now() - interval '24 hours'
-- order by created desc
-- limit 20;

-- Detail: recent activity_events
-- select id, event_type, recipient_user_id, chat_room_id, created_at
-- from public.activity_events
-- order by created_at desc
-- limit 15;

-- Detail: device subscriptions for a user (replace UUID)
-- select user_id, left(endpoint, 60) as endpoint, created_at, updated_at
-- from public.push_subscriptions
-- where user_id = 'RECIPIENT_USER_UUID'::uuid;

-- Detail: RECIPIENT DELIVERY — replace USER_B_UUID (run alone)
-- Confirms who got the event, whether they have device rows, and category prefs.
--
-- with b as (
--   select p.user_id, p.handle
--   from public.profiles p
--   where p.handle ilike 'USER_B_HANDLE'   -- e.g. bfrizzle
--   limit 1
-- )
-- select 'profile' as section, b.user_id::text, b.handle, null::text, null::timestamptz
-- from b
-- union all
-- select 'push_subscriptions',
--   ps.user_id::text,
--   left(ps.endpoint, 72),
--   coalesce(left(ps.user_agent, 80), '(no ua)'),
--   ps.updated_at
-- from b
-- join public.push_subscriptions ps on ps.user_id = b.user_id
-- union all
-- select 'notification_preferences',
--   np.user_id::text,
--   'likes=' || np.push_likes::text || ' replies=' || np.push_replies::text,
--   null,
--   np.updated_at
-- from b
-- left join public.notification_preferences np on np.user_id = b.user_id
-- union all
-- select 'recent_events_for_b',
--   ae.event_type,
--   ae.actor_user_id::text,
--   ae.id::text,
--   ae.created_at
-- from b
-- join public.activity_events ae on ae.recipient_user_id = b.user_id
-- where ae.created_at > now() - interval '2 hours'
-- order by ae.created_at desc
-- limit 10;
--
-- Endpoint is UNIQUE globally — if A and B both toggled Alerts on the same browser,
-- only the last account owns that endpoint row. Push for B then has no target (sent:0)
-- or may have gone to a stale row on another device (sent:1 but wrong phone).
-- curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/lounge-send-activity-push" \
--   -H "apikey: YOUR_LEGACY_EYJ_ANON" \
--   -H "Authorization: Bearer YOUR_LEGACY_EYJ_ANON" \
--   -H "x-lounge-activity-push-secret: YOUR_PUSH_SECRET" \
--   -H "Content-Type: application/json" \
--   -d '{"activityEventId":"PASTE_UUID_FROM_activity_events"}'
