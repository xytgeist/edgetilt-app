-- Bet Tracker unit size + starting bankroll (current roll = start + settled $ P&L).

create table if not exists public.sports_bet_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  unit_size_dollars numeric not null default 100
    check (unit_size_dollars > 0),
  bankroll_start numeric not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.sports_bet_settings is
  'Sports bet tracker: dollars per unit and starting bankroll. Current bankroll is start plus settled P&L.';

alter table public.sports_bet_settings enable row level security;

drop policy if exists sports_bet_settings_select_own on public.sports_bet_settings;
create policy sports_bet_settings_select_own on public.sports_bet_settings
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists sports_bet_settings_insert_own on public.sports_bet_settings;
create policy sports_bet_settings_insert_own on public.sports_bet_settings
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists sports_bet_settings_update_own on public.sports_bet_settings;
create policy sports_bet_settings_update_own on public.sports_bet_settings
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists sports_bet_settings_delete_own on public.sports_bet_settings;
create policy sports_bet_settings_delete_own on public.sports_bet_settings
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.sports_bet_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sports_bet_settings_touch_updated_at on public.sports_bet_settings;
create trigger sports_bet_settings_touch_updated_at
  before update on public.sports_bet_settings
  for each row
  execute function public.sports_bet_settings_touch_updated_at();

grant select, insert, update, delete on public.sports_bet_settings to authenticated;
