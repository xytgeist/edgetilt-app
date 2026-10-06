-- Tap-through logs (open book = assume placed) need confirm / edit / delete on the tracker row.

alter table public.sports_bets
  add column if not exists confirmed boolean not null default true;

alter table public.sports_bets drop constraint if exists sports_bets_source_check;

alter table public.sports_bets
  add constraint sports_bets_source_check
  check (source in ('manual', 'game_hub', 'odds_cell', 'odds_tap', 'slip', 'csv'));

comment on column public.sports_bets.confirmed is
  'false = tap-through auto log waiting for Confirm / Edit / Delete in Bet Tracker.';
