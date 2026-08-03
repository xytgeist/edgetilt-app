-- Fix account deletion: settlement sync tables referenced auth.users without ON DELETE CASCADE.

alter table public.poker_stable_settlement_requests
  drop constraint if exists poker_stable_settlement_requests_proposed_by_user_id_fkey;

alter table public.poker_stable_settlement_requests
  add constraint poker_stable_settlement_requests_proposed_by_user_id_fkey
  foreign key (proposed_by_user_id) references auth.users(id) on delete cascade;

alter table public.poker_stable_settlement_request_votes
  drop constraint if exists poker_stable_settlement_request_votes_user_id_fkey;

alter table public.poker_stable_settlement_request_votes
  add constraint poker_stable_settlement_request_votes_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.poker_stable_ledger_entries
  drop constraint if exists poker_stable_ledger_entries_user_id_fkey;

alter table public.poker_stable_ledger_entries
  add constraint poker_stable_ledger_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
