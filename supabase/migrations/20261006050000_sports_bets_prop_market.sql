-- Player prop market + player/stat fields. Sport still lives on sport_key / sport_label.

alter table public.sports_bets drop constraint if exists sports_bets_market_check;

alter table public.sports_bets
  add constraint sports_bets_market_check
  check (market in ('spread', 'h2h', 'total', 'prop', 'other'));

alter table public.sports_bets
  add column if not exists player_name text;

alter table public.sports_bets
  add column if not exists prop_stat text;

comment on column public.sports_bets.player_name is
  'Player prop subject. Empty on game markets.';
comment on column public.sports_bets.prop_stat is
  'Player prop stat (pass yds, rec, etc.).';
