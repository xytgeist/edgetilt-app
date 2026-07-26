-- Scott odds bot alert thresholds v1 (Grok review): higher EV floors, tighter daily caps, arb at 2%.

begin;

alter table public.lounge_bot_odds_config
  alter column min_edge_pct set default 4;

alter table public.lounge_bot_odds_config
  alter column max_edge_alerts_per_day set default 8;

alter table public.lounge_bot_odds_config
  alter column min_best_bet_hour_ev_pct set default 6;

alter table public.lounge_bot_odds_config
  alter column min_live_edge_pct set default 7.5;

alter table public.lounge_bot_odds_config
  alter column max_live_alerts_per_day set default 6;

alter table public.lounge_bot_odds_config
  alter column max_period_reports_per_day set default 4;

alter table public.lounge_bot_odds_config
  alter column min_arb_profit_pct set default 2;

alter table public.lounge_bot_odds_config
  alter column max_line_alerts_per_day set default 8;

alter table public.lounge_bot_odds_config
  alter column max_sharp_reports_per_day set default 3;

alter table public.lounge_bot_odds_config
  alter column min_value_bet_radar_ev_pct set default 5;

alter table public.lounge_bot_odds_config
  alter column max_value_bet_radar_posts_per_day set default 12;

alter table public.lounge_bot_odds_config
  alter column max_context_alerts_per_day set default 6;

update public.lounge_bot_odds_config
set
  min_edge_pct = 4,
  max_edge_alerts_per_day = 8,
  min_best_bet_hour_ev_pct = 6,
  min_live_edge_pct = 7.5,
  max_live_alerts_per_day = 6,
  max_period_reports_per_day = 4,
  min_arb_profit_pct = 2,
  max_line_alerts_per_day = 8,
  max_sharp_reports_per_day = 3,
  min_value_bet_radar_ev_pct = 5,
  max_value_bet_radar_posts_per_day = 12,
  max_context_alerts_per_day = 6;

comment on column public.lounge_bot_odds_config.min_edge_pct is
  'Minimum +EV percent on $1 stake for pre-match edge alerts (default 4). Live uses min_live_edge_pct.';

comment on column public.lounge_bot_odds_config.min_live_edge_pct is
  'Minimum +EV percent for live in-game edge and period reports (default 7.5). Pre-match edge uses min_edge_pct.';

comment on column public.lounge_bot_odds_config.min_arb_profit_pct is
  'Minimum guaranteed cross-book arb profit percent before Arb Watch posts (default 2).';

commit;
