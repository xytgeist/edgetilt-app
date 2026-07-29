-- Tournament (and optional cash) re-buy / add-on amounts that add to total session cost.
-- P/L uses buy_in + rebuy_amount + addon_amount as invested basis.
-- Apply on TEST only until Ryan promotes.

alter table public.poker_bankroll_sessions
  add column if not exists rebuy_amount numeric(12, 2) not null default 0,
  add column if not exists addon_amount numeric(12, 2) not null default 0;

comment on column public.poker_bankroll_sessions.rebuy_amount is
  'Total $ re-bought / re-entered; adds to invested cost with buy_in.';
comment on column public.poker_bankroll_sessions.addon_amount is
  'Total $ add-ons; adds to invested cost with buy_in.';
