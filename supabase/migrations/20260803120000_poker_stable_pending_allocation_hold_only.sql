-- Pending stakes reserve capital (allocation row + UI pending hold) but do not
-- debit backing bankroll until the deal goes active (horse accepts).
-- One-time credit restores balances that legacy ensure_backer_allocation debited early.

begin;

alter table public.poker_stable_backer_allocations
  add column if not exists bankroll_debited boolean not null default false;

-- Legacy: allocations on pending deals may have debited bankroll_balance at slice insert.
update public.poker_stable_backer_bankrolls b
set bankroll_balance = public.poker_stable_round_money(b.bankroll_balance + cred.total)
from (
  select a.user_id, sum(a.amount) as total
  from public.poker_stable_backer_allocations a
  inner join public.poker_stable_deals d on d.id = a.deal_id
  where d.status = 'pending'
  group by a.user_id
) cred
where b.user_id = cred.user_id;

update public.poker_stable_backer_allocations a
set bankroll_debited = false
from public.poker_stable_deals d
where d.id = a.deal_id
  and d.status = 'pending';

create or replace function public.poker_stable_debit_backer_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id
  for update;

  if v_row.id is null or v_row.bankroll_debited or v_row.amount <= 0 then
    return;
  end if;

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_row.user_id, 0)
  on conflict (user_id) do nothing;

  update public.poker_stable_backer_bankrolls
  set bankroll_balance = public.poker_stable_round_money(bankroll_balance - v_row.amount)
  where user_id = v_row.user_id;

  update public.poker_stable_backer_allocations
  set bankroll_debited = true
  where id = v_row.id;
end;
$$;

create or replace function public.poker_stable_debit_deal_backer_allocations(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc_id uuid;
begin
  for v_alloc_id in
    select a.id
    from public.poker_stable_backer_allocations a
    where a.deal_id = p_deal_id
      and not a.bankroll_debited
  loop
    perform public.poker_stable_debit_backer_allocation(v_alloc_id);
  end loop;
end;
$$;

create or replace function public.poker_stable_ensure_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal_status text;
  v_amount numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
begin
  select * into v_slice from public.poker_stable_deal_slices where id = p_slice_id;
  if v_slice.id is null then
    return;
  end if;
  if v_slice.counterparty_kind <> 'user' or v_slice.staker_user_id is null then
    return;
  end if;
  if v_slice.status not in ('pending', 'active') then
    return;
  end if;

  select d.status into v_deal_status
  from public.poker_stable_deals d
  where d.id = v_slice.deal_id;

  v_target_status := case when v_slice.status = 'active' then 'active' else 'pending' end;
  v_amount := public.poker_stable_slice_allocation_amount(v_slice.deal_id, v_slice.action_pct);

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    if v_deal_status = 'active' and not v_existing.bankroll_debited then
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    end if;
    return;
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, status, bankroll_debited
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_amount,
    v_target_status,
    false
  )
  returning id into v_allocation_id;

  if v_deal_status = 'active' then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

create or replace function public.poker_stable_deals_activation_allocation_debit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'active' then
    perform public.poker_stable_debit_deal_backer_allocations(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists poker_stable_deals_activation_allocation_debit on public.poker_stable_deals;
create trigger poker_stable_deals_activation_allocation_debit
  after update of status
  on public.poker_stable_deals
  for each row execute function public.poker_stable_deals_activation_allocation_debit();

commit;
