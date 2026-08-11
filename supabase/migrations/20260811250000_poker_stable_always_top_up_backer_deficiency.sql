-- Always top up Stable backing bankroll when liquid is short of the amount needed
-- to support a stake (Create Stake seed or Accept debit). Same invented-capital
-- pattern as first-time $0 seed, but for any deficiency … cash and tournament.

begin;

alter table public.poker_stable_backer_allocations
  add column if not exists seed_amount numeric(12, 2) not null default 0;

comment on column public.poker_stable_backer_allocations.seed_amount is
  'Dollars topped up into backing bankroll for this slice before debit; reverse this amount on undebited release.';

-- Returns dollars credited (0 if already funded).
drop function if exists public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid);

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
  v_after numeric;
begin
  if p_user_id is null then
    return 0;
  end if;

  v_need_total := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_need_total <= 0 then
    return 0;
  end if;

  -- p_exclude_slice_id retained for call-site compatibility (unused).

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  v_bal := public.poker_stable_round_money(coalesce(v_bal, 0));
  v_need := public.poker_stable_round_money(greatest(0, v_need_total - v_bal));
  if v_need <= 0.005 then
    return 0;
  end if;

  perform public.poker_stable_backer_adjust_balance(p_user_id, v_need);

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  perform public.poker_stable_backer_log_manual_adjustment(
    p_user_id,
    v_need,
    public.poker_stable_round_money(coalesce(v_after, v_need))
  );

  return v_need;
end;
$$;

comment on function public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid) is
  'Top up backing bankroll by the deficiency vs p_amount (any shortfall). Logs a manual adjustment. Returns dollars credited.';

create or replace function public.poker_stable_debit_backer_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_paid numeric;
  v_seeded numeric;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id
  for update;

  if v_row.id is null or v_row.bankroll_debited then
    return;
  end if;

  v_paid := public.poker_stable_round_money(coalesce(v_row.paid_amount, v_row.amount, 0));
  if v_paid <= 0 then
    return;
  end if;

  v_seeded := public.poker_stable_maybe_seed_first_backer_bankroll(
    v_row.user_id,
    v_paid,
    v_row.slice_id
  );
  if v_seeded > 0.005 then
    update public.poker_stable_backer_allocations
    set
      seed_applied = true,
      seed_amount = public.poker_stable_round_money(coalesce(seed_amount, 0) + v_seeded)
    where id = v_row.id;
  end if;

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_row.user_id, 0)
  on conflict (user_id) do nothing;

  update public.poker_stable_backer_bankrolls
  set bankroll_balance = public.poker_stable_round_money(bankroll_balance - v_paid)
  where user_id = v_row.user_id;

  update public.poker_stable_backer_allocations
  set bankroll_debited = true
  where id = v_row.id;

  perform public.poker_stable_post_markup_fee(p_allocation_id);
end;
$$;

comment on function public.poker_stable_debit_backer_allocation(uuid) is
  'Tops up any funding shortfall, debits paid amount, posts tournament markup fee when applicable.';

