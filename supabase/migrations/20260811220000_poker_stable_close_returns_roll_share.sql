-- Close settle: return each backer's share of CURRENT roll (not baseline),
-- book underwater makeup to Realized P/L, and release allocations without
-- refunding the tournament markup fee (fee stays realized from accept).

begin;

create or replace function public.poker_stable_close_release_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_slice_id is null then
    return;
  end if;

  -- Close is not decline: do not credit paid_amount and do not reverse markup fee.
  update public.poker_stable_backer_allocations
  set
    status = 'released',
    seed_applied = false
  where slice_id = p_slice_id
    and status is distinct from 'released';
end;
$$;

comment on function public.poker_stable_close_release_backer_allocation(uuid) is
  'Mark allocation released on stake close without refunding paid capital or markup fee.';

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
  v_slice public.poker_stable_deal_slices%rowtype;
  v_alloc public.poker_stable_backer_allocations%rowtype;
  v_action numeric;
  v_roll_share numeric;
  v_makeup_share numeric;
  v_profit_share numeric;
  v_rakeback_share numeric;
  v_line public.poker_stable_deal_settlement_lines%rowtype;
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

  for v_slice in
    select s.*
    from public.poker_stable_deal_slices s
    where s.deal_id = v_st.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
      and s.status in ('active', 'declined')
  loop
    -- Idempotent: skip slices already closed-out.
    select * into v_alloc
    from public.poker_stable_backer_allocations a
    where a.slice_id = v_slice.id
    for update;

    if v_alloc.id is not null and v_alloc.status = 'released' then
      continue;
    end if;

    -- Only active settle participants get books (declined slices skipped unless they still held capital).
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

    perform public.poker_stable_close_release_backer_allocation(v_slice.id);
  end loop;
end;
$$;

comment on function public.poker_stable_apply_close_backer_books(uuid, uuid) is
  'Close settle for a backer: credit roll-share capital, book stake P/L to realized, release allocation (fee stays).';

create or replace function public.poker_stable_apply_settlement_personal(
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
  v_line record;
  v_player_credit numeric := 0;
  v_staker_credit numeric;
  v_player_net numeric := 0;
  v_line_signed numeric;
  v_is_close boolean := false;
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  if v_st.id is null then
    raise exception 'Settlement not found';
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_st.deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  v_is_close := v_deal.status in ('settled', 'closed');

  -- Player (stakee): personal Poker bankroll only.
  if p_user_id = v_deal.stakee_user_id then
    if coalesce(v_st.profit_above_baseline, 0) > 0 then
      for v_line in
        select l.*
        from public.poker_stable_deal_settlement_lines l
        where l.settlement_id = p_settlement_id
      loop
        v_line_signed := case
          when v_line.direction = 'player_to_staker' then v_line.total_owed
          else -v_line.total_owed
        end;
        v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
      end loop;

      v_player_net := public.poker_stable_round_money(coalesce(v_st.profit_above_baseline, 0) + v_player_net);
      v_player_credit := case when coalesce(v_st.profit_above_baseline, 0) > 0 then v_player_net else 0 end;
    end if;

    if v_player_credit <> 0 then
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (p_user_id, v_player_credit)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
    end if;

    return;
  end if;

  -- Backer close: return roll share + book stake P/L (markup fee already realized on accept).
  if v_is_close then
    perform public.poker_stable_apply_close_backer_books(p_settlement_id, p_user_id);
    return;
  end if;

  -- Backer periodic: Stable backing bankroll + realized P/L from settle lines only.
  for v_line in
    select l.*, s.staker_user_id, s.counterparty_kind
    from public.poker_stable_deal_settlement_lines l
    join public.poker_stable_deal_slices s on s.id = l.slice_id
    where l.settlement_id = p_settlement_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id = p_user_id
  loop
    v_staker_credit := public.poker_stable_round_money(v_line.profit_share + v_line.rakeback_share);
    if v_line.direction = 'staker_to_player' then
      v_staker_credit := -v_staker_credit;
    end if;
    if v_staker_credit <> 0 then
      perform public.poker_stable_backer_apply_settle(p_user_id, v_staker_credit);
    end if;
  end loop;
end;
$$;

revoke all on function public.poker_stable_close_release_backer_allocation(uuid) from public;
revoke all on function public.poker_stable_apply_close_backer_books(uuid, uuid) from public;
grant execute on function public.poker_stable_close_release_backer_allocation(uuid) to authenticated;
grant execute on function public.poker_stable_apply_close_backer_books(uuid, uuid) to authenticated;

commit;
