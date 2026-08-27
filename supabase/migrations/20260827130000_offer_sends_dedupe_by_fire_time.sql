-- Offer reminders were sending 2-3 times per alert (live since 20260507 / 813561586).
--
-- Root cause: dedupe compared a wall-clock send timestamp against the scheduled fire
-- time (`sentMs < fireMs`) to detect "event edited since last send". But the sender
-- deliberately fires EARLY (lookaheadMinutes), so every legitimate send satisfied that
-- condition and re-qualified itself on the next tick. A second defect (building the
-- last-sent map with no ORDER BY / aggregate, so last-wins could retain an older row)
-- stretched it to a third send.
--
-- Fix: record WHICH alert_fire_at each send covered and dedupe on that exact value.
-- Exact instead of heuristic, and a genuine edit (fire time moves) becomes a new key
-- so it legitimately notifies once more. The unique index also makes concurrent cron
-- ticks safe, since the old check was read-then-write with no constraint behind it.

alter table public.offer_notification_sends
  add column if not exists alert_fire_at timestamptz;

comment on column public.offer_notification_sends.alert_fire_at is
  'The offer_events.alert_fire_at this send covered. Dedupe key with (event_id, lead_minutes); do not compare created_at to fire time (sender fires early by design).';

-- Backfill from the parent event so historical rows participate in the new key.
update public.offer_notification_sends s
set alert_fire_at = e.alert_fire_at
from public.offer_events e
where e.id = s.event_id
  and s.alert_fire_at is null;

-- Collapse the duplicate sends this bug already produced, keeping the earliest per key,
-- so the unique index below can be created.
delete from public.offer_notification_sends s
using public.offer_notification_sends keep
where s.event_id = keep.event_id
  and s.lead_minutes = keep.lead_minutes
  and s.alert_fire_at is not distinct from keep.alert_fire_at
  and s.alert_fire_at is not null
  and (
    keep.created_at < s.created_at
    or (keep.created_at = s.created_at and keep.id < s.id)
  );

create unique index if not exists offer_notification_sends_event_lead_fire_uidx
  on public.offer_notification_sends (event_id, lead_minutes, alert_fire_at);
