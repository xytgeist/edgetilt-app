-- Add guide_slug for lounge-send-activity-push select (40900 broadcast).
-- Safe additive only: do not recreate activity_events_event_type_check here (chat_mention lives in 31120000).

alter table public.activity_events
  add column if not exists guide_slug text;

comment on column public.activity_events.guide_slug is
  'AP Guides deep link slug for ap_guide_released notifications.';

create index if not exists activity_events_guide_release_idx
  on public.activity_events (guide_slug, recipient_user_id)
  where event_type = 'ap_guide_released' and guide_slug is not null;
