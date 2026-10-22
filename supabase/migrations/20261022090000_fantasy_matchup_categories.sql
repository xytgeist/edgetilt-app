-- Categories leagues (ESPN / Yahoo NBA H2H categories): per-matchup category totals and results from the host.
-- Shape: { left: { stat_key: value }, right: { stat_key: value }, results: { stat_key: 'WIN' | 'LOSS' | 'TIE' } (left's
-- view), wins, losses, ties (left's) }. mine_score / opp_score hold category wins for those leagues. Null for points.

alter table public.fantasy_matchups add column if not exists categories jsonb;

comment on column public.fantasy_matchups.categories is
  'Categories leagues only: { left, right, results, wins, losses, ties } from the host (left = mine_team_id side).';
