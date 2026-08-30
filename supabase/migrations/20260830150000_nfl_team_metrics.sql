-- NFL Team EPA & Trench Efficiency Metrics table
-- Provides weekly EPA per play, Success Rate, Pass Block Win Rate (PBWR), Pass Rush Win Rate (PRWR),
-- Run Block Win Rate (RBWR), and Run Stop Win Rate (RSWR) for Rocco & Scott syndicate models.

do $$
begin
  -- 1. Create table
  create table if not exists public.nfl_team_metrics (
    id uuid default gen_random_uuid() primary key,
    team_abbr text not null unique,
    team_name text not null,
    conference text not null check (conference in ('AFC', 'NFC')),
    division text not null check (division in ('East', 'North', 'South', 'West')),
    off_epa_play numeric not null default 0.0,
    def_epa_play numeric not null default 0.0,
    success_rate numeric not null default 45.0,
    pass_block_win_rate numeric not null default 60.0,
    pass_rush_win_rate numeric not null default 45.0,
    run_block_win_rate numeric not null default 70.0,
    run_stop_win_rate numeric not null default 30.0,
    pressure_rate_allowed numeric not null default 30.0,
    pressure_rate_generated numeric not null default 32.0,
    is_custom_override boolean not null default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  -- 2. Enable RLS
  alter table public.nfl_team_metrics enable row level security;

  -- 3. Public read policy
  drop policy if exists "Public read nfl_team_metrics" on public.nfl_team_metrics;
  create policy "Public read nfl_team_metrics"
    on public.nfl_team_metrics
    for select
    using (true);

  -- 4. Staff & Service role update policy
  drop policy if exists "Staff and service manage nfl_team_metrics" on public.nfl_team_metrics;
  create policy "Staff and service manage nfl_team_metrics"
    on public.nfl_team_metrics
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  -- 5. Seed initial baseline metrics for all 32 teams
  insert into public.nfl_team_metrics (
    team_abbr, team_name, conference, division,
    off_epa_play, def_epa_play, success_rate,
    pass_block_win_rate, pass_rush_win_rate,
    run_block_win_rate, run_stop_win_rate,
    pressure_rate_allowed, pressure_rate_generated
  ) values
    -- AFC EAST
    ('BUF', 'Buffalo Bills', 'AFC', 'East', 0.14, -0.04, 49.5, 65, 48, 73, 33, 26, 36),
    ('MIA', 'Miami Dolphins', 'AFC', 'East', 0.08, 0.02, 47.0, 57, 46, 68, 31, 31, 34),
    ('NYJ', 'New York Jets', 'AFC', 'East', 0.03, -0.09, 45.0, 62, 52, 70, 36, 29, 39),
    ('NE', 'New England Patriots', 'AFC', 'East', -0.12, 0.04, 40.0, 52, 40, 64, 29, 39, 28),

    -- AFC NORTH
    ('BAL', 'Baltimore Ravens', 'AFC', 'North', 0.16, -0.07, 51.0, 64, 49, 77, 37, 27, 37),
    ('CIN', 'Cincinnati Bengals', 'AFC', 'North', 0.10, 0.05, 48.0, 59, 43, 67, 28, 32, 31),
    ('CLE', 'Cleveland Browns', 'AFC', 'North', -0.06, -0.11, 42.5, 63, 55, 71, 38, 33, 42),
    ('PIT', 'Pittsburgh Steelers', 'AFC', 'North', -0.02, -0.08, 44.0, 61, 53, 72, 35, 30, 40),

    -- AFC SOUTH
    ('HOU', 'Houston Texans', 'AFC', 'South', 0.09, -0.03, 47.5, 61, 50, 69, 34, 29, 38),
    ('IND', 'Indianapolis Colts', 'AFC', 'South', 0.04, 0.03, 46.0, 67, 44, 74, 30, 25, 32),
    ('JAX', 'Jacksonville Jaguars', 'AFC', 'South', 0.02, 0.04, 45.0, 58, 45, 68, 31, 33, 33),
    ('TEN', 'Tennessee Titans', 'AFC', 'South', -0.09, 0.01, 41.5, 54, 42, 66, 33, 37, 30),

    -- AFC WEST
    ('KC', 'Kansas City Chiefs', 'AFC', 'West', 0.18, -0.08, 52.0, 68, 51, 74, 35, 24, 38),
    ('LAC', 'Los Angeles Chargers', 'AFC', 'West', 0.06, -0.02, 46.5, 66, 47, 73, 32, 26, 35),
    ('DEN', 'Denver Broncos', 'AFC', 'West', -0.04, 0.00, 43.0, 64, 45, 70, 32, 28, 33),
    ('LV', 'Las Vegas Raiders', 'AFC', 'West', -0.08, 0.01, 42.0, 56, 49, 67, 33, 35, 37),

    -- NFC EAST
    ('PHI', 'Philadelphia Eagles', 'NFC', 'East', 0.13, -0.03, 49.0, 71, 52, 78, 34, 23, 39),
    ('DAL', 'Dallas Cowboys', 'NFC', 'East', 0.09, 0.02, 47.0, 63, 50, 69, 30, 28, 38),
    ('WAS', 'Washington Commanders', 'NFC', 'East', 0.07, 0.06, 46.5, 57, 43, 69, 29, 34, 31),
    ('NYG', 'New York Giants', 'NFC', 'East', -0.11, 0.03, 40.5, 49, 48, 65, 31, 41, 36),

    -- NFC NORTH
    ('DET', 'Detroit Lions', 'NFC', 'North', 0.17, -0.02, 52.5, 70, 49, 79, 36, 22, 37),
    ('GB', 'Green Bay Packers', 'NFC', 'North', 0.11, -0.01, 48.5, 67, 48, 72, 33, 25, 36),
    ('MIN', 'Minnesota Vikings', 'NFC', 'North', 0.05, -0.05, 46.0, 62, 51, 68, 34, 30, 39),
    ('CHI', 'Chicago Bears', 'NFC', 'North', 0.01, -0.04, 44.5, 58, 46, 70, 35, 34, 35),

    -- NFC SOUTH
    ('TB', 'Tampa Bay Buccaneers', 'NFC', 'South', 0.06, 0.01, 46.5, 64, 44, 69, 34, 27, 33),
    ('ATL', 'Atlanta Falcons', 'NFC', 'South', 0.04, 0.02, 46.0, 65, 41, 74, 30, 27, 29),
    ('NO', 'New Orleans Saints', 'NFC', 'South', -0.01, 0.00, 44.0, 59, 45, 68, 32, 31, 34),
    ('CAR', 'Carolina Panthers', 'NFC', 'South', -0.15, 0.12, 38.5, 55, 36, 66, 26, 38, 25),

    -- NFC WEST
    ('SF', 'San Francisco 49ers', 'NFC', 'West', 0.15, -0.06, 51.5, 60, 53, 75, 36, 30, 41),
    ('LAR', 'Los Angeles Rams', 'NFC', 'West', 0.08, 0.01, 47.0, 65, 47, 72, 31, 26, 35),
    ('SEA', 'Seattle Seahawks', 'NFC', 'West', 0.03, -0.01, 45.5, 58, 48, 68, 32, 32, 36),
    ('ARI', 'Arizona Cardinals', 'NFC', 'West', 0.02, 0.07, 45.0, 61, 39, 71, 27, 30, 27)
  on conflict (team_abbr) do nothing;
end $$;
