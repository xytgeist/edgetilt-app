-- Ticket TO WIN / TO COLLECT money fields. Combined American odds optional when
-- the slip never prints a total (casino parlays often only show $ to-win / collect).

alter table public.sports_bets
  alter column odds drop not null;

alter table public.sports_bets
  add column if not exists to_win_dollars numeric
    check (to_win_dollars is null or to_win_dollars >= 0);

alter table public.sports_bets
  add column if not exists to_collect_dollars numeric
    check (to_collect_dollars is null or to_collect_dollars >= 0);

comment on column public.sports_bets.odds is
  'American odds when the ticket prints a total / combined price. Nullable when only $ to-win/collect are known.';

comment on column public.sports_bets.to_win_dollars is
  'Ticket TO WIN / profit (excludes stake).';

comment on column public.sports_bets.to_collect_dollars is
  'Ticket TO COLLECT / YOU WON / Max Payout (includes stake).';
