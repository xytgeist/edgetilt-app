-- Route all backer stake economics to poker_stable_backer_bankrolls (Stable backing bankroll).
-- Player (stakee) settle credits still post to poker_bankroll_profiles (personal Poker bankroll).
-- Settle: backer bankroll_balance + realized_backing_pl mirror the same signed $.

begin;

create or replace function public.poker_stable_backer_ensure_row(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance, realized_backing_pl)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.poker_stable_backer_adjust_balance(
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
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt = 0 or p_user_id is null then
    return;
  end if;

  perform public.poker_stable_backer_ensure_row(p_user_id);

  update public.poker_stable_backer_bankrolls
  set bankroll_balance = public.poker_stable_round_money(bankroll_balance + v_amt)
  where user_id = p_user_id;
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

  perform public.poker_stable_backer_adjust_balance(p_user_id, -v_share);
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

  perform public.poker_stable_backer_adjust_balance(p_user_id, v_share);
end;
$$;

create or replace function public.poker_stable_credit_stakers_pro_rata(
  p_deal_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_slice record;
  v_share numeric;
  v_allocated numeric := 0;
  v_last_staker uuid;
  v_remainder numeric;
begin
  if coalesce(p_amount, 0) <= 0 then
    return;
  end if;

  v_total := public.poker_stable_active_slice_action_total(p_deal_id);
  if v_total <= 0 then
    return;
  end if;

  for v_slice in
    select s.id, s.staker_user_id, s.action_pct
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
    order by s.slice_index
  loop
    v_share := public.poker_stable_round_money(p_amount * (v_slice.action_pct / v_total));
    v_allocated := public.poker_stable_round_money(v_allocated + v_share);
    v_last_staker := v_slice.staker_user_id;
    if v_share <> 0 then
      perform public.poker_stable_backer_adjust_balance(v_slice.staker_user_id, v_share);
    end if;
  end loop;

  if v_last_staker is not null and v_allocated <> public.poker_stable_round_money(p_amount) then
    v_remainder := public.poker_stable_round_money(p_amount - v_allocated);
    perform public.poker_stable_backer_adjust_balance(v_last_staker, v_remainder);
  end if;
end;
$$;

create or replace function public.poker_stable_debit_stakers_pro_rata(
  p_deal_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_slice record;
  v_share numeric;
  v_allocated numeric := 0;
  v_last_staker uuid;
  v_remainder numeric;
begin
  if coalesce(p_amount, 0) <= 0 then
    return;
  end if;

  v_total := public.poker_stable_active_slice_action_total(p_deal_id);
  if v_total <= 0 then
    return;
  end if;

  for v_slice in
    select s.id, s.staker_user_id, s.action_pct
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
    order by s.slice_index
  loop
    v_share := public.poker_stable_round_money(p_amount * (v_slice.action_pct / v_total));
    v_allocated := public.poker_stable_round_money(v_allocated + v_share);
    v_last_staker := v_slice.staker_user_id;
    if v_share <> 0 then
      perform public.poker_stable_backer_adjust_balance(v_slice.staker_user_id, -v_share);
    end if;
  end loop;

  if v_last_staker is not null and v_allocated <> public.poker_stable_round_money(p_amount) then
    v_remainder := public.poker_stable_round_money(p_amount - v_allocated);
    perform public.poker_stable_backer_adjust_balance(v_last_staker, -v_remainder);
  end if;
end;
$$;

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
begin
  select * into v_st from public.poker_stable_deal_settlements where id = p_settlement_id;
  if v_st.id is null then
    raise exception 'Settlement not found';
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_st.deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

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

  -- Backer: Stable backing bankroll + realized P/L (never personal Poker bankroll).
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

-- Legacy helper: settle-only mirror (bankroll + realized). Do not use for top-up/reduce.
create or replace function public.poker_stable_backer_credit_realized_pl(
  p_user_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.poker_stable_backer_apply_settle(p_user_id, p_amount);
end;
$$;

commit;
