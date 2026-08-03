-- Backdate @edgelord manual deposit before first horse session so TWR periods are sane.

update public.poker_stable_backer_bankroll_adjustments adj
set occurred_at = '2026-07-15T12:00:00Z'
from public.profiles p
where adj.user_id = p.user_id
  and lower(trim(p.handle)) = 'edgelord'
  and adj.amount = 50000;
