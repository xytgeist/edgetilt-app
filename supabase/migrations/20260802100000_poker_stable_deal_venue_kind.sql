-- Stake default venue (live vs online) for session defaults on tournament packages.

alter table public.poker_stable_deals
  add column if not exists venue_kind text not null default 'live'
    check (venue_kind in ('live', 'online', 'club'));
