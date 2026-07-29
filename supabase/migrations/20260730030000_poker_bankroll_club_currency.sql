-- Poker bankroll: Club venue kind + session currency (ISO 4217).

alter table public.poker_bankroll_sessions
  drop constraint if exists poker_bankroll_sessions_venue_kind_check;

alter table public.poker_bankroll_sessions
  add constraint poker_bankroll_sessions_venue_kind_check
  check (venue_kind in ('live', 'online', 'club'));

alter table public.poker_bankroll_sessions
  add column if not exists currency text not null default 'USD';

alter table public.poker_bankroll_sessions
  drop constraint if exists poker_bankroll_sessions_currency_check;

alter table public.poker_bankroll_sessions
  add constraint poker_bankroll_sessions_currency_check
  check (currency ~ '^[A-Z]{3}$');

comment on column public.poker_bankroll_sessions.currency is
  'ISO 4217 currency code for session money fields (default USD).';
