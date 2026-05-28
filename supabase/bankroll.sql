-- ============================================================
-- Bankroll Manager schema
-- Run on Supabase test (and prod when promoted).
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────

-- One row per user: their current overall bankroll.
create table if not exists public.bankroll_profiles (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  overall_bankroll numeric(12, 2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bankroll_profiles_user_id_unique unique (user_id)
);

-- One row per session.
-- start_amount = money taken for this session.
-- end_amount   = money left at the end (null while session is active).
-- status       = 'active' while running, 'completed' when ended.
create table if not exists public.bankroll_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  casino_name  text,
  start_at     timestamptz not null default now(),
  end_at       timestamptz,
  start_amount numeric(12, 2) not null,
  end_amount   numeric(12, 2),
  status       text        not null default 'active'
                check (status in ('active', 'completed')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────

create index if not exists bankroll_sessions_user_id_idx
  on public.bankroll_sessions(user_id);

create index if not exists bankroll_sessions_user_status_idx
  on public.bankroll_sessions(user_id, status);

create index if not exists bankroll_sessions_user_start_at_idx
  on public.bankroll_sessions(user_id, start_at desc);

-- ── updated_at trigger ───────────────────────────────────────

-- Reuse set_updated_at() if it already exists from another migration.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bankroll_profiles_updated_at on public.bankroll_profiles;
create trigger bankroll_profiles_updated_at
  before update on public.bankroll_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists bankroll_sessions_updated_at on public.bankroll_sessions;
create trigger bankroll_sessions_updated_at
  before update on public.bankroll_sessions
  for each row execute function public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────

alter table public.bankroll_profiles enable row level security;
alter table public.bankroll_sessions  enable row level security;

-- bankroll_profiles: own rows only
drop policy if exists "bankroll_profiles_select" on public.bankroll_profiles;
create policy "bankroll_profiles_select"
  on public.bankroll_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "bankroll_profiles_insert" on public.bankroll_profiles;
create policy "bankroll_profiles_insert"
  on public.bankroll_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "bankroll_profiles_update" on public.bankroll_profiles;
create policy "bankroll_profiles_update"
  on public.bankroll_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "bankroll_profiles_delete" on public.bankroll_profiles;
create policy "bankroll_profiles_delete"
  on public.bankroll_profiles for delete
  using (auth.uid() = user_id);

-- bankroll_sessions: own rows only
drop policy if exists "bankroll_sessions_select" on public.bankroll_sessions;
create policy "bankroll_sessions_select"
  on public.bankroll_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "bankroll_sessions_insert" on public.bankroll_sessions;
create policy "bankroll_sessions_insert"
  on public.bankroll_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "bankroll_sessions_update" on public.bankroll_sessions;
create policy "bankroll_sessions_update"
  on public.bankroll_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "bankroll_sessions_delete" on public.bankroll_sessions;
create policy "bankroll_sessions_delete"
  on public.bankroll_sessions for delete
  using (auth.uid() = user_id);
