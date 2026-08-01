-- Poker Stable v2 foundation: deal types, multi-slice terms, top-ups, settle, payment ledger.
-- Apply on TEST only until Ryan promotes. Backfills slices from bones 1:1 deals.
--
-- See docs/poker-stable-spec.md

-- ── Extend deals ─────────────────────────────────────────────────────────────

alter table public.poker_stable_deals
  alter column staker_user_id drop not null;

alter table public.poker_stable_deals
  add column if not exists deal_type text not null default 'cash_backing'
    check (deal_type in ('cash_piece', 'cash_backing', 'tournament_piece', 'tournament_package'));

alter table public.poker_stable_deals
  add column if not exists baseline_bankroll numeric(12, 2) not null default 0;

alter table public.poker_stable_deals
  add column if not exists starting_roll numeric(12, 2);

alter table public.poker_stable_deals
  add column if not exists is_migration boolean not null default false;

alter table public.poker_stable_deals
  add column if not exists stake_wide_starting_pl numeric(12, 2);

alter table public.poker_stable_deals
  add column if not exists lifetime_pl_display numeric(12, 2);

alter table public.poker_stable_deals
  add column if not exists manifest_edit_mode text not null default 'locked'
    check (manifest_edit_mode in ('locked', 'open_ack'));

alter table public.poker_stable_deals
  add column if not exists currency text not null default 'USD';

alter table public.poker_stable_deals
  add column if not exists linked_session_id uuid
    references public.poker_bankroll_sessions(id) on delete set null;

alter table public.poker_stable_deals
  add column if not exists settled_at timestamptz;

alter table public.poker_stable_deals
  drop constraint if exists poker_stable_deals_status_check;

alter table public.poker_stable_deals
  add constraint poker_stable_deals_status_check
    check (status in ('draft', 'pending', 'active', 'settled', 'closed', 'declined', 'revoked'));

-- ── Slices (multi-backer terms) ───────────────────────────────────────────────

create table if not exists public.poker_stable_deal_slices (
  id                    uuid           primary key default gen_random_uuid(),
  deal_id               uuid           not null references public.poker_stable_deals(id) on delete cascade,
  slice_index           integer        not null default 0,
  counterparty_kind     text           not null
                        check (counterparty_kind in ('user', 'guest')),
  staker_user_id        uuid           references auth.users(id) on delete cascade,
  guest_label           text,
  guest_email           text,
  action_pct            numeric(6, 3)  not null
                        check (action_pct > 0 and action_pct <= 100),
  pricing_mode          text           not null
                        check (pricing_mode in ('profit_split', 'markup')),
  player_profit_pct     numeric(6, 3)
                        check (
                          player_profit_pct is null
                          or (player_profit_pct >= 0 and player_profit_pct <= 100)
                        ),
  markup_rate           numeric(8, 4)
                        check (markup_rate is null or markup_rate > 0),
  rakeback_mode         text           not null default 'all_to_stake'
                        check (rakeback_mode in ('all_to_stake', 'custom', 'disabled')),
  rakeback_player_pct   numeric(6, 3)
                        check (
                          rakeback_player_pct is null
                          or (rakeback_player_pct >= 0 and rakeback_player_pct <= 100)
                        ),
  starting_pl           numeric(12, 2),
  status                text           not null default 'pending'
                        check (status in ('pending', 'active', 'declined')),
  responded_at          timestamptz,
  label                 text,
  created_at            timestamptz    not null default now(),
  updated_at            timestamptz    not null default now(),
  constraint poker_stable_deal_slices_counterparty_present check (
    (
      counterparty_kind = 'user'
      and staker_user_id is not null
    )
    or (
      counterparty_kind = 'guest'
      and nullif(trim(guest_label), '') is not null
    )
  ),
  constraint poker_stable_deal_slices_pricing_terms check (
    (
      pricing_mode = 'profit_split'
      and player_profit_pct is not null
      and markup_rate is null
    )
    or (
      pricing_mode = 'markup'
      and markup_rate is not null
      and player_profit_pct is null
    )
  )
);

create unique index if not exists poker_stable_deal_slices_deal_staker_uniq
  on public.poker_stable_deal_slices(deal_id, staker_user_id)
  where staker_user_id is not null;

