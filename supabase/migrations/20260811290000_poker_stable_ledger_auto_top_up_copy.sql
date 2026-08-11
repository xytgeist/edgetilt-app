-- Clearer ledger copy for automatic backing-bankroll top-ups.
-- Also relabel legacy pre-typed rows that were logged as kind=manual with no note
-- when they line up with a seeded allocation.

begin;

create or replace function public.poker_stable_maybe_seed_first_backer_bankroll(
  p_user_id uuid,
  p_amount numeric,
  p_exclude_slice_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need_total numeric;
  v_bal numeric;
  v_need numeric;
  v_deal_id uuid;
begin
  if p_user_id is null then
    return 0;
  end if;

  v_need_total := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_need_total <= 0 then
    return 0;
  end if;

  select s.deal_id into v_deal_id
  from public.poker_stable_deal_slices s
  where s.id = p_exclude_slice_id;

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  v_bal := public.poker_stable_round_money(coalesce(v_bal, 0));
  v_need := public.poker_stable_round_money(greatest(0, v_need_total - v_bal));
  if v_need <= 0.005 then
    return 0;
  end if;

  perform public.poker_stable_backer_book_liquid(
    p_user_id,
    v_need,
    'auto_top_up',
    v_deal_id,
    'Capital automatically credited to cover a stake funding shortfall.'
  );

  return v_need;
end;
$$;

comment on function public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid) is
  'Top up backing bankroll by the deficiency vs p_amount. Logs auto_top_up ledger row. Returns dollars credited.';

create or replace function public.poker_stable_reverse_backer_seed(
  p_user_id uuid,
  p_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_bal numeric;
begin
  if p_user_id is null then
    return false;
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    return false;
  end if;

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  if v_bal is null then
    return false;
  end if;

  v_amt := least(v_amt, public.poker_stable_round_money(v_bal));
  if v_amt <= 0 then
    return false;
  end if;

  perform public.poker_stable_backer_book_liquid(
    p_user_id,
    -v_amt,
    'seed_reverse',
    null,
    'Auto-credited capital removed after the stake offer ended.'
  );

  return true;
end;
$$;

-- Relabel legacy auto top-ups that landed as kind=manual before typed ledger kinds.
update public.poker_stable_backer_bankroll_adjustments adj
set
  kind = 'auto_top_up',
  note = 'Capital automatically credited to cover a stake funding shortfall.'
where adj.kind = 'manual'
  and adj.note is null
  and adj.amount > 0.005
  and exists (
    select 1
    from public.poker_stable_backer_allocations a
    where a.user_id = adj.user_id
      and a.seed_applied
      and coalesce(a.seed_amount, 0) > 0.005
      and adj.occurred_at >= a.created_at - interval '2 minutes'
      and adj.occurred_at <= a.created_at + interval '5 minutes'
  );

commit;
