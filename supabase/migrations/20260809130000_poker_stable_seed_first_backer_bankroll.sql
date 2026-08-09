-- First-time (or empty + no other open stakes) backers: seed Stable backing bankroll
-- to the slice capital before pending hold / debit so Accept / Create Stake does not
-- start at a negative liquid bankroll. Logs a manual adjustment so hero TWR math
-- (sum(adjustments) − active allocated) stays correct.

begin;

create or replace function public.poker_stable_backer_has_other_open_stakes(
  p_user_id uuid,
  p_exclude_slice_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.poker_stable_deal_slices s
    inner join public.poker_stable_deals d on d.id = s.deal_id
    where s.staker_user_id = p_user_id
      and s.counterparty_kind = 'user'
      and s.status in ('pending', 'active')
      and d.status in ('pending', 'active')
      and (p_exclude_slice_id is null or s.id is distinct from p_exclude_slice_id)
  );
end;
$$;

create or replace function public.poker_stable_maybe_seed_first_backer_bankroll(
  p_user_id uuid,
  p_amount numeric,
  p_exclude_slice_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_bal numeric;
  v_after numeric;
begin
  if p_user_id is null then
    return false;
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    return false;
  end if;

  if public.poker_stable_backer_has_other_open_stakes(p_user_id, p_exclude_slice_id) then
    return false;
  end if;

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  -- First-time (no row) or empty liquid with no other open stakes.
  if v_bal is not null and public.poker_stable_round_money(v_bal) <> 0 then
    return false;
  end if;

  perform public.poker_stable_backer_adjust_balance(p_user_id, v_amt);

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  perform public.poker_stable_backer_log_manual_adjustment(
    p_user_id,
    v_amt,
    public.poker_stable_round_money(coalesce(v_after, v_amt))
  );

  return true;
end;
$$;

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

  -- Safety net when activation debits without going through ensure seed (legacy rows).
  perform public.poker_stable_maybe_seed_first_backer_bankroll(
    v_row.user_id,
    v_row.amount,
    v_row.slice_id
  );

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

  if v_slice.status = 'active' and v_deal_player_initiated then
    perform public.poker_stable_activate_player_deal_on_backer_accept(v_slice.deal_id);
    select d.status into v_deal_status
    from public.poker_stable_deals d
    where d.id = v_slice.deal_id;
  end if;

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
      perform public.poker_stable_maybe_seed_first_backer_bankroll(
        v_slice.staker_user_id,
        v_amount,
        p_slice_id
      );
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    end if;
    return;
  end if;

  -- Seed on first allocation too (Create Stake pending hold) so available ≈ $0, not −slice.
  perform public.poker_stable_maybe_seed_first_backer_bankroll(
    v_slice.staker_user_id,
    v_amount,
    p_slice_id
  );

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

revoke all on function public.poker_stable_backer_has_other_open_stakes(uuid, uuid) from public;
revoke all on function public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid) from public;

-- Repair smoke accounts that already went negative with no Adjust bankroll history.
do $$
declare
  r record;
  v_need numeric;
  v_after numeric;
begin
  for r in
    select b.user_id, b.bankroll_balance
    from public.poker_stable_backer_bankrolls b
    where public.poker_stable_round_money(b.bankroll_balance) < 0
      and not exists (
        select 1
        from public.poker_stable_backer_bankroll_adjustments a
        where a.user_id = b.user_id
      )
  loop
    v_need := public.poker_stable_round_money(-r.bankroll_balance);
    perform public.poker_stable_backer_adjust_balance(r.user_id, v_need);
    select b.bankroll_balance into v_after
    from public.poker_stable_backer_bankrolls b
    where b.user_id = r.user_id;
    perform public.poker_stable_backer_log_manual_adjustment(
      r.user_id,
      v_need,
      public.poker_stable_round_money(coalesce(v_after, 0))
    );
  end loop;
end;
$$;

commit;
