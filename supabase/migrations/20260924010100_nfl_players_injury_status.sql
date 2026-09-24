-- Sleeper injury_status for Lounge game hub Fantasy / Roster tags (Q / D / Out).

alter table public.nfl_players
  add column if not exists injury_status text;

comment on column public.nfl_players.injury_status is
  'Sleeper injury_status (Questionable, Doubtful, Out, IR, …). Synced by scripts/sync-nfl-players.mjs.';
