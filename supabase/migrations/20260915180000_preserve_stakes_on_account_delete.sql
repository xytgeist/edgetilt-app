-- Keep poker Stable deals / slices when a party deletes their account.
-- Same idea as swaps (20260915170000): do not CASCADE the stake away.
-- Convert the missing party to a guest label so the other side still has history.

create or replace function public.et_deleted_account_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.handle), ''),
    'Deleted account'
  )
  from public.profiles p
  where p.user_id = p_user_id
$$;

create or replace function public.poker_stable_deals_on_party_user_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stakee_user_id is null and old.stakee_user_id is not null then
    if nullif(trim(coalesce(new.stakee_guest_label, '')), '') is null then
      new.stakee_guest_label := public.et_deleted_account_label(old.stakee_user_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_poker_stable_deals_party_user_nulled on public.poker_stable_deals;
create trigger trg_poker_stable_deals_party_user_nulled
  before update of stakee_user_id on public.poker_stable_deals
  for each row
  execute function public.poker_stable_deals_on_party_user_nulled();

create or replace function public.poker_stable_deal_slices_on_staker_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staker_user_id is null and old.staker_user_id is not null then
    new.counterparty_kind := 'guest';
    if nullif(trim(coalesce(new.guest_label, '')), '') is null then
      new.guest_label := public.et_deleted_account_label(old.staker_user_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_poker_stable_deal_slices_staker_nulled on public.poker_stable_deal_slices;
create trigger trg_poker_stable_deal_slices_staker_nulled
  before update of staker_user_id on public.poker_stable_deal_slices
  for each row
  execute function public.poker_stable_deal_slices_on_staker_nulled();

alter table public.poker_stable_deals
  drop constraint if exists poker_stable_deals_stakee_user_id_fkey;
alter table public.poker_stable_deals
  add constraint poker_stable_deals_stakee_user_id_fkey
    foreign key (stakee_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_deals
  drop constraint if exists poker_stable_deals_staker_user_id_fkey;
alter table public.poker_stable_deals
  add constraint poker_stable_deals_staker_user_id_fkey
    foreign key (staker_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_deal_slices
  drop constraint if exists poker_stable_deal_slices_staker_user_id_fkey;
alter table public.poker_stable_deal_slices
  add constraint poker_stable_deal_slices_staker_user_id_fkey
    foreign key (staker_user_id) references auth.users(id) on delete set null;

-- Keep stake event rows; only the actor id goes away.
alter table public.poker_stable_deal_commits
  alter column recorded_by_user_id drop not null;
alter table public.poker_stable_deal_commits
  drop constraint if exists poker_stable_deal_commits_recorded_by_user_id_fkey;
alter table public.poker_stable_deal_commits
  add constraint poker_stable_deal_commits_recorded_by_user_id_fkey
    foreign key (recorded_by_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_deal_reductions
  alter column logged_by_user_id drop not null;
alter table public.poker_stable_deal_reductions
  drop constraint if exists poker_stable_deal_reductions_logged_by_user_id_fkey;
alter table public.poker_stable_deal_reductions
  add constraint poker_stable_deal_reductions_logged_by_user_id_fkey
    foreign key (logged_by_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_deal_topups
  alter column logged_by_user_id drop not null;
alter table public.poker_stable_deal_topups
  drop constraint if exists poker_stable_deal_topups_logged_by_user_id_fkey;
alter table public.poker_stable_deal_topups
  add constraint poker_stable_deal_topups_logged_by_user_id_fkey
    foreign key (logged_by_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_deal_settlements
  alter column settled_by_user_id drop not null;
alter table public.poker_stable_deal_settlements
  drop constraint if exists poker_stable_deal_settlements_settled_by_user_id_fkey;
alter table public.poker_stable_deal_settlements
  add constraint poker_stable_deal_settlements_settled_by_user_id_fkey
    foreign key (settled_by_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_payment_claims
  alter column actor_user_id drop not null;
alter table public.poker_stable_payment_claims
  drop constraint if exists poker_stable_payment_claims_actor_user_id_fkey;
alter table public.poker_stable_payment_claims
  add constraint poker_stable_payment_claims_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.poker_stable_settlement_requests
  alter column proposed_by_user_id drop not null;
alter table public.poker_stable_settlement_requests
  drop constraint if exists poker_stable_settlement_requests_proposed_by_user_id_fkey;
alter table public.poker_stable_settlement_requests
  add constraint poker_stable_settlement_requests_proposed_by_user_id_fkey
    foreign key (proposed_by_user_id) references auth.users(id) on delete set null;

comment on function public.poker_stable_deals_on_party_user_nulled() is
  'Account delete SET NULLs stakee_user_id; fill guest label so stakee_target_check still passes.';

comment on function public.poker_stable_deal_slices_on_staker_nulled() is
  'Account delete SET NULLs slice staker; flip to guest so counterparty_present still passes.';
