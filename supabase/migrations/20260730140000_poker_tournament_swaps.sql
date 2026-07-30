-- Tournament swaps v1: soft event fingerprints + bilateral % deals + guest claim tokens.
-- Apply on TEST only until Ryan promotes. Do not apply to production without explicit ask.
--
-- Soft event identity = venue + calendar date + buy-in + game_variant + currency
-- (free-text tournament_name is display-only; sibling splits rare same-fingerprint collisions).

create extension if not exists pgcrypto;

-- ── Soft events ──────────────────────────────────────────────────────────────

create table if not exists public.poker_tournament_events (
  id                   uuid        primary key default gen_random_uuid(),
  fingerprint_key      text        not null,
  fingerprint_sibling  integer     not null default 0,
  venue_name           text        not null,
  event_date           date        not null,
  buy_in               numeric(12, 2) not null,
  game_variant         text,
  currency             text        not null default 'USD',
  display_name         text,
  created_by           uuid        references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint poker_tournament_events_fingerprint_uniq
    unique (fingerprint_key, fingerprint_sibling),
  constraint poker_tournament_events_sibling_nonneg
    check (fingerprint_sibling >= 0)
);

create index if not exists poker_tournament_events_fingerprint_idx
  on public.poker_tournament_events(fingerprint_key);

create index if not exists poker_tournament_events_venue_date_idx
  on public.poker_tournament_events(venue_name, event_date desc);

drop trigger if exists poker_tournament_events_updated_at on public.poker_tournament_events;
create trigger poker_tournament_events_updated_at
  before update on public.poker_tournament_events
  for each row execute function public.set_updated_at();

alter table public.poker_tournament_events enable row level security;

drop policy if exists "poker_tournament_events_select" on public.poker_tournament_events;
create policy "poker_tournament_events_select"
  on public.poker_tournament_events for select
  to authenticated
  using (true);

drop policy if exists "poker_tournament_events_insert" on public.poker_tournament_events;
create policy "poker_tournament_events_insert"
  on public.poker_tournament_events for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "poker_tournament_events_update" on public.poker_tournament_events;
create policy "poker_tournament_events_update"
  on public.poker_tournament_events for update
  to authenticated
  using (auth.uid() = created_by or created_by is null);

grant select, insert, update on public.poker_tournament_events to authenticated;

-- Link sessions → soft events
alter table public.poker_bankroll_sessions
  add column if not exists tournament_event_id uuid
    references public.poker_tournament_events(id) on delete set null;

create index if not exists poker_bankroll_sessions_tournament_event_idx
  on public.poker_bankroll_sessions(tournament_event_id)
  where tournament_event_id is not null;

-- ── Swaps ─────────────────────────────────────────────────────────────────────

create table if not exists public.poker_tournament_swaps (
  id                              uuid        primary key default gen_random_uuid(),
  creator_user_id                 uuid        not null references auth.users(id) on delete cascade,
  creator_session_id              uuid        references public.poker_bankroll_sessions(id) on delete set null,
  tournament_event_id             uuid        references public.poker_tournament_events(id) on delete set null,

  counterparty_kind               text        not null
                                  check (counterparty_kind in ('user', 'guest')),
  counterparty_user_id            uuid        references auth.users(id) on delete set null,
  counterparty_guest_label        text,
  counterparty_guest_phone        text,
  counterparty_guest_email        text,
  counterparty_session_id         uuid        references public.poker_bankroll_sessions(id) on delete set null,
  counterparty_session_accepted_at timestamptz,

  pct_creator_gives               numeric(6, 3) not null
                                  check (pct_creator_gives >= 0 and pct_creator_gives <= 100),
  pct_counterparty_gives          numeric(6, 3) not null
                                  check (pct_counterparty_gives >= 0 and pct_counterparty_gives <= 100),

  creator_buy_in                  numeric(12, 2),
  creator_prize                   numeric(12, 2),
  creator_result_ready            boolean     not null default false,
  counterparty_buy_in             numeric(12, 2),
  counterparty_prize              numeric(12, 2),
  counterparty_result_source      text
                                  check (
                                    counterparty_result_source is null
                                    or counterparty_result_source in ('session', 'manual')
                                  ),
  counterparty_result_ready       boolean     not null default false,

  status                          text        not null default 'active'
                                  check (status in ('active', 'settled', 'cancelled')),
  -- Positive => counterparty owes creator; negative => creator owes counterparty.
  settlement_amount               numeric(12, 2),
  settled_at                      timestamptz,

  creator_marked_paid             boolean     not null default false,
  counterparty_marked_paid        boolean     not null default false,

  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint poker_tournament_swaps_counterparty_present check (
    (
      counterparty_kind = 'user'
      and counterparty_user_id is not null
      and counterparty_user_id <> creator_user_id
    )
    or (
      counterparty_kind = 'guest'
      and nullif(trim(counterparty_guest_label), '') is not null
    )
  )
);

