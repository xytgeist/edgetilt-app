-- Bet Tracker: default starting bankroll $10,000 (was $0).
-- One-time backfill for rows still on the old default of 0.

alter table public.sports_bet_settings
  alter column bankroll_start set default 10000;

update public.sports_bet_settings
set bankroll_start = 10000
where bankroll_start = 0;

comment on column public.sports_bet_settings.bankroll_start is
  'Starting bankroll in dollars. Current roll = start + settled $ P&L. Default 10000.';
