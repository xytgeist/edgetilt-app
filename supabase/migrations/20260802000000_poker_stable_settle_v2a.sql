-- v2a: periodic settle (deal stays active) + close/end (final settle, merge sessions via settled status).
-- Credits player personal bankroll from settle engine; roll resets to baseline. See docs/poker-stable-spec.md.

create or replace function public.poker_stable_round_money(p_amount numeric, p_digits int default 2)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_amount, 0)::numeric, p_digits);
$$;

create or replace function public.poker_stable_slice_settle_shares(
  p_slice public.poker_stable_deal_slices,
  p_profit_above_baseline numeric,
  p_rakeback_total numeric
)
returns table (
  profit_share numeric,
  rakeback_share numeric,
  total_owed numeric,
  direction text
)
language plpgsql
stable
as $$
declare
  v_action_pct numeric;
  v_profit_on_slice numeric;
  v_profit_share numeric := 0;
  v_rakeback_share numeric := 0;
  v_total numeric;
begin
  v_action_pct := coalesce(p_slice.action_pct, 0) / 100.0;
  v_profit_on_slice := public.poker_stable_round_money(p_profit_above_baseline * v_action_pct);

  if p_slice.pricing_mode = 'profit_split' then
    v_profit_share := public.poker_stable_round_money(
      v_profit_on_slice * (1.0 - coalesce(p_slice.player_profit_pct, 0) / 100.0)
    );
  elsif p_slice.pricing_mode = 'markup' then
    v_profit_share := v_profit_on_slice;
  end if;

  if p_slice.rakeback_mode = 'all_to_stake' then
    v_rakeback_share := public.poker_stable_round_money(coalesce(p_rakeback_total, 0) * v_action_pct);
  elsif p_slice.rakeback_mode = 'custom' then
    v_rakeback_share := public.poker_stable_round_money(
      coalesce(p_rakeback_total, 0) * v_action_pct * (1.0 - coalesce(p_slice.rakeback_player_pct, 0) / 100.0)
    );
  end if;

  v_total := public.poker_stable_round_money(v_profit_share + v_rakeback_share);

  profit_share := v_profit_share;
  rakeback_share := v_rakeback_share;
  total_owed := abs(v_total);
  direction := case when v_total >= 0 then 'player_to_staker' else 'staker_to_player' end;
  return next;
end;
$$;

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
    and d.stakee_user_id = v_uid
    and d.status = 'active';

  if v_deal.id is null then
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

create or replace function public.poker_stable_periodic_settle(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.poker_stable_run_settlement(p_deal_id, p_rakeback_total, p_note, false);
end;
$$;

create or replace function public.poker_stable_close_deal(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.poker_stable_run_settlement(p_deal_id, p_rakeback_total, p_note, true);
end;
$$;

revoke all on function public.poker_stable_round_money(numeric, int) from public;
revoke all on function public.poker_stable_slice_settle_shares(public.poker_stable_deal_slices, numeric, numeric) from public;
revoke all on function public.poker_stable_run_settlement(uuid, numeric, text, boolean) from public;
revoke all on function public.poker_stable_periodic_settle(uuid, numeric, text) from public;
revoke all on function public.poker_stable_close_deal(uuid, numeric, text) from public;

grant execute on function public.poker_stable_periodic_settle(uuid, numeric, text) to authenticated;
grant execute on function public.poker_stable_close_deal(uuid, numeric, text) to authenticated;
