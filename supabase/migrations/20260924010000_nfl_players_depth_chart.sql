-- Sleeper depth chart fields for Lounge game hub Roster ordering (starters vs backups).

alter table public.nfl_players
  add column if not exists depth_chart_order integer,
  add column if not exists depth_chart_position text;

comment on column public.nfl_players.depth_chart_order is
  'Sleeper depth_chart_order (1 = listed starter for depth_chart_position slot).';

comment on column public.nfl_players.depth_chart_position is
  'Sleeper depth_chart_position slot (QB, RB, LWR, RWR, SWR, TE, …).';

create index if not exists nfl_players_team_depth_idx
  on public.nfl_players (team, position, depth_chart_order)
  where team is not null;
