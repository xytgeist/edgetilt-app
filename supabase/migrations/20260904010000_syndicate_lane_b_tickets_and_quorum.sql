-- ============================================================================
-- Lane B external handicapper tickets (VSiN / Covers / free-play scrape).
-- Soft-fail intake before slate lock; Quorum may read later.
-- Also extend lounge_bot_picks.picker_name for Quorum fifth desk.
-- ============================================================================

create table if not exists public.syndicate_lane_b_tickets (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  sport_key text not null,
  event_id text,
  matchup_text text not null,
  market text not null
    check (market in ('side', 'total', 'ml')),
  selection text not null,
  line numeric,
  posted_at timestamptz not null default now(),
  source_url text not null,
  weight_factor numeric not null default 1.0
    check (weight_factor > 0 and weight_factor <= 2),
  raw_excerpt text,
  scrape_run_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists syndicate_lane_b_tickets_dedupe_uidx
  on public.syndicate_lane_b_tickets (
    source_id,
    sport_key,
    market,
    matchup_text,
    selection,
    (coalesce(line, (-9999)::numeric)),
    ((posted_at at time zone 'America/Los_Angeles')::date)
  )
  where active = true;

create index if not exists syndicate_lane_b_tickets_sport_active_idx
  on public.syndicate_lane_b_tickets (sport_key, active, posted_at desc)
  where active = true;

create index if not exists syndicate_lane_b_tickets_event_idx
  on public.syndicate_lane_b_tickets (event_id)
  where event_id is not null and active = true;

comment on table public.syndicate_lane_b_tickets is
  'Scraped/reconstructible external handicapper tickets (Lane B). Soft-fail before slate lock.';

alter table public.syndicate_lane_b_tickets enable row level security;

drop policy if exists syndicate_lane_b_tickets_admin_all on public.syndicate_lane_b_tickets;
create policy syndicate_lane_b_tickets_admin_all on public.syndicate_lane_b_tickets
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

-- Quorum fifth ATS desk on picks ledger
alter table public.lounge_bot_picks
  drop constraint if exists lounge_bot_picks_picker_name_check;

alter table public.lounge_bot_picks
  add constraint lounge_bot_picks_picker_name_check
  check (picker_name in ('Scott', 'Rocco', 'Chedda', 'Tank', 'Quorum'));
