-- Run in Supabase SQL Editor (test project) when Lounge/Chat pushes fail.
-- Read results top-to-bottom; each section narrows the failure.

-- ---------------------------------------------------------------------------
-- 1) Is activity_events_enqueue_push still broken (031900 current_setting)?
--    Good: prosrc contains "activity_push_invoke_lounge_edge"
--    Bad:  prosrc contains "current_setting('app.supabase_url'"
-- ---------------------------------------------------------------------------
select
  proname,
  case
    when prosrc like '%activity_push_invoke_lounge_edge%' then 'OK — vault invoke path'
    when prosrc like '%current_setting(''app.supabase_url''%' then 'BROKEN — apply 20260607190000_activity_events_enqueue_push_restore.sql'
    else 'UNKNOWN — inspect prosrc'
  end as enqueue_push_status,
  left(prosrc, 200) as prosrc_preview
from pg_proc
where proname = 'activity_events_enqueue_push';

-- ---------------------------------------------------------------------------
-- 2) Vault secrets present? (names only; values hidden)
--    Need all three: lounge_activity_push_http_secret, _project_url, _supabase_anon_key
--    Anon must be legacy JWT eyJ… — NOT sb_publishable_… (gateway 401 otherwise)
-- ---------------------------------------------------------------------------
select name, created_at
from vault.secrets
where name like 'lounge_activity_push%'
order by name;

-- ---------------------------------------------------------------------------
-- 3) Recent pg_net calls to lounge-send-activity-push
--    status_code 200 + content like '%"sent":1%' = Edge delivered
--    401 / UNAUTHORIZED_INVALID_JWT_FORMAT = fix vault anon key (legacy eyJ)
--    401 + Unauthorized = LOUNGE_ACTIVITY_PUSH_SECRET mismatch vs vault
-- ---------------------------------------------------------------------------
select
  id,
  status_code,
  left(content, 500) as content_preview,
  error_msg,
  created
from net._http_response
where created > now() - interval '24 hours'
order by created desc
limit 20;

-- ---------------------------------------------------------------------------
-- 3b) Feed comment → activity_events trigger present?
-- ---------------------------------------------------------------------------
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.feed_comments'::regclass
  and tgname = 'trg_activity_events_feed_comment_insert';

-- ---------------------------------------------------------------------------
-- 4) Recent activity_events (push pipeline starts here)
-- ---------------------------------------------------------------------------
select id, event_type, recipient_user_id, chat_room_id, created_at
from public.activity_events
order by created_at desc
limit 15;

-- ---------------------------------------------------------------------------
-- 5) Device subscriptions for a recipient (replace UUID)
-- ---------------------------------------------------------------------------
-- select user_id, endpoint, created_at, updated_at
-- from public.push_subscriptions
-- where user_id = 'RECIPIENT_USER_UUID'::uuid;

-- ---------------------------------------------------------------------------
-- 6) pg_cron flush job (likes/bookmarks batch after ~10s)
-- ---------------------------------------------------------------------------
select jobid, jobname, schedule, active
from cron.job
where jobname = 'lounge_activity_push_flush';

-- ---------------------------------------------------------------------------
-- 7) Manual Edge smoke (replace placeholders; run in terminal, not SQL)
-- ---------------------------------------------------------------------------
-- curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/lounge-send-activity-push" \
--   -H "apikey: YOUR_LEGACY_EYJ_ANON" \
--   -H "Authorization: Bearer YOUR_LEGACY_EYJ_ANON" \
--   -H "x-lounge-activity-push-secret: YOUR_PUSH_SECRET" \
--   -H "Content-Type: application/json" \
--   -d '{"activityEventId":"PASTE_ACTIVITY_EVENT_UUID_FROM_SECTION_4"}'
