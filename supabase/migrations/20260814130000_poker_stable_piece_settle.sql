-- Allow cash_piece / tournament_piece to finalize through the existing settle engine.
-- Piece math uses the same roll = baseline + session P/L path. No makeup loop in product
-- terms; recorded makeup is just baseline vs roll on a losing session.

create or replace function public.poker_stable_apply_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_finalize boolean default false,
  p_settled_by_user_id uuid default null,
  p_stake_reduction_total numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_settled_by_user_id, auth.uid());
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_profit_above numeric;
  v_makeup numeric;
  v_settlement_id uuid;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_shares record;
  v_reduction numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  if v_deal.status not in ('active', 'revoked') then
    raise exception 'Deal is not open for settlement';
  end if;

  if v_deal.deal_type not in (
    'cash_backing',
    'tournament_package',
    'cash_piece',
    'tournament_piece'
  ) then
    raise exception 'Settle is only for backing deals';
  end if;

  v_reduction := public.poker_stable_round_money(greatest(0, coalesce(p_stake_reduction_total, 0)));

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);

  if v_reduction > v_baseline + 0.005 then
    raise exception 'Stake reduction cannot exceed baseline';
  end if;

  v_profit_above := public.poker_stable_round_money(greatest(0, v_roll - v_baseline));
  v_makeup := public.poker_stable_round_money(greatest(0, v_baseline - v_roll));

  insert into public.poker_stable_deal_settlements (
    deal_id,
    baseline_at_settle,
    roll_at_settle,
    profit_above_baseline,
    makeup_at_settle,
    rakeback_total,
    stake_reduction_total,
    settled_by_user_id,
    note
  )
  values (
    p_deal_id,
    v_baseline,
    v_roll,
    v_profit_above,
    v_makeup,
    public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    v_reduction,
    v_uid,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_settlement_id;

  for v_slice in
    select *
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
    order by s.slice_index
  loop
    select * into v_shares
    from public.poker_stable_slice_settle_shares(v_slice, v_profit_above, coalesce(p_rakeback_total, 0));

    insert into public.poker_stable_deal_settlement_lines (
      settlement_id, slice_id, profit_share, rakeback_share, total_owed, direction
    )
    values (
      v_settlement_id,
      v_slice.id,
      v_shares.profit_share,
      v_shares.rakeback_share,
      v_shares.total_owed,
      v_shares.direction
    );
  end loop;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, v_baseline)
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;

  if p_finalize then
    update public.poker_stable_deals
    set status = 'settled',
        settled_at = now(),
        updated_at = now()
    where id = p_deal_id;
  else
    update public.poker_stable_deals
    set updated_at = now()
    where id = p_deal_id;
  end if;

  if v_reduction > 0 then
    perform public.poker_stable_apply_stake_reduction(
      p_deal_id,
      v_reduction,
      v_uid,
      v_settlement_id,
      'With periodic settlement',
      true
    );
  end if;

  return v_settlement_id;
end;
$$;
