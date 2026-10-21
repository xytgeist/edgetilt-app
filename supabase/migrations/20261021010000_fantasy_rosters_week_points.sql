-- Basketball (and later hockey / baseball) rosters: a player plays several games a week, so the host's week-to-date
-- points, the host injury tag, and multi-position eligibility live on the roster row (NFL keeps reading nfl_players).
alter table public.fantasy_rosters
  add column if not exists week_points numeric,
  add column if not exists injury_status text,
  add column if not exists eligible_positions text[];

comment on column public.fantasy_rosters.week_points is 'Host week-to-date fantasy points for this player (Sleeper matchups players_points), league scoring.';
comment on column public.fantasy_rosters.injury_status is 'Host injury tag (Sleeper NBA injury_status); NFL rows read nfl_players instead.';
comment on column public.fantasy_rosters.eligible_positions is 'Positions the player can fill (Sleeper fantasy_positions, e.g. {PF,SF}).';
