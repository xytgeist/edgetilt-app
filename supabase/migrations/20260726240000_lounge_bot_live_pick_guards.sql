-- Scott live pick quality: default min_live_edge_pct 6% (was 4%).

begin;

alter table public.lounge_bot_odds_config
  alter column min_live_edge_pct set default 6;

update public.lounge_bot_odds_config
set min_live_edge_pct = 6
where min_live_edge_pct = 4;

comment on column public.lounge_bot_odds_config.min_live_edge_pct is
  'Minimum +EV percent for live in-game edge and period reports (default 6). Pre-match edge uses min_edge_pct.';

commit;
