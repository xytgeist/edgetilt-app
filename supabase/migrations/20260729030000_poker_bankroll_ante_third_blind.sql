-- Cash-game stake details used on the main Start Session form (not Advanced).

alter table public.poker_bankroll_sessions
  add column if not exists third_blind numeric(12, 2),
  add column if not exists ante numeric(12, 2);
