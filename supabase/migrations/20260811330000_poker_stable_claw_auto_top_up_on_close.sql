-- Auto top-up invents capital so Accept can fund a stake. On close, reclaim that
-- advance from close returns so invented money cannot stick as liquid P/L.
-- Cap reclaim at close_return + markup_refund for the deal (manual deposits stay).

begin;

create or replace function public.poker_stable_backer_outstanding_auto_top_up(
  p_user_id uuid,
  p_deal_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- auto_top_up amounts are +; seed_reverse amounts are −; sum is net still outstanding.
  select public.poker_stable_round_money(coalesce(sum(a.amount), 0))
  from public.poker_stable_backer_bankroll_adjustments a
  where a.user_id = p_user_id
    and a.deal_id = p_deal_id
    and a.kind in ('auto_top_up', 'seed_reverse');
$$;

comment on function public.poker_stable_backer_outstanding_auto_top_up(uuid, uuid) is
  'Net auto_top_up − seed_reverse still outstanding for a backer on one deal.';

create or replace function public.poker_stable_backer_claw_auto_top_up_after_close(
  p_user_id uuid,
  p_deal_id uuid,
  p_returned_total numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outstanding numeric;
  v_returned numeric;
  v_bal numeric;
  v_claw numeric;
begin
  if p_user_id is null or p_deal_id is null then
    return 0;
  end if;

  v_returned := public.poker_stable_round_money(greatest(0, coalesce(p_returned_total, 0)));
  if v_returned <= 0.005 then
    return 0;
  end if;

  v_outstanding := public.poker_stable_backer_outstanding_auto_top_up(p_user_id, p_deal_id);
  if v_outstanding <= 0.005 then
    return 0;
  end if;

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  v_claw := public.poker_stable_round_money(
    least(
      v_outstanding,
      v_returned,
      greatest(0, coalesce(v_bal, 0))
    )
  );
  if v_claw <= 0.005 then
    return 0;
  end if;

  perform public.poker_stable_backer_book_liquid(
    p_user_id,
    -v_claw,
    'seed_reverse',
    p_deal_id,
    'Auto-credited capital reclaimed after close.'
  );

  return v_claw;
end;
$$;

comment on function public.poker_stable_backer_claw_auto_top_up_after_close(uuid, uuid, numeric) is
  'After close returns, reverse outstanding auto_top_up up to returned $ so invented capital cannot stick.';

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
  v_returned_total numeric := 0;
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
      v_returned_total := public.poker_stable_round_money(v_returned_total + v_roll_share);
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
        v_returned_total := public.poker_stable_round_money(v_returned_total + v_unused);
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

  perform public.poker_stable_backer_claw_auto_top_up_after_close(
    p_user_id,
    v_st.deal_id,
    v_returned_total
  );
end;
$$;

-- Stamp legacy null-deal auto tops onto WSOP 2 for Dean so reclaim math is deal-scoped.
update public.poker_stable_backer_bankroll_adjustments
set deal_id = 'a89cfc9f-312f-4023-b3b6-cc6e09a1ed1a'
where user_id = '37b8d15f-3456-4a14-be8c-c8463fa43f5c'
  and kind = 'auto_top_up'
  and deal_id is null
  and occurred_at::date = date '2026-08-11';

-- Repair Dean: reclaim the $4,800 close residue from auto top-up, clear realized for clean retest.
do $$
declare
  v_uid uuid := '37b8d15f-3456-4a14-be8c-c8463fa43f5c';
  v_deal uuid := 'a89cfc9f-312f-4023-b3b6-cc6e09a1ed1a';
  v_bal numeric;
begin
  select bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls
  where user_id = v_uid;

  v_bal := public.poker_stable_round_money(coalesce(v_bal, 0));
  if v_bal > 0.005 then
    perform public.poker_stable_backer_book_liquid(
      v_uid,
      -v_bal,
      'seed_reverse',
      v_deal,
      'Auto-credited capital reclaimed after close.'
    );
  end if;

  update public.poker_stable_backer_bankrolls
  set
    realized_backing_pl = 0,
    updated_at = now()
  where user_id = v_uid;
end;
$$;

revoke all on function public.poker_stable_backer_outstanding_auto_top_up(uuid, uuid) from public;
revoke all on function public.poker_stable_backer_claw_auto_top_up_after_close(uuid, uuid, numeric) from public;
grant execute on function public.poker_stable_backer_outstanding_auto_top_up(uuid, uuid) to authenticated;
grant execute on function public.poker_stable_backer_claw_auto_top_up_after_close(uuid, uuid, numeric) to authenticated;

commit;
