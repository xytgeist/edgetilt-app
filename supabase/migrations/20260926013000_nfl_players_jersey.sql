-- Jersey number for Lounge game hub field figures + Players roster.
-- Sourced from Sleeper `number` via scripts/sync-nfl-players.mjs.

alter table public.nfl_players
  add column if not exists jersey text;

comment on column public.nfl_players.jersey is
  'Uniform number from Sleeper (text so 0 / leading zeros stay intact).';
