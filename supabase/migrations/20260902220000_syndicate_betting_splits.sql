-- ============================================================================
-- Manual betting splits paste (Action PRO / VSiN / human research).
-- Not a vendor API … Ryan pastes ticket% + handle% before slate lock.
-- Chedda reads these when present; synthetic splits never count as a vote.
-- Apply statement-by-statement if the SQL runner rejects multi-command files.
-- ============================================================================

create table if not exists public.syndicate_betting_splits (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null,
  event_id text,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz,
  home_ticket_pct numeric not null,
  home_handle_pct numeric not null,
  away_ticket_pct numeric not null,
  away_handle_pct numeric not null,
  over_ticket_pct numeric,
  over_handle_pct numeric,
  source text not null default 'action_pro'
    check (source in ('action_pro', 'vsin_pro', 'manual', 'other')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syndicate_betting_splits_home_ticket_range
    check (home_ticket_pct >= 0 and home_ticket_pct <= 100),
  constraint syndicate_betting_splits_home_handle_range
    check (home_handle_pct >= 0 and home_handle_pct <= 100),
  constraint syndicate_betting_splits_away_ticket_range
    check (away_ticket_pct >= 0 and away_ticket_pct <= 100),
  constraint syndicate_betting_splits_away_handle_range
    check (away_handle_pct >= 0 and away_handle_pct <= 100)
);

create unique index if not exists syndicate_betting_splits_event_uidx
  on public.syndicate_betting_splits (event_id)
  where event_id is not null and active = true;

create index if not exists syndicate_betting_splits_active_sport_idx
  on public.syndicate_betting_splits (sport_key, active)
  where active = true;

create index if not exists syndicate_betting_splits_teams_idx
  on public.syndicate_betting_splits (sport_key, home_team, away_team)
  where active = true;

comment on table public.syndicate_betting_splits is
  'Human-pasted ticket% vs handle% (Action PRO / VSiN / manual). Chedda uses these when present; not a scraped vendor API.';

alter table public.syndicate_betting_splits enable row level security;

drop policy if exists syndicate_betting_splits_admin_all on public.syndicate_betting_splits;
create policy syndicate_betting_splits_admin_all on public.syndicate_betting_splits
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());
