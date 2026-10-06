-- Odds-cell / slip / CSV intake sources for sports_bets.
-- Apply on test before those sources write.

alter table public.sports_bets drop constraint if exists sports_bets_source_check;

alter table public.sports_bets
  add constraint sports_bets_source_check
  check (source in ('manual', 'game_hub', 'odds_cell', 'slip', 'csv'));