create index if not exists poker_stable_deal_slices_deal_idx
  on public.poker_stable_deal_slices(deal_id, slice_index);

create index if not exists poker_stable_deal_slices_staker_idx
  on public.poker_stable_deal_slices(staker_user_id, status)
  where staker_user_id is not null;

drop trigger if exists poker_stable_deal_slices_updated_at on public.poker_stable_deal_slices;
create trigger poker_stable_deal_slices_updated_at
  before update on public.poker_stable_deal_slices
  for each row execute function public.set_updated_at();

-- ── Package manifest lines ────────────────────────────────────────────────────

create table if not exists public.poker_stable_package_manifest_items (
  id                   uuid           primary key default gen_random_uuid(),
  deal_id              uuid           not null references public.poker_stable_deals(id) on delete cascade,
  line_index           integer        not null default 0,
  tournament_event_id  uuid           references public.poker_tournament_events(id) on delete set null,
  venue_name           text,
  event_date           date,
  buy_in               numeric(12, 2) not null,
  bullets              integer        not null default 1 check (bullets >= 1),
  display_name         text,
  status               text           not null default 'planned'
                       check (status in ('planned', 'completed', 'skipped')),
  linked_session_id    uuid           references public.poker_bankroll_sessions(id) on delete set null,
  created_at           timestamptz    not null default now(),
  updated_at           timestamptz    not null default now()
);

create index if not exists poker_stable_package_manifest_deal_idx
  on public.poker_stable_package_manifest_items(deal_id, line_index);

drop trigger if exists poker_stable_package_manifest_updated_at on public.poker_stable_package_manifest_items;
create trigger poker_stable_package_manifest_updated_at
  before update on public.poker_stable_package_manifest_items
  for each row execute function public.set_updated_at();

-- ── Top-ups ───────────────────────────────────────────────────────────────────

create table if not exists public.poker_stable_deal_topups (
  id                  uuid           primary key default gen_random_uuid(),
  deal_id             uuid           not null references public.poker_stable_deals(id) on delete cascade,
  amount              numeric(12, 2) not null check (amount > 0),
  funded_by_slice_id  uuid           references public.poker_stable_deal_slices(id) on delete set null,
  funding_mode        text           not null default 'deal_wide'
                      check (funding_mode in ('deal_wide', 'single_staker', 'pro_rata')),
  baseline_before     numeric(12, 2) not null,
  baseline_after      numeric(12, 2) not null,
  roll_before         numeric(12, 2) not null,
  roll_after          numeric(12, 2) not null,
  logged_by_user_id   uuid           not null references auth.users(id) on delete cascade,
  note                text,
  created_at          timestamptz    not null default now()
);

create index if not exists poker_stable_deal_topups_deal_idx
  on public.poker_stable_deal_topups(deal_id, created_at desc);

-- ── Settlements ───────────────────────────────────────────────────────────────

create table if not exists public.poker_stable_deal_settlements (
  id                     uuid           primary key default gen_random_uuid(),
  deal_id                uuid           not null references public.poker_stable_deals(id) on delete cascade,
  baseline_at_settle     numeric(12, 2) not null,
  roll_at_settle         numeric(12, 2) not null,
  profit_above_baseline  numeric(12, 2) not null default 0,
  makeup_at_settle       numeric(12, 2) not null default 0,
  rakeback_total         numeric(12, 2) not null default 0,
  settled_by_user_id     uuid           not null references auth.users(id) on delete cascade,
  note                   text,
  created_at             timestamptz    not null default now()
);

create index if not exists poker_stable_deal_settlements_deal_idx
  on public.poker_stable_deal_settlements(deal_id, created_at desc);

create table if not exists public.poker_stable_deal_settlement_lines (
  id               uuid           primary key default gen_random_uuid(),
  settlement_id    uuid           not null references public.poker_stable_deal_settlements(id) on delete cascade,
  slice_id         uuid           not null references public.poker_stable_deal_slices(id) on delete cascade,
  profit_share     numeric(12, 2) not null default 0,
  rakeback_share   numeric(12, 2) not null default 0,
  total_owed       numeric(12, 2) not null,
  direction        text           not null default 'player_to_staker'
                   check (direction in ('player_to_staker', 'staker_to_player')),
  created_at       timestamptz    not null default now()
);

