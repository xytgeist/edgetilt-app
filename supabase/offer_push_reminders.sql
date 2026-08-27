-- Per-user reminder rules and delivery dedupe for offer event push notifications.

create table if not exists public.offer_notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_minutes integer not null check (lead_minutes >= 1 and lead_minutes <= 10080),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists offer_notification_rules_user_lead_unique
  on public.offer_notification_rules(user_id, lead_minutes);

create index if not exists offer_notification_rules_user_id_idx
  on public.offer_notification_rules(user_id);

create table if not exists public.offer_notification_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.offer_events(id) on delete cascade,
  lead_minutes integer not null,
  alert_fire_at timestamptz,
  send_status text not null default 'sent',
  error_message text,
  created_at timestamptz not null default now()
);

-- Dedupe is per SCHEDULED ALERT, not per event: an edited event gets a new alert_fire_at
-- and is allowed to notify once more. Do NOT narrow this to (user_id, event_id,
-- lead_minutes) ... that permits only one send row per event forever, which silently broke
-- edit-renotify for months (see 20260827130000_offer_sends_dedupe_by_fire_time.sql).
create unique index if not exists offer_notification_sends_event_lead_fire_uidx
  on public.offer_notification_sends(event_id, lead_minutes, alert_fire_at);

create index if not exists offer_notification_sends_user_id_idx
  on public.offer_notification_sends(user_id);

create or replace function public.set_offer_notification_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_offer_notification_rules_updated_at on public.offer_notification_rules;
create trigger trg_offer_notification_rules_updated_at
before update on public.offer_notification_rules
for each row
execute function public.set_offer_notification_rules_updated_at();

alter table public.offer_notification_rules enable row level security;
alter table public.offer_notification_sends enable row level security;

drop policy if exists "Users read own offer notification rules" on public.offer_notification_rules;
create policy "Users read own offer notification rules"
on public.offer_notification_rules
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own offer notification rules" on public.offer_notification_rules;
create policy "Users insert own offer notification rules"
on public.offer_notification_rules
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own offer notification rules" on public.offer_notification_rules;
create policy "Users update own offer notification rules"
on public.offer_notification_rules
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own offer notification rules" on public.offer_notification_rules;
create policy "Users delete own offer notification rules"
on public.offer_notification_rules
for delete
using (auth.uid() = user_id);

drop policy if exists "Users read own offer notification sends" on public.offer_notification_sends;
create policy "Users read own offer notification sends"
on public.offer_notification_sends
for select
using (auth.uid() = user_id);
