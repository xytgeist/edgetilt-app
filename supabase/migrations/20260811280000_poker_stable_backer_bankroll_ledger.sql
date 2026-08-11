-- Backing bankroll ledger: typed adjustment rows for all liquid in/out moves.
-- TWR continues to use capital kinds only (deposit / withdraw / set / auto top-up).

begin;

alter table public.poker_stable_backer_bankroll_adjustments
  add column if not exists kind text not null default 'manual',
  add column if not exists deal_id uuid null references public.poker_stable_deals(id) on delete set null,
  add column if not exists note text null;

comment on column public.poker_stable_backer_bankroll_adjustments.kind is
  'Ledger event kind: deposit, withdraw, set_balance, auto_top_up, seed_reverse, stake_deploy, stake_release, close_return, markup_refund, settle, stake_top_up, stake_reduction, manual.';

comment on column public.poker_stable_backer_bankroll_adjustments.deal_id is
  'Optional stake deal this liquid move belongs to.';

comment on column public.poker_stable_backer_bankroll_adjustments.note is
  'Optional human-readable detail for the ledger UI.';

create index if not exists poker_stable_backer_bankroll_adjustments_user_kind_idx
  on public.poker_stable_backer_bankroll_adjustments (user_id, kind, occurred_at desc);

create or replace function public.poker_stable_backer_log_adjustment(
  p_user_id uuid,
  p_amount numeric,
  p_balance_after numeric,
  p_kind text default 'manual',
  p_deal_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if p_user_id is null then
    return;
  end if;

  v_kind := nullif(trim(coalesce(p_kind, '')), '');
  if v_kind is null then
    v_kind := 'manual';
  end if;

  insert into public.poker_stable_backer_bankroll_adjustments (
    user_id, amount, balance_after, kind, deal_id, note
  )
  values (
    p_user_id,
    public.poker_stable_round_money(coalesce(p_amount, 0)),
    public.poker_stable_round_money(coalesce(p_balance_after, 0)),
    v_kind,
    p_deal_id,
    nullif(trim(coalesce(p_note, '')), '')
  );
end;
$$;

comment on function public.poker_stable_backer_log_adjustment(uuid, numeric, numeric, text, uuid, text) is
  'Append a typed backing-bankroll ledger row.';

-- Backward-compatible wrapper (existing callers).
create or replace function public.poker_stable_backer_log_manual_adjustment(
  p_user_id uuid,
  p_amount numeric,
  p_balance_after numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.poker_stable_backer_log_adjustment(
    p_user_id, p_amount, p_balance_after, 'manual', null, null
  );
end;
$$;

-- Adjust liquid + log in one step.
create or replace function public.poker_stable_backer_book_liquid(
  p_user_id uuid,
  p_amount numeric,
  p_kind text,
  p_deal_id uuid default null,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_after numeric;
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if p_user_id is null or abs(v_amt) < 0.005 then
    return 0;
  end if;

  perform public.poker_stable_backer_adjust_balance(p_user_id, v_amt);

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  perform public.poker_stable_backer_log_adjustment(
    p_user_id,
    v_amt,
    public.poker_stable_round_money(coalesce(v_after, 0)),
    p_kind,
    p_deal_id,
    p_note
  );

  return v_amt;
end;
$$;

comment on function public.poker_stable_backer_book_liquid(uuid, numeric, text, uuid, text) is
  'Move backing liquid and append a typed ledger row. Returns amount booked.';

create or replace function public.poker_stable_backer_deposit(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_bal numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive deposit amount.';
  end if;

  perform public.poker_stable_backer_book_liquid(
    v_uid, v_amt, 'deposit', null, 'Manual deposit'
  );

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  return jsonb_build_object(
    'bankroll_balance', coalesce(v_bal, v_amt),
    'has_profile', true
  );
end;
$$;

create or replace function public.poker_stable_backer_withdraw(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_bal numeric;
  v_row public.poker_stable_backer_bankrolls%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive withdrawal amount.';
  end if;

  select * into v_row from public.poker_stable_backer_bankrolls where user_id = v_uid;
  if v_row.user_id is null or v_row.bankroll_balance < v_amt then
    raise exception 'Insufficient backing bankroll for that withdrawal.';
  end if;

  perform public.poker_stable_backer_book_liquid(
    v_uid, -v_amt, 'withdraw', null, 'Manual withdrawal'
  );

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  return jsonb_build_object(
    'bankroll_balance', coalesce(v_bal, 0),
    'has_profile', true
  );
end;
$$;

create or replace function public.poker_stable_set_backer_bankroll(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_prev numeric := 0;
  v_delta numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt < 0 then
    raise exception 'Enter a non-negative amount.';
  end if;

  select coalesce(b.bankroll_balance, 0) into v_prev
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  v_delta := public.poker_stable_round_money(v_amt - v_prev);

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_uid, v_amt)
  on conflict (user_id) do update
    set bankroll_balance = excluded.bankroll_balance;

  if abs(v_delta) > 0.005 then
    perform public.poker_stable_backer_log_adjustment(
      v_uid, v_delta, v_amt, 'set_balance', null, 'Set balance'
    );
  end if;

  return jsonb_build_object('bankroll_balance', v_amt);
end;
$$;

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
    'Auto top-up for stake funding'
  );

  return v_need;
end;
$$;

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
    'Reverse auto top-up'
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
  v_paid numeric;
  v_seeded numeric;
  v_after numeric;
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

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_row.user_id;

  perform public.poker_stable_backer_log_adjustment(
    v_row.user_id,
    -v_paid,
    public.poker_stable_round_money(coalesce(v_after, 0)),
    'stake_deploy',
    v_row.deal_id,
    'Stake capital deployed'
  );

  update public.poker_stable_backer_allocations
  set bankroll_debited = true
  where id = v_row.id;

  perform public.poker_stable_post_markup_fee(p_allocation_id);
end;
$$;

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

  if v_row.status = 'released' then
    if v_row.seed_applied and not v_row.bankroll_debited and v_row.amount > 0 then
      if public.poker_stable_reverse_backer_seed(v_row.user_id, v_row.amount) then
        v_seed_reversed := v_row.amount;
      end if;
      update public.poker_stable_backer_allocations
      set seed_applied = false
      where id = v_row.id;
      return jsonb_build_object(
        'ok', true,
        'released', false,
        'reason', 'already_released',
        'seed_reversed', v_seed_reversed
      );
    end if;
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'already_released');
  end if;

  if v_row.bankroll_debited and v_row.amount > 0 then
    perform public.poker_stable_backer_book_liquid(
      v_row.user_id,
      v_row.amount,
      'stake_release',
      v_row.deal_id,
      'Stake capital returned'
    );
    v_credited := v_row.amount;
  elsif v_row.seed_applied and v_row.amount > 0 then
    if public.poker_stable_reverse_backer_seed(v_row.user_id, v_row.amount) then
      v_seed_reversed := v_row.amount;
    end if;
  end if;

  update public.poker_stable_backer_allocations
  set
    status = 'released',
    seed_applied = false
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

create or replace function public.poker_stable_backer_apply_settle(
  p_user_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_after numeric;
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt = 0 or p_user_id is null then
    return;
  end if;

  perform public.poker_stable_backer_ensure_row(p_user_id);

  update public.poker_stable_backer_bankrolls
  set bankroll_balance = public.poker_stable_round_money(bankroll_balance + v_amt),
      realized_backing_pl = public.poker_stable_round_money(realized_backing_pl + v_amt)
  where user_id = p_user_id;

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  perform public.poker_stable_backer_log_adjustment(
    p_user_id,
    v_amt,
    public.poker_stable_round_money(coalesce(v_after, 0)),
    'settle',
    null,
    'Settle credit'
  );
end;
$$;

create or replace function public.poker_stable_debit_staker_share(
  p_deal_id uuid,
  p_amount numeric,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share numeric;
begin
  v_share := public.poker_stable_staker_share_amount(p_deal_id, p_amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  perform public.poker_stable_backer_book_liquid(
    p_user_id, -v_share, 'stake_top_up', p_deal_id, 'Stake top-up'
  );
end;
$$;

create or replace function public.poker_stable_credit_staker_share(
  p_deal_id uuid,
  p_amount numeric,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share numeric;
begin
  v_share := public.poker_stable_staker_share_amount(p_deal_id, p_amount, p_user_id);
  if v_share <= 0 then
    return;
  end if;

  perform public.poker_stable_backer_book_liquid(
    p_user_id, v_share, 'stake_reduction', p_deal_id, 'Stake reduction'
  );
end;
$$;

create or replace function public.poker_stable_apply_close_backer_books(
  p_settlement_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_st public.poker_stable_deal_settlements%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_alloc public.poker_stable_backer_allocations%rowtype;
  v_action numeric;
  v_roll_share numeric;
  v_makeup_share numeric;
  v_profit_share numeric;
  v_rakeback_share numeric;
  v_line public.poker_stable_deal_settlement_lines%rowtype;
  v_unused numeric;
  v_stakee uuid;
begin
  if p_settlement_id is null or p_user_id is null then
    return;
  end if;

  select * into v_st
  from public.poker_stable_deal_settlements
  where id = p_settlement_id;

  if v_st.id is null then
    return;
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_st.deal_id;
  v_stakee := v_deal.stakee_user_id;

  for v_slice in
    select s.*
    from public.poker_stable_deal_slices s
    where s.deal_id = v_st.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
      and s.status in ('active', 'declined')
  loop
    select * into v_alloc
    from public.poker_stable_backer_allocations a
    where a.slice_id = v_slice.id
    for update;

    if v_alloc.id is not null and v_alloc.status = 'released' then
      continue;
    end if;

    if v_slice.status <> 'active' then
      perform public.poker_stable_close_release_backer_allocation(v_slice.id);
      continue;
    end if;

    v_action := coalesce(v_slice.action_pct, 0) / 100.0;
    v_roll_share := public.poker_stable_round_money(coalesce(v_st.roll_at_settle, 0) * v_action);
    v_makeup_share := public.poker_stable_round_money(coalesce(v_st.makeup_at_settle, 0) * v_action);

    select * into v_line
    from public.poker_stable_deal_settlement_lines l
    where l.settlement_id = p_settlement_id
      and l.slice_id = v_slice.id;

    v_profit_share := coalesce(v_line.profit_share, 0);
    v_rakeback_share := coalesce(v_line.rakeback_share, 0);
    if v_line.direction = 'staker_to_player' then
      v_profit_share := -v_profit_share;
      v_rakeback_share := -v_rakeback_share;
    end if;

    if v_roll_share <> 0 then
      perform public.poker_stable_backer_book_liquid(
        p_user_id,
        v_roll_share,
        'close_return',
        v_st.deal_id,
        'Close: stake value returned'
      );
    end if;

    if coalesce(v_st.profit_above_baseline, 0) > 0.005 then
      if (v_profit_share + v_rakeback_share) <> 0 then
        perform public.poker_stable_backer_apply_realized_only(
          p_user_id,
          public.poker_stable_round_money(v_profit_share + v_rakeback_share)
        );
      end if;
    elsif v_makeup_share > 0.005 then
      perform public.poker_stable_backer_apply_realized_only(p_user_id, -v_makeup_share);
    end if;

    if v_deal.deal_type = 'tournament_package'
       and v_alloc.id is not null
       and coalesce(v_alloc.fee_unused_returned, 0) <= 0.005 then
      v_unused := public.poker_stable_allocation_unused_markup_fee(v_alloc.id);
      if v_unused > 0.005 then
        perform public.poker_stable_backer_book_liquid(
          p_user_id,
          v_unused,
          'markup_refund',
          v_st.deal_id,
          'Unused markup refunded'
        );
        perform public.poker_stable_backer_apply_realized_only(p_user_id, v_unused);
        if v_stakee is not null then
          perform public.poker_stable_credit_player_personal_bankroll(v_stakee, -v_unused);
        end if;
        update public.poker_stable_backer_allocations
        set fee_unused_returned = v_unused
        where id = v_alloc.id;
      end if;
    end if;

    perform public.poker_stable_close_release_backer_allocation(v_slice.id);
  end loop;
end;
$$;

revoke all on function public.poker_stable_backer_log_adjustment(uuid, numeric, numeric, text, uuid, text) from public;
revoke all on function public.poker_stable_backer_book_liquid(uuid, numeric, text, uuid, text) from public;

grant execute on function public.poker_stable_backer_deposit(numeric) to authenticated;
grant execute on function public.poker_stable_backer_withdraw(numeric) to authenticated;
grant execute on function public.poker_stable_set_backer_bankroll(numeric) to authenticated;

commit;
