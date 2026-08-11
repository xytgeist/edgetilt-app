-- Destructive: delete ALL Poker Stable deals and reset backer bankroll state.
-- Run via: npm run db:query:test -- -f scripts/wipe-poker-stable-deals.sql
-- Prod only when Ryan explicitly asks: npm run db:query:production -- -f scripts/wipe-poker-stable-deals.sql

-- Detach play sessions (FK is SET NULL on deal delete; clear first for clarity).
update public.poker_bankroll_sessions
set deal_id = null
where deal_id is not null;

-- Drop Stable activity noise (deal FK is SET NULL; remove rows instead).
delete from public.activity_events
where poker_stable_deal_id is not null
   or coalesce(event_type, '') like 'poker_stable%';

-- Cascades slices, settlements, commits, allocations, claims, tokens, ledger, etc.
delete from public.poker_stable_deals;

-- Clean slate for backing capital (no live deals remain).
delete from public.poker_stable_backer_bankroll_adjustments;
update public.poker_stable_backer_bankrolls
set
  bankroll_balance = 0,
  realized_backing_pl = 0,
  updated_at = now();
