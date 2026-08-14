-- Live poker session clock pause (dinner break, etc.).
-- paused_at set = currently paused. paused_seconds = completed pause time.
-- Hours played = (end_at or now) - start_at - paused_seconds - open pause.

alter table public.poker_bankroll_sessions
  add column if not exists paused_at timestamptz,
  add column if not exists paused_seconds integer not null default 0;

comment on column public.poker_bankroll_sessions.paused_at is
  'When set, the live session clock is paused. Null when running or completed.';

comment on column public.poker_bankroll_sessions.paused_seconds is
  'Accumulated completed pause seconds. Open pause (paused_at) is added at read time.';
