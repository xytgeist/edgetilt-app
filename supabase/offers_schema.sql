-- Offers Calendar schema (manual entry v1)
-- Paste into Supabase SQL editor.

create table if not exists public.offer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  casino_name text not null,
  offer_type text not null check (offer_type in ('free_play', 'hotel', 'dining', 'gift', 'multiplier', 'tournament', 'drawing', 'other')),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  value_amount numeric(10,2),
  value_text text,
  notes text,
  source_type text not null default 'manual' check (source_type in ('manual', 'image_ai')),
  source_image_path text,
  ai_confidence numeric(5,2),
  alert_preset text not null default 'none' check (
    alert_preset in (
      'none',
      'day_9am',
      'at_time',
      '5_min_before',
      '10_min_before',
      '15_min_before',
      '30_min_before',
      'hour_before',
      '2_hours_before',
      '1_day_before',
      '2_days_before',
      '1_week_before'
    )
  ),
  alert_fire_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_events_end_after_start check (end_at is null or end_at >= start_at)
);

create index if not exists offer_events_user_start_idx
  on public.offer_events (user_id, start_at);

create index if not exists offer_events_type_idx
  on public.offer_events (user_id, offer_type, start_at);

alter table public.offer_events enable row level security;

drop policy if exists "offer_events_select_own" on public.offer_events;
create policy "offer_events_select_own" on public.offer_events
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "offer_events_insert_own" on public.offer_events;
create policy "offer_events_insert_own" on public.offer_events
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "offer_events_update_own" on public.offer_events;
create policy "offer_events_update_own" on public.offer_events
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "offer_events_delete_own" on public.offer_events;
create policy "offer_events_delete_own" on public.offer_events
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_offer_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_offer_events_updated_at on public.offer_events;
create trigger trg_set_offer_events_updated_at
before update on public.offer_events
for each row
execute function public.set_offer_events_updated_at();

-- Default user_id from the signed-in user so inserts satisfy RLS (auth.uid() = user_id)
create or replace function public.set_offer_events_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_offer_events_user_id on public.offer_events;
create trigger trg_set_offer_events_user_id
before insert on public.offer_events
for each row
execute function public.set_offer_events_user_id();
