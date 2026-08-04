-- Player-created stakes: debit backing bankroll when a backer accepts their slice
-- (deal may still be pending while other backers are outstanding).
-- Backer-initiated stakes unchanged: debit when deal goes active (horse accepts).

begin;

create or replace function public.poker_stable_ensure_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal_status text;
  v_deal_player_initiated boolean;
  v_amount numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
  v_should_debit boolean;
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

  select d.status, (d.stakee_user_id is not null and d.staker_user_id is null)
  into v_deal_status, v_deal_player_initiated
  from public.poker_stable_deals d
  where d.id = v_slice.deal_id;

  v_target_status := case when v_slice.status = 'active' then 'active' else 'pending' end;
  v_amount := public.poker_stable_slice_allocation_amount(v_slice.deal_id, v_slice.action_pct);

  v_should_debit :=
    v_slice.status = 'active'
    and (
      v_deal_status = 'active'
      or (v_deal_status = 'pending' and v_deal_player_initiated)
    );

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    if v_should_debit and not v_existing.bankroll_debited then
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

  if v_should_debit then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

-- Backfill: accepted backer slices on pending player-created stakes.
do $$
declare
  v_alloc_id uuid;
begin
  for v_alloc_id in
    select a.id
    from public.poker_stable_backer_allocations a
    inner join public.poker_stable_deal_slices s on s.id = a.slice_id
    inner join public.poker_stable_deals d on d.id = a.deal_id
    where not a.bankroll_debited
      and s.status = 'active'
      and s.counterparty_kind = 'user'
      and d.status = 'pending'
      and d.stakee_user_id is not null
      and d.staker_user_id is null
  loop
    perform public.poker_stable_debit_backer_allocation(v_alloc_id);
  end loop;
end $$;

commit;