create index if not exists poker_tournament_swaps_creator_idx
  on public.poker_tournament_swaps(creator_user_id, created_at desc);

create index if not exists poker_tournament_swaps_counterparty_user_idx
  on public.poker_tournament_swaps(counterparty_user_id, created_at desc)
  where counterparty_user_id is not null;

create index if not exists poker_tournament_swaps_creator_session_idx
  on public.poker_tournament_swaps(creator_session_id)
  where creator_session_id is not null;

create index if not exists poker_tournament_swaps_counterparty_session_idx
  on public.poker_tournament_swaps(counterparty_session_id)
  where counterparty_session_id is not null;

drop trigger if exists poker_tournament_swaps_updated_at on public.poker_tournament_swaps;
create trigger poker_tournament_swaps_updated_at
  before update on public.poker_tournament_swaps
  for each row execute function public.set_updated_at();

alter table public.poker_tournament_swaps enable row level security;

drop policy if exists "poker_tournament_swaps_select" on public.poker_tournament_swaps;
create policy "poker_tournament_swaps_select"
  on public.poker_tournament_swaps for select
  to authenticated
  using (
    auth.uid() = creator_user_id
    or auth.uid() = counterparty_user_id
  );

drop policy if exists "poker_tournament_swaps_insert" on public.poker_tournament_swaps;
create policy "poker_tournament_swaps_insert"
  on public.poker_tournament_swaps for insert
  to authenticated
  with check (auth.uid() = creator_user_id);

drop policy if exists "poker_tournament_swaps_update" on public.poker_tournament_swaps;
create policy "poker_tournament_swaps_update"
  on public.poker_tournament_swaps for update
  to authenticated
  using (
    auth.uid() = creator_user_id
    or auth.uid() = counterparty_user_id
  );

drop policy if exists "poker_tournament_swaps_delete" on public.poker_tournament_swaps;
create policy "poker_tournament_swaps_delete"
  on public.poker_tournament_swaps for delete
  to authenticated
  using (auth.uid() = creator_user_id);

grant select, insert, update, delete on public.poker_tournament_swaps to authenticated;

-- ── Guest claim tokens (raw token never stored) ───────────────────────────────