create index if not exists poker_stable_deal_settlement_lines_settlement_idx
  on public.poker_stable_deal_settlement_lines(settlement_id);

-- ── Payment claims (asymmetric ledger) ───────────────────────────────────────

create table if not exists public.poker_stable_payment_claims (
  id                  uuid           primary key default gen_random_uuid(),
  deal_id             uuid           not null references public.poker_stable_deals(id) on delete cascade,
  slice_id            uuid           not null references public.poker_stable_deal_slices(id) on delete cascade,
  settlement_id       uuid           references public.poker_stable_deal_settlements(id) on delete set null,
  actor_user_id       uuid           not null references auth.users(id) on delete cascade,
  amount              numeric(12, 2) not null check (amount > 0),
  claim_kind          text           not null
                      check (claim_kind in ('payment_made', 'payment_received')),
  status              text           not null default 'pending'
                      check (status in ('pending', 'confirmed', 'disputed')),
  responded_by_user_id uuid          references auth.users(id) on delete set null,
  responded_at        timestamptz,
  respond_note        text,
  note                text,
  created_at          timestamptz    not null default now()
);

create index if not exists poker_stable_payment_claims_deal_idx
  on public.poker_stable_payment_claims(deal_id, created_at desc);

create index if not exists poker_stable_payment_claims_slice_idx
  on public.poker_stable_payment_claims(slice_id, created_at desc);

-- ── Access helper ─────────────────────────────────────────────────────────────

create or replace function public.poker_stable_user_can_access_deal(p_deal_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.poker_stable_deals d
    where d.id = p_deal_id
      and d.stakee_user_id = p_uid
  )
  or exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.staker_user_id = p_uid
  )
  or exists (
    select 1
    from public.poker_stable_deals d
    where d.id = p_deal_id
      and d.staker_user_id = p_uid
  );
$$;

revoke all on function public.poker_stable_user_can_access_deal(uuid, uuid) from public;
grant execute on function public.poker_stable_user_can_access_deal(uuid, uuid) to authenticated;

-- ── Backfill slices from bones deals ──────────────────────────────────────────

insert into public.poker_stable_deal_slices (
  deal_id,
  slice_index,
  counterparty_kind,
  staker_user_id,
  action_pct,
  pricing_mode,
  player_profit_pct,
  rakeback_mode,
  status,
  responded_at,
  label
)
select
  d.id,
  0,
  'user',
  d.staker_user_id,
  100,
  'profit_split',
  50,
  'all_to_stake',
  case d.status
    when 'active' then 'active'
    when 'pending' then 'pending'
    else 'declined'
  end,
  d.responded_at,
  d.label
from public.poker_stable_deals d
where d.staker_user_id is not null
  and not exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = d.id
  );

-- Sync baseline from deal bankroll profile where present
update public.poker_stable_deals d
set
  baseline_bankroll = coalesce(p.overall_bankroll, 0),
  starting_roll = coalesce(p.overall_bankroll, 0)
from public.poker_deal_bankroll_profiles p
where p.deal_id = d.id
  and d.baseline_bankroll = 0;

-- ── RLS: slices ───────────────────────────────────────────────────────────────

alter table public.poker_stable_deal_slices enable row level security;

drop policy if exists "poker_stable_deal_slices_select" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_select"
  on public.poker_stable_deal_slices for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_deal_slices_insert" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_insert"
  on public.poker_stable_deal_slices for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
    )
  );

drop policy if exists "poker_stable_deal_slices_update" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_update"
  on public.poker_stable_deal_slices for update
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and (
          d.stakee_user_id = auth.uid()
          or staker_user_id = auth.uid()
        )
    )
  );

drop policy if exists "poker_stable_deal_slices_delete" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_delete"
  on public.poker_stable_deal_slices for delete
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status in ('draft', 'pending')
    )
  );

grant select, insert, update, delete on public.poker_stable_deal_slices to authenticated;

-- ── RLS: manifest ─────────────────────────────────────────────────────────────

alter table public.poker_stable_package_manifest_items enable row level security;

drop policy if exists "poker_stable_package_manifest_select" on public.poker_stable_package_manifest_items;
create policy "poker_stable_package_manifest_select"
  on public.poker_stable_package_manifest_items for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_package_manifest_write" on public.poker_stable_package_manifest_items;
