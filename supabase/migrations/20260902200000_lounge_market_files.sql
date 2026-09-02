-- ============================================================================
-- Market file: durable open / current / close lines per Odds API event.
-- Filled automatically from lounge-odds-poll (loadSportOddsContext).
-- Used for Scott gap/steam honesty + CLV grading. Not public marketing copy.
-- Apply statement-by-statement if the SQL runner rejects multi-command files.
-- ============================================================================

create table if not exists public.lounge_market_files (
  event_id text primary key,
  sport_key text not null,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,

  open_spread_home numeric,
  open_spread_home_price integer,
  open_spread_away_price integer,
  open_spread_at timestamptz,
  open_spread_source text,

  current_spread_home numeric,
  current_spread_home_price integer,
  current_spread_away_price integer,
  current_spread_at timestamptz,
  current_spread_source text,

  close_spread_home numeric,
  close_spread_home_price integer,
  close_spread_away_price integer,
  close_spread_at timestamptz,
  close_spread_source text,
  close_locked boolean not null default false,

  open_total numeric,
  open_over_price integer,
  open_under_price integer,
  open_total_at timestamptz,
  open_total_source text,

  current_total numeric,
  current_over_price integer,
  current_under_price integer,
  current_total_at timestamptz,
  current_total_source text,

  close_total numeric,
  close_over_price integer,
  close_under_price integer,
  close_total_at timestamptz,
  close_total_source text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lounge_market_files_sport_commence_idx
  on public.lounge_market_files (sport_key, commence_time);

create index if not exists lounge_market_files_close_unlocked_idx
  on public.lounge_market_files (commence_time)
  where close_locked = false;

comment on table public.lounge_market_files is
  'Syndicate market file: open/current/close spread+total per Odds API event. Auto-updated by odds poll.';

alter table public.lounge_market_files enable row level security;

drop policy if exists lounge_market_files_admin_select on public.lounge_market_files;
create policy lounge_market_files_admin_select on public.lounge_market_files
  for select to authenticated
  using (public.play_log_viewer_is_admin());