create table if not exists public.poker_tournament_swap_claim_tokens (
  id                 uuid        primary key default gen_random_uuid(),
  swap_id            uuid        not null references public.poker_tournament_swaps(id) on delete cascade,
  token_hash         text        not null unique,
  expires_at         timestamptz not null,
  claimed_at         timestamptz,
  claimed_by_user_id uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists poker_tournament_swap_claim_tokens_swap_idx
  on public.poker_tournament_swap_claim_tokens(swap_id);

alter table public.poker_tournament_swap_claim_tokens enable row level security;

-- No direct client access; Edge + security definer RPCs only.
revoke all on public.poker_tournament_swap_claim_tokens from authenticated, anon;
grant all on public.poker_tournament_swap_claim_tokens to service_role;

-- ── Settlement helper ─────────────────────────────────────────────────────────

create or replace function public.poker_tournament_swap_try_settle(p_swap_id uuid)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps;
  creator_net numeric;
  counterparty_net numeric;
  creator_owes numeric;
  counterparty_owes numeric;
  amount numeric;
begin
  select * into s from public.poker_tournament_swaps where id = p_swap_id for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    return s;
  end if;
  if not s.creator_result_ready or not s.counterparty_result_ready then
    return s;
  end if;

  creator_net := coalesce(s.creator_prize, 0) - coalesce(s.creator_buy_in, 0);
  counterparty_net := coalesce(s.counterparty_prize, 0) - coalesce(s.counterparty_buy_in, 0);
  -- Bust / no cash ⇒ 0 owed from that side (positive net only).
  creator_owes := greatest(0, creator_net) * (s.pct_creator_gives / 100.0);
  counterparty_owes := greatest(0, counterparty_net) * (s.pct_counterparty_gives / 100.0);
  amount := round((counterparty_owes - creator_owes)::numeric, 2);

  update public.poker_tournament_swaps
  set
    status = 'settled',
    settlement_amount = amount,
    settled_at = coalesce(settled_at, now()),
    updated_at = now()
  where id = p_swap_id
  returning * into s;

  return s;
end;
$$;

revoke all on function public.poker_tournament_swap_try_settle(uuid) from public;
grant execute on function public.poker_tournament_swap_try_settle(uuid) to authenticated, service_role;

-- ── Guest claim RPCs (anon + authenticated via raw token) ─────────────────────

create or replace function public.poker_tournament_swap_claim_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_tournament_swap_claim_tokens;
  s public.poker_tournament_swaps;
  creator_label text;
  event_label text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_tournament_swap_claim_tokens
  where token_hash = th;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into s from public.poker_tournament_swaps where id = tok.swap_id;
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.handle), ''), 'Player')
    into creator_label
  from public.profiles p
  where p.id = s.creator_user_id;

  select coalesce(nullif(trim(e.display_name), ''), e.venue_name)
    into event_label
  from public.poker_tournament_events e
  where e.id = s.tournament_event_id;

  return jsonb_build_object(
    'swap_id', s.id,
    'status', s.status,
    'creator_label', coalesce(creator_label, 'Player'),
    'guest_label', s.counterparty_guest_label,
    'pct_creator_gives', s.pct_creator_gives,
    'pct_counterparty_gives', s.pct_counterparty_gives,
    'event_label', event_label,
    'creator_result_ready', s.creator_result_ready,
    'creator_buy_in', s.creator_buy_in,
    'creator_prize', s.creator_prize,
    'counterparty_result_ready', s.counterparty_result_ready,
    'counterparty_buy_in', s.counterparty_buy_in,
    'counterparty_prize', s.counterparty_prize,
    'settlement_amount', s.settlement_amount,
    'counterparty_marked_paid', s.counterparty_marked_paid,
    'expires_at', tok.expires_at
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_preview(text) from public;
grant execute on function public.poker_tournament_swap_claim_preview(text) to anon, authenticated, service_role;

create or replace function public.poker_tournament_swap_claim_submit(
  p_token text,
  p_buy_in numeric,
  p_prize numeric,
  p_mark_paid boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  th text;
  tok public.poker_tournament_swap_claim_tokens;
  s public.poker_tournament_swaps;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid token';
  end if;
  if p_buy_in is null or p_buy_in < 0 then
    raise exception 'buy-in must be >= 0';
  end if;
  if p_prize is null or p_prize < 0 then
    raise exception 'prize must be >= 0';
  end if;

  th := encode(digest(trim(p_token), 'sha256'), 'hex');
  select * into tok
  from public.poker_tournament_swap_claim_tokens
  where token_hash = th
  for update;
  if not found then
    raise exception 'invalid or expired claim link';
  end if;
  if tok.expires_at < now() then
    raise exception 'claim link expired';
  end if;

  select * into s from public.poker_tournament_swaps where id = tok.swap_id for update;
  if not found or s.status = 'cancelled' then
    raise exception 'swap not found';
  end if;
  if s.counterparty_kind <> 'guest' then
    raise exception 'claim link is for guest swaps only';
  end if;

  update public.poker_tournament_swaps
  set
    counterparty_buy_in = p_buy_in,
    counterparty_prize = p_prize,
    counterparty_result_source = 'manual',
    counterparty_result_ready = true,
    counterparty_marked_paid = case
      when coalesce(p_mark_paid, false) then true
      else counterparty_marked_paid
    end,
    updated_at = now()
  where id = s.id;

  update public.poker_tournament_swap_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = auth.uid()
  where id = tok.id;

  s := public.poker_tournament_swap_try_settle(s.id);

  return jsonb_build_object(
    'ok', true,
    'status', s.status,
    'settlement_amount', s.settlement_amount,
    'counterparty_marked_paid', s.counterparty_marked_paid
  );
end;
$$;

revoke all on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean) from public;
grant execute on function public.poker_tournament_swap_claim_submit(text, numeric, numeric, boolean)
  to anon, authenticated, service_role;

comment on table public.poker_tournament_events is
  'Soft tournament event clusters: fingerprint = venue|date|buyin|game|currency; name is display-only.';
comment on table public.poker_tournament_swaps is
  'Bilateral tournament % swaps (pct_creator_gives ↔ pct_counterparty_gives) settled on positive net only.';
