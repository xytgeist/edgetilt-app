-- Backer-initiated deals may target a guest player (not on Edge) with contact fields.
-- Apply on TEST only until Ryan promotes.

alter table public.poker_stable_deals
  alter column stakee_user_id drop not null;

alter table public.poker_stable_deals
  add column if not exists stakee_guest_label text,
  add column if not exists stakee_guest_phone text,
  add column if not exists stakee_guest_email text;

alter table public.poker_stable_deals
  drop constraint if exists poker_stable_deals_distinct_parties;

alter table public.poker_stable_deals
  add constraint poker_stable_deals_distinct_parties
  check (
    staker_user_id is null
    or stakee_user_id is null
    or staker_user_id <> stakee_user_id
  );

alter table public.poker_stable_deals
  drop constraint if exists poker_stable_deals_stakee_target_check;

alter table public.poker_stable_deals
  add constraint poker_stable_deals_stakee_target_check
  check (
    (
      stakee_user_id is not null
      and coalesce(trim(stakee_guest_label), '') = ''
    )
    or (
      stakee_user_id is null
      and coalesce(trim(stakee_guest_label), '') <> ''
    )
  );
