-- Guest backer contact fields on deal slices (parity with tournament swap guest notify).

alter table public.poker_stable_deal_slices
  add column if not exists guest_phone text;
