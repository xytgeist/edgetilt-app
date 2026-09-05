-- App Store Server Notifications V2 idempotency (apple-iap-notify).

create table if not exists public.apple_iap_notification_events (
  notification_uuid text primary key,
  notification_type text not null,
  subtype text,
  processing_status text not null default 'processed'
    check (processing_status in ('processed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.apple_iap_notification_events is
  'Idempotency + audit for App Store Server Notifications V2 (apple-iap-notify).';

alter table public.apple_iap_notification_events enable row level security;