create policy "poker_stable_package_manifest_write"
  on public.poker_stable_package_manifest_items for all
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.poker_stable_package_manifest_items to authenticated;

-- ── RLS: topups, settlements, claims ──────────────────────────────────────────

alter table public.poker_stable_deal_topups enable row level security;
alter table public.poker_stable_deal_settlements enable row level security;
alter table public.poker_stable_deal_settlement_lines enable row level security;
alter table public.poker_stable_payment_claims enable row level security;

drop policy if exists "poker_stable_deal_topups_select" on public.poker_stable_deal_topups;
create policy "poker_stable_deal_topups_select"
  on public.poker_stable_deal_topups for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_deal_topups_insert" on public.poker_stable_deal_topups;
create policy "poker_stable_deal_topups_insert"
  on public.poker_stable_deal_topups for insert
  with check (
    auth.uid() = logged_by_user_id
    and exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );

drop policy if exists "poker_stable_deal_settlements_select" on public.poker_stable_deal_settlements;
create policy "poker_stable_deal_settlements_select"
  on public.poker_stable_deal_settlements for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_deal_settlements_insert" on public.poker_stable_deal_settlements;
create policy "poker_stable_deal_settlements_insert"
  on public.poker_stable_deal_settlements for insert
  with check (
    auth.uid() = settled_by_user_id
    and exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );

drop policy if exists "poker_stable_deal_settlement_lines_select" on public.poker_stable_deal_settlement_lines;
create policy "poker_stable_deal_settlement_lines_select"
  on public.poker_stable_deal_settlement_lines for select
  using (
    exists (
      select 1
      from public.poker_stable_deal_settlements st
      where st.id = settlement_id
        and public.poker_stable_user_can_access_deal(st.deal_id, auth.uid())
    )
  );

drop policy if exists "poker_stable_deal_settlement_lines_insert" on public.poker_stable_deal_settlement_lines;
create policy "poker_stable_deal_settlement_lines_insert"
  on public.poker_stable_deal_settlement_lines for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deal_settlements st
      join public.poker_stable_deals d on d.id = st.deal_id
      where st.id = settlement_id
        and d.stakee_user_id = auth.uid()
    )
  );

drop policy if exists "poker_stable_payment_claims_select" on public.poker_stable_payment_claims;
create policy "poker_stable_payment_claims_select"
  on public.poker_stable_payment_claims for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_payment_claims_insert" on public.poker_stable_payment_claims;
create policy "poker_stable_payment_claims_insert"
  on public.poker_stable_payment_claims for insert
  with check (
    auth.uid() = actor_user_id
    and public.poker_stable_user_can_access_deal(deal_id, auth.uid())
  );

drop policy if exists "poker_stable_payment_claims_update" on public.poker_stable_payment_claims;
create policy "poker_stable_payment_claims_update"
  on public.poker_stable_payment_claims for update
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

grant select, insert on public.poker_stable_deal_topups to authenticated;
grant select, insert on public.poker_stable_deal_settlements to authenticated;
grant select, insert on public.poker_stable_deal_settlement_lines to authenticated;
grant select, insert, update on public.poker_stable_payment_claims to authenticated;

-- Expand deal bankroll RLS to slice stakers
drop policy if exists "poker_deal_bankroll_profiles_select" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_select"
  on public.poker_deal_bankroll_profiles for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

-- Expand session SELECT for slice stakers
drop policy if exists "poker_bankroll_sessions_select" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_select"
  on public.poker_bankroll_sessions for select
  using (
    auth.uid() = user_id
    or (
      deal_id is not null
      and public.poker_stable_user_can_access_deal(deal_id, auth.uid())
      and exists (
        select 1
        from public.poker_stable_deals d
        where d.id = deal_id
          and d.status = 'active'
      )
    )
  );

-- Deal insert: stakee creates multi-slice deals OR staker requests horse (legacy)
drop policy if exists "poker_stable_deals_insert" on public.poker_stable_deals;
create policy "poker_stable_deals_insert"
  on public.poker_stable_deals for insert
  with check (
    auth.uid() = stakee_user_id
    or auth.uid() = staker_user_id
  );