create or replace function public.poker_stable_ensure_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal_status text;
  v_deal_lead uuid;
  v_deal_player_initiated boolean;
  v_face numeric;
  v_paid numeric;
  v_fee numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
  v_should_debit boolean;
  v_is_initiator boolean;
  v_should_seed boolean;
  v_seeded_amt numeric := 0;
  v_entry record;
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

  select
    d.status,
    d.staker_user_id,
    (d.stakee_user_id is not null and d.staker_user_id is null)
  into v_deal_status, v_deal_lead, v_deal_player_initiated
  from public.poker_stable_deals d
  where d.id = v_slice.deal_id;

  if v_slice.status = 'active' and v_deal_player_initiated then
    perform public.poker_stable_activate_player_deal_on_backer_accept(v_slice.deal_id);
    select d.status into v_deal_status
    from public.poker_stable_deals d
    where d.id = v_slice.deal_id;
  end if;

  v_target_status := case when v_slice.status = 'active' then 'active' else 'pending' end;

  select * into v_entry from public.poker_stable_slice_entry_amounts(p_slice_id);
  v_face := coalesce(v_entry.face_amount, 0);
  v_paid := coalesce(v_entry.paid_amount, v_face);
  v_fee := coalesce(v_entry.fee_amount, 0);

  v_should_debit :=
    v_slice.status = 'active'
    and (
      v_deal_status = 'active'
      or (v_deal_status = 'pending' and v_deal_player_initiated)
    );

  v_is_initiator :=
    not v_deal_player_initiated
    and v_deal_lead is not null
    and v_slice.staker_user_id = v_deal_lead;

  -- Seed/top-up for initiator pending offers, or when about to debit.
  v_should_seed :=
    v_should_debit
    or v_is_initiator
    or v_slice.status = 'active';

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    if not v_existing.bankroll_debited then
      update public.poker_stable_backer_allocations
      set
        amount = v_face,
        paid_amount = v_paid,
        fee_amount = v_fee
      where id = v_existing.id;
    end if;
    if v_should_seed and not v_existing.bankroll_debited then
      v_seeded_amt := public.poker_stable_maybe_seed_first_backer_bankroll(
        v_slice.staker_user_id,
        v_paid,
        p_slice_id
      );
      if v_seeded_amt > 0.005 then
        update public.poker_stable_backer_allocations
        set
          seed_applied = true,
          seed_amount = public.poker_stable_round_money(coalesce(seed_amount, 0) + v_seeded_amt)
        where id = v_existing.id;
      end if;
    end if;
    if v_should_debit and not v_existing.bankroll_debited then
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    elsif v_existing.bankroll_debited and not v_existing.fee_posted and v_fee > 0 then
      perform public.poker_stable_post_markup_fee(v_existing.id);
    end if;
    return;
  end if;

  if v_should_seed then
    v_seeded_amt := public.poker_stable_maybe_seed_first_backer_bankroll(
      v_slice.staker_user_id,
      v_paid,
      p_slice_id
    );
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, paid_amount, fee_amount,
    status, bankroll_debited, seed_applied, seed_amount, fee_posted
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_face,
    v_paid,
    v_fee,
    v_target_status,
    false,
    v_seeded_amt > 0.005,
    public.poker_stable_round_money(greatest(0, v_seeded_amt)),
    false
  )
  returning id into v_allocation_id;

  if v_should_debit then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

comment on function public.poker_stable_ensure_backer_allocation(uuid) is
  'Ensures allocation; tops up any backing-bankroll deficiency for paid amount; debits when live.';

create or replace function public.poker_stable_release_backer_allocation(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_credited numeric := 0;
  v_seed_reversed numeric := 0;
  v_paid numeric;
  v_seed numeric;
begin
  if p_slice_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_slice');
  end if;

  select * into v_row
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id
  for update;

  if v_row.id is null then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'no_allocation');
  end if;

  v_paid := public.poker_stable_round_money(coalesce(v_row.paid_amount, v_row.amount, 0));
  v_seed := public.poker_stable_round_money(
    case
      when coalesce(v_row.seed_amount, 0) > 0.005 then v_row.seed_amount
      when v_row.seed_applied then v_paid
      else 0
    end
  );

  if v_row.status = 'released' then
    perform public.poker_stable_unwind_markup_fee(v_row.id);
    if v_row.seed_applied and not v_row.bankroll_debited and v_seed > 0 then
      if public.poker_stable_reverse_backer_seed(v_row.user_id, v_seed) then
        v_seed_reversed := v_seed;
      end if;
      update public.poker_stable_backer_allocations
      set seed_applied = false, seed_amount = 0
      where id = v_row.id;
    end if;
    return jsonb_build_object(
      'ok', true,
      'released', false,
      'reason', 'already_released',
      'seed_reversed', v_seed_reversed
    );
  end if;

  perform public.poker_stable_unwind_markup_fee(v_row.id);

  if v_row.bankroll_debited and v_paid > 0 then
    perform public.poker_stable_backer_adjust_balance(v_row.user_id, v_paid);
    v_credited := v_paid;
  elsif v_row.seed_applied and v_seed > 0 then
    if public.poker_stable_reverse_backer_seed(v_row.user_id, v_seed) then
      v_seed_reversed := v_seed;
    end if;
  end if;

  update public.poker_stable_backer_allocations
  set
    status = 'released',
    seed_applied = false,
    seed_amount = 0
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'released', true,
    'allocation_id', v_row.id,
    'credited', v_credited,
    'seed_reversed', v_seed_reversed
  );
end;
$$;

-- Repair: clear negative liquid for backers who already have capital deployed
-- (underfunded debit). Bring balance to $0 and log the adjustment.
do $$
declare
  r record;
  v_need numeric;
  v_after numeric;
begin
  for r in
    select b.user_id, b.bankroll_balance
    from public.poker_stable_backer_bankrolls b
    where public.poker_stable_round_money(b.bankroll_balance) < -0.005
      and exists (
        select 1
        from public.poker_stable_backer_allocations a
        where a.user_id = b.user_id
          and a.bankroll_debited
          and a.status is distinct from 'released'
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

revoke all on function public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid) from public;
grant execute on function public.poker_stable_maybe_seed_first_backer_bankroll(uuid, numeric, uuid) to authenticated;

commit;
