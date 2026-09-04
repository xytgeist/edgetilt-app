-- ============================================================================
-- NFL PVAL injury → market residual ledger (calibration scaffold).
-- Logs first hard-OUT detection with booked PVAL + spread snapshot.
-- Residuals fill when lounge_market_files.close_locked (manual review only;
-- does NOT auto-rewrite nfl_player_pvals).
-- Apply statement-by-statement if the SQL runner rejects multi-command files.
-- ============================================================================

create table if not exists public.nfl_pval_injury_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  sport_key text not null default 'americanfootball_nfl',
  home_team text not null,
  away_team text not null,
  commence_time timestamptz,

  player_name text not null,
  normalized_name text not null,
  team_name text not null,
  team_side text not null check (team_side in ('home', 'away')),
  position text,
  status text not null,

  -- Booked impact at first hard-OUT detection (post status scale + QB replacement;
  -- before team soft/hard non-QB caps). Units = pts of spread help to the OTHER side.
  booked_pval numeric not null default 0,
  booked_note text,

  detected_at timestamptz not null default now(),
  spread_home_at_detect numeric,
  spread_source_at_detect text,
  open_spread_home numeric,

  -- Filled once market close locks
  close_spread_home numeric,
  spread_move_home numeric,
  expected_spread_move_home numeric,
  residual_home numeric,
  residual_filled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nfl_pval_injury_events_event_player_uidx unique (event_id, normalized_name)
);

create index if not exists nfl_pval_injury_events_commence_idx
  on public.nfl_pval_injury_events (commence_time desc);

create index if not exists nfl_pval_injury_events_residual_pending_idx
  on public.nfl_pval_injury_events (event_id)
  where residual_filled_at is null;

create index if not exists nfl_pval_injury_events_player_idx
  on public.nfl_pval_injury_events (normalized_name);

comment on table public.nfl_pval_injury_events is
  'PVAL calibration ledger: first hard-OUT + spread snapshot; residual vs close. Manual review only.';

alter table public.nfl_pval_injury_events enable row level security;

drop policy if exists nfl_pval_injury_events_admin_select on public.nfl_pval_injury_events;
create policy nfl_pval_injury_events_admin_select on public.nfl_pval_injury_events
  for select to authenticated
  using (public.play_log_viewer_is_admin());
