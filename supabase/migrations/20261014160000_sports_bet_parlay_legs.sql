-- Parlay tickets: parent sports_bets row (stake + combined odds) + sports_bet_legs.
-- Apply on test before Log a bet can save parlays.

alter table public.sports_bets drop constraint if exists sports_bets_market_check;

alter table public.sports_bets
  add constraint sports_bets_market_check
  check (market in ('spread', 'h2h', 'total', 'prop', 'parlay', 'other'));

comment on constraint sports_bets_market_check on public.sports_bets is
  'Includes parlay parent tickets; legs live in sports_bet_legs.';

create table if not exists public.sports_bet_legs (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.sports_bets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  leg_index integer not null check (leg_index >= 0),
  event_id text,
  sport_key text,
  sport_label text,
  home_team text,
  away_team text,
  commence_time timestamptz,
  market text not null default 'h2h'
    check (market in ('spread', 'h2h', 'total', 'prop', 'other')),
  side text
    check (side is null or side in ('home', 'away', 'over', 'under', 'draw')),
  selection_label text not null,
  line numeric,
  odds integer,
  player_name text,
  prop_stat text,
  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'push', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bet_id, leg_index)
);

create index if not exists sports_bet_legs_bet_idx
  on public.sports_bet_legs (bet_id, leg_index);

create index if not exists sports_bet_legs_user_status_idx
  on public.sports_bet_legs (user_id, status);

comment on table public.sports_bet_legs is
  'Legs for sports_bets market=parlay. Parent holds stake + combined odds + ticket status.';

alter table public.sports_bet_legs enable row level security;

drop policy if exists sports_bet_legs_select_own on public.sports_bet_legs;
create policy sports_bet_legs_select_own on public.sports_bet_legs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists sports_bet_legs_insert_own on public.sports_bet_legs;
create policy sports_bet_legs_insert_own on public.sports_bet_legs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists sports_bet_legs_update_own on public.sports_bet_legs;
create policy sports_bet_legs_update_own on public.sports_bet_legs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists sports_bet_legs_delete_own on public.sports_bet_legs;
create policy sports_bet_legs_delete_own on public.sports_bet_legs
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.sports_bet_legs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sports_bet_legs_touch_updated_at on public.sports_bet_legs;
create trigger sports_bet_legs_touch_updated_at
  before update on public.sports_bet_legs
  for each row
  execute function public.sports_bet_legs_touch_updated_at();
