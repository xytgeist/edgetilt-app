-- Allow stakee to close (finalize) revoked deals via poker_stable_close_deal.
-- UI already exposes Close stake on revoked; run_settlement previously required status = active only.

create or replace function public.poker_stable_run_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_finalize boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_profit_above numeric;
  v_makeup numeric;
  v_settlement_id uuid;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_shares record;
  v_player_net numeric := 0;
  v_player_credit numeric := 0;
  v_line_signed numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.*
  into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid;

  if v_deal.id is null then
    raise exception 'Stake not found';
  end if;

  if v_deal.status = 'revoked' then
    if not p_finalize then
      raise exception 'Revoked stake can only be closed';
    end if;
  elsif v_deal.status <> 'active' then
    raise exception 'Active stake not found';
  end if;

  if v_deal.deal_type not in ('cash_backing', 'tournament_package') then
    raise exception 'Settle is only for ongoing backing deals';
  end if;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);
  v_profit_above := public.poker_stable_round_money(greatest(0, v_roll - v_baseline));
  v_makeup := public.poker_stable_round_money(greatest(0, v_baseline - v_roll));

  insert into public.poker_stable_deal_settlements (
    deal_id,
    baseline_at_settle,
    roll_at_settle,
    profit_above_baseline,
    makeup_at_settle,
    rakeback_total,
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
    select *
    into v_shares
    from public.poker_stable_slice_settle_shares(v_slice, v_profit_above, coalesce(p_rakeback_total, 0));

    insert into public.poker_stable_deal_settlement_lines (
      settlement_id,
      slice_id,
      profit_share,
      rakeback_share,
      total_owed,
      direction
    )
    values (
      v_settlement_id,
      v_slice.id,
      v_shares.profit_share,
      v_shares.rakeback_share,
      v_shares.total_owed,
      v_shares.direction
    );

    v_line_signed := case
      when v_shares.direction = 'player_to_staker' then v_shares.total_owed
      else -v_shares.total_owed
    end;
    v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
  end loop;

  v_player_net := public.poker_stable_round_money(v_profit_above + v_player_net);

  if v_profit_above > 0 then
    v_player_credit := v_player_net;
  else
    v_player_credit := 0;
  end if;

  if v_player_credit <> 0 then
    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (v_uid, v_player_credit)
    on conflict (user_id) do update
      set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
  end if;

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

  return v_settlement_id;
end;
$$;
