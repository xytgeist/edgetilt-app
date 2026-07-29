-- Online multi-tabling: tables_count scales assumed hands/hour for BB/100 and $/100.
-- Live sessions stay at 1. Apply on TEST only until Ryan promotes.

alter table public.poker_bankroll_sessions
  add column if not exists tables_count integer not null default 1;

alter table public.poker_bankroll_sessions
  drop constraint if exists poker_bankroll_sessions_tables_count_check;

alter table public.poker_bankroll_sessions
  add constraint poker_bankroll_sessions_tables_count_check
  check (tables_count >= 1 and tables_count <= 24);

comment on column public.poker_bankroll_sessions.tables_count is
  'Tables played concurrently (online multi-tabling). Multiplies assumed hands/hour for rate metrics.';
