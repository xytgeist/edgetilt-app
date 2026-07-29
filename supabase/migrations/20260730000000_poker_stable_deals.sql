-- Poker Stable Manager (bones): per-deal On Stake bankrolls.
-- Staker requests a horse (stakee); on accept, deal gets its own roll + sessions.
-- Apply on TEST only until Ryan promotes. Do not apply to production without explicit ask.
--
-- RLS bones (incomplete by design):
-- - Stakee: CRUD own personal sessions + deal-scoped rows for deals they belong to
-- - Staker: SELECT deal profile + deal sessions when status = active
-- - Session inserts remain stakee-only (staker is read/sync, not remote logger)

-- ── Deals (staker ↔ horse) ───────────────────────────────────────────────────

create table if not exists public.poker_stable_deals (
  id              uuid        primary key default gen_random_uuid(),
  staker_user_id  uuid        not null references auth.users(id) on delete cascade,
  stakee_user_id  uuid        not null references auth.users(id) on delete cascade,
  status          text        not null default 'pending'
                  check (status in ('pending', 'active', 'revoked', 'declined')),
  label           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  responded_at    timestamptz,
  constraint poker_stable_deals_distinct_parties check (staker_user_id <> stakee_user_id)
);

create index if not exists poker_stable_deals_staker_idx
  on public.poker_stable_deals(staker_user_id, status, created_at desc);

create index if not exists poker_stable_deals_stakee_idx
  on public.poker_stable_deals(stakee_user_id, status, created_at desc);

drop trigger if exists poker_stable_deals_updated_at on public.poker_stable_deals;
create trigger poker_stable_deals_updated_at
  before update on public.poker_stable_deals
  for each row execute function public.set_updated_at();

alter table public.poker_stable_deals enable row level security;

drop policy if exists "poker_stable_deals_select" on public.poker_stable_deals;
create policy "poker_stable_deals_select"
  on public.poker_stable_deals for select
  using (auth.uid() = staker_user_id or auth.uid() = stakee_user_id);

drop policy if exists "poker_stable_deals_insert" on public.poker_stable_deals;
create policy "poker_stable_deals_insert"
  on public.poker_stable_deals for insert
  with check (auth.uid() = staker_user_id);

drop policy if exists "poker_stable_deals_update" on public.poker_stable_deals;
create policy "poker_stable_deals_update"
  on public.poker_stable_deals for update
  using (auth.uid() = staker_user_id or auth.uid() = stakee_user_id);

drop policy if exists "poker_stable_deals_delete" on public.poker_stable_deals;
create policy "poker_stable_deals_delete"
  on public.poker_stable_deals for delete
  using (auth.uid() = staker_user_id);

grant select, insert, update, delete on public.poker_stable_deals to authenticated;

-- ── Per-deal On Stake bankroll ───────────────────────────────────────────────

create table if not exists public.poker_deal_bankroll_profiles (
  deal_id          uuid        primary key references public.poker_stable_deals(id) on delete cascade,
  overall_bankroll numeric(12, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists poker_deal_bankroll_profiles_updated_at on public.poker_deal_bankroll_profiles;
create trigger poker_deal_bankroll_profiles_updated_at
  before update on public.poker_deal_bankroll_profiles
  for each row execute function public.set_updated_at();

alter table public.poker_deal_bankroll_profiles enable row level security;

drop policy if exists "poker_deal_bankroll_profiles_select" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_select"
  on public.poker_deal_bankroll_profiles for select
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and (
          d.stakee_user_id = auth.uid()
          or (d.staker_user_id = auth.uid() and d.status = 'active')
        )
    )
  );

drop policy if exists "poker_deal_bankroll_profiles_insert" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_insert"
  on public.poker_deal_bankroll_profiles for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );

drop policy if exists "poker_deal_bankroll_profiles_update" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_update"
  on public.poker_deal_bankroll_profiles for update
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );

drop policy if exists "poker_deal_bankroll_profiles_delete" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_delete"
  on public.poker_deal_bankroll_profiles for delete
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.poker_deal_bankroll_profiles to authenticated;

-- ── Sessions: optional deal_id (null = personal) ─────────────────────────────

alter table public.poker_bankroll_sessions
  add column if not exists deal_id uuid references public.poker_stable_deals(id) on delete set null;

create index if not exists poker_bankroll_sessions_user_deal_idx
  on public.poker_bankroll_sessions(user_id, deal_id, start_at desc);

create index if not exists poker_bankroll_sessions_deal_id_idx
  on public.poker_bankroll_sessions(deal_id)
  where deal_id is not null;

-- Expand session SELECT so active stakers can sync deal sessions.
drop policy if exists "poker_bankroll_sessions_select" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_select"
  on public.poker_bankroll_sessions for select
  using (
    auth.uid() = user_id
    or (
      deal_id is not null
      and exists (
        select 1
        from public.poker_stable_deals d
        where d.id = deal_id
          and d.staker_user_id = auth.uid()
          and d.status = 'active'
      )
    )
  );

-- Stakee-only writes; deal sessions only when horse on an active deal.
drop policy if exists "poker_bankroll_sessions_insert" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_insert"
  on public.poker_bankroll_sessions for insert
  with check (
    auth.uid() = user_id
    and (
      deal_id is null
      or exists (
        select 1
        from public.poker_stable_deals d
        where d.id = deal_id
          and d.stakee_user_id = auth.uid()
          and d.status = 'active'
      )
    )
  );

drop policy if exists "poker_bankroll_sessions_update" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_update"
  on public.poker_bankroll_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "poker_bankroll_sessions_delete" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_delete"
  on public.poker_bankroll_sessions for delete
  using (auth.uid() = user_id);
