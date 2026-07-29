-- Poker Bankroll Manager (separate from slots bankroll_sessions).
-- Simple path: venue + cash/tourney + buy-in/cash-out + duration.
-- Advanced columns nullable for grinders.

create table if not exists public.poker_bankroll_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  venue_name         text,
  venue_kind         text        not null default 'live'
                     check (venue_kind in ('live', 'online')),
  session_type       text        not null default 'cash'
                     check (session_type in ('cash', 'tournament')),
  status             text        not null default 'completed'
                     check (status in ('active', 'completed')),
  start_at           timestamptz not null default now(),
  end_at             timestamptz,
  -- Money: buy_in = bring-in / tourney entry; cash_out = walked with
  buy_in             numeric(12, 2) not null default 0,
  cash_out           numeric(12, 2),
  -- Advanced (optional)
  game_variant       text,
  limit_type         text,
  table_size         text,
  small_blind        numeric(12, 2),
  big_blind          numeric(12, 2),
  tournament_name    text,
  field_size         integer,
  start_stack        numeric(14, 2),
  finish_place       integer,
  bounty_winnings    numeric(12, 2),
  reentries          integer,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists poker_bankroll_sessions_user_id_idx
  on public.poker_bankroll_sessions(user_id);

create index if not exists poker_bankroll_sessions_user_start_at_idx
  on public.poker_bankroll_sessions(user_id, start_at desc);

create index if not exists poker_bankroll_sessions_user_type_idx
  on public.poker_bankroll_sessions(user_id, session_type);

create index if not exists poker_bankroll_sessions_user_venue_kind_idx
  on public.poker_bankroll_sessions(user_id, venue_kind);

drop trigger if exists poker_bankroll_sessions_updated_at on public.poker_bankroll_sessions;
create trigger poker_bankroll_sessions_updated_at
  before update on public.poker_bankroll_sessions
  for each row execute function public.set_updated_at();

alter table public.poker_bankroll_sessions enable row level security;

drop policy if exists "poker_bankroll_sessions_select" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_select"
  on public.poker_bankroll_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "poker_bankroll_sessions_insert" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_insert"
  on public.poker_bankroll_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "poker_bankroll_sessions_update" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_update"
  on public.poker_bankroll_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "poker_bankroll_sessions_delete" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_delete"
  on public.poker_bankroll_sessions for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.poker_bankroll_sessions to authenticated;
