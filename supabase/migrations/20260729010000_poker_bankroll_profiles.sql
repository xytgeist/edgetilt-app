-- Poker overall bankroll (separate from slots bankroll_profiles).

create table if not exists public.poker_bankroll_profiles (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  overall_bankroll numeric(12, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint poker_bankroll_profiles_user_id_unique unique (user_id)
);

drop trigger if exists poker_bankroll_profiles_updated_at on public.poker_bankroll_profiles;
create trigger poker_bankroll_profiles_updated_at
  before update on public.poker_bankroll_profiles
  for each row execute function public.set_updated_at();

alter table public.poker_bankroll_profiles enable row level security;

drop policy if exists "poker_bankroll_profiles_select" on public.poker_bankroll_profiles;
create policy "poker_bankroll_profiles_select"
  on public.poker_bankroll_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "poker_bankroll_profiles_insert" on public.poker_bankroll_profiles;
create policy "poker_bankroll_profiles_insert"
  on public.poker_bankroll_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "poker_bankroll_profiles_update" on public.poker_bankroll_profiles;
create policy "poker_bankroll_profiles_update"
  on public.poker_bankroll_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "poker_bankroll_profiles_delete" on public.poker_bankroll_profiles;
create policy "poker_bankroll_profiles_delete"
  on public.poker_bankroll_profiles for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.poker_bankroll_profiles to authenticated;
