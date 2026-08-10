-- Prod was missing 20260809130000 pieces that later seed migrations assume:
--   • poker_stable_backer_has_other_open_stakes
--   • debit_backer_allocation that seeds before subtracting
-- Do NOT replace ensure (keep 20260810180000 initiator/accept + no-reseed logic).
-- Also repair accounts already at negative liquid with no Adjust history (e.g. Etcetera).

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

  -- Safety net when deal-activation trigger debits before ensure seed runs.
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

revoke all on function public.poker_stable_backer_has_other_open_stakes(uuid, uuid) from public;

comment on function public.poker_stable_backer_has_other_open_stakes(uuid, uuid) is
  'True when backer has another pending/active user slice (optional exclude). Used by first-time seed.';

comment on function public.poker_stable_debit_backer_allocation(uuid) is
  'Debits slice capital from Stable backing bankroll; seeds first-time empty bankroll first.';

-- Repair: debit-without-seed left liquid negative and no Adjust history.
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
