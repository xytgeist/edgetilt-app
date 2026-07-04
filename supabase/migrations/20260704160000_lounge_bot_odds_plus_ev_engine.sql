-- min_edge_pct now means minimum +EV percent on $1 stake (default 2%).

comment on column public.lounge_bot_odds_config.min_edge_pct is
  'Minimum +EV percent return on a $1 stake (e.g. 2 = 2%). h2h devig consensus vs best line.';

alter table public.lounge_bot_odds_config
  alter column min_edge_pct set default 2;
