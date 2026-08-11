-- Tournament markup is prepaid on accept, but earned per buy-in.
-- On close: unused markup (fee × (1 − buyins/package)) returns to the backer
-- (backing bankroll + reverse realized) and is clawed from player personal.

begin;

alter table public.poker_stable_backer_allocations
  add column if not exists fee_unused_returned numeric(12, 2) not null default 0;

comment on column public.poker_stable_backer_allocations.fee_unused_returned is
  'Unused tournament markup returned to backer on close (buy-ins below package face).';

create or replace function public.poker_stable_deal_tournament_buyins(p_deal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.poker_stable_round_money(
    coalesce(
      sum(
        coalesce(s.buy_in, 0)
        + coalesce(s.rebuy_amount, 0)
        + coalesce(s.addon_amount, 0)
      ),
      0
    )
  )
  from public.poker_bankroll_sessions s
  where s.deal_id = p_deal_id;
$$;

comment on function public.poker_stable_deal_tournament_buyins(uuid) is
  'Total buy-in + re-entry + add-on cost logged on a stake (markup basis).';

create or replace function public.poker_stable_allocation_unused_markup_fee(p_allocation_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_fee numeric;
  v_baseline numeric;
  v_buyins numeric;
  v_used numeric;
  v_earned numeric;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id;

  if v_row.id is null or not v_row.fee_posted then
    return 0;
  end if;

  v_fee := public.poker_stable_round_money(coalesce(v_row.fee_amount, 0));
  if v_fee <= 0.005 then
    return 0;
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_row.deal_id;
  if v_deal.id is null or v_deal.deal_type <> 'tournament_package' then
    return 0;
  end if;

  v_baseline := public.poker_stable_round_money(coalesce(v_deal.baseline_bankroll, 0));
  if v_baseline <= 0.005 then
    return 0;
  end if;

  v_buyins := public.poker_stable_deal_tournament_buyins(v_deal.id);
  v_used := least(v_buyins, v_baseline);
  v_earned := public.poker_stable_round_money(v_fee * (v_used / v_baseline));
  return public.poker_stable_round_money(greatest(0, v_fee - v_earned));
end;
$$;

comment on function public.poker_stable_allocation_unused_markup_fee(uuid) is
  'Prepaid markup fee minus fee earned on buy-ins (pro-rata to package face).';

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

    -- Return current stake value (roll share), not baseline face.
    if v_roll_share <> 0 then
      perform public.poker_stable_backer_adjust_balance(p_user_id, v_roll_share);
    end if;

    -- Stake P/L: profits/rakeback from settle lines, or underwater makeup loss.
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

    -- Unused prepaid markup (buy-ins below package) returns to backer.
    if v_deal.deal_type = 'tournament_package'
       and v_alloc.id is not null
       and coalesce(v_alloc.fee_unused_returned, 0) <= 0.005 then
      v_unused := public.poker_stable_allocation_unused_markup_fee(v_alloc.id);
      if v_unused > 0.005 then
        perform public.poker_stable_backer_adjust_balance(p_user_id, v_unused);
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

comment on function public.poker_stable_apply_close_backer_books(uuid, uuid) is
  'Close settle for a backer: credit roll share, book stake P/L, refund unused tournament markup, release allocation.';

revoke all on function public.poker_stable_deal_tournament_buyins(uuid) from public;
revoke all on function public.poker_stable_allocation_unused_markup_fee(uuid) from public;
grant execute on function public.poker_stable_deal_tournament_buyins(uuid) to authenticated;
grant execute on function public.poker_stable_allocation_unused_markup_fee(uuid) to authenticated;

commit;
