-- Progressive decline: when a pending backer declines, their capital comes off the stake
-- (baseline + roll + starting_roll), remaining open slices keep dollar exposure via
-- action_pct renormalization, and any backer allocation is released (credit if debited).

begin;

create or replace function public.poker_stable_release_backer_allocation(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
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
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'already_released');
  end if;

  if v_row.bankroll_debited and v_row.amount > 0 then
    perform public.poker_stable_backer_adjust_balance(v_row.user_id, v_row.amount);
  end if;

  update public.poker_stable_backer_allocations
  set status = 'released'
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'released', true,
    'allocation_id', v_row.id,
    'credited', case when v_row.bankroll_debited then v_row.amount else 0 end
  );
end;
$$;

comment on function public.poker_stable_release_backer_allocation(uuid) is
  'Marks slice allocation released; credits Stable backing bankroll when it was debited.';

create or replace function public.poker_stable_shrink_deal_after_slice_decline(
  p_deal_id uuid,
  p_declined_slice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_baseline numeric;
  v_starting numeric;
  v_roll numeric;
  v_capital numeric;
  v_new_baseline numeric;
  v_open_count int;
  v_open record;
  v_dollar numeric;
  v_new_pct numeric;
begin
  if p_deal_id is null or p_declined_slice_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_ids');
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
  for update;

  if v_deal.id is null then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_found');
  end if;

  if v_deal.status not in ('pending', 'active') then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_open');
  end if;

  select * into v_slice
  from public.poker_stable_deal_slices s
  where s.id = p_declined_slice_id
    and s.deal_id = p_deal_id;

  if v_slice.id is null then
    return jsonb_build_object('ok', false, 'reason', 'slice_not_found');
  end if;

  if v_slice.status is distinct from 'declined' then
    return jsonb_build_object('ok', false, 'reason', 'slice_not_declined');
  end if;

  select count(*)::int into v_open_count
  from public.poker_stable_deal_slices s
  where s.deal_id = p_deal_id
    and s.status in ('pending', 'active');

  -- Last open backer gone: detach path owns deal terminalization.
  if v_open_count <= 0 then
    return jsonb_build_object('ok', true, 'shrunk', false, 'reason', 'no_open_slices');
  end if;

  v_baseline := public.poker_stable_round_money(coalesce(v_deal.baseline_bankroll, 0));
  v_starting := public.poker_stable_round_money(
    coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  );
  v_capital := public.poker_stable_round_money(
    v_baseline * (coalesce(v_slice.action_pct, 0) / 100)
  );

  if v_capital <= 0 then
    return jsonb_build_object('ok', true, 'shrunk', false, 'reason', 'zero_capital');
  end if;

  if v_capital > v_baseline + 0.005 then
    v_capital := v_baseline;
  end if;

  v_new_baseline := public.poker_stable_round_money(v_baseline - v_capital);
  if v_new_baseline < 0 then
    v_new_baseline := 0;
  end if;

  select coalesce(p.overall_bankroll, v_starting, v_baseline, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := v_starting;
  end if;
  v_roll := public.poker_stable_round_money(v_roll);

  -- Preserve dollar exposure for remaining open slices against the new baseline.
  if v_new_baseline > 0 then
    for v_open in
      select s.id, s.action_pct
      from public.poker_stable_deal_slices s
      where s.deal_id = p_deal_id
        and s.status in ('pending', 'active')
      order by s.slice_index, s.id
    loop
      v_dollar := public.poker_stable_round_money(
        v_baseline * (coalesce(v_open.action_pct, 0) / 100)
      );
      v_new_pct := public.poker_stable_round_money((v_dollar / v_new_baseline) * 100);
      update public.poker_stable_deal_slices
      set action_pct = v_new_pct
      where id = v_open.id
        and action_pct is distinct from v_new_pct;
    end loop;
  end if;

  update public.poker_stable_deals
  set baseline_bankroll = v_new_baseline,
      starting_roll = public.poker_stable_round_money(greatest(0, v_starting - v_capital)),
      updated_at = now()
  where id = p_deal_id;

  update public.poker_deal_bankroll_profiles
  set overall_bankroll = public.poker_stable_round_money(v_roll - v_capital)
  where deal_id = p_deal_id;

  if v_deal.stakee_user_id is not null then
    insert into public.poker_stable_ledger_entries (deal_id, user_id, entry_kind, message)
    values (
      p_deal_id,
      v_deal.stakee_user_id,
      'backing_reduced',
      format(
        'Stake reduced by %s after a backer declined',
        trim(to_char(v_capital, 'FM$999,999,990.00'))
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'shrunk', true,
    'capital_removed', v_capital,
    'baseline_before', v_baseline,
    'baseline_after', v_new_baseline,
    'roll_before', v_roll,
    'roll_after', public.poker_stable_round_money(v_roll - v_capital)
  );
end;
$$;

comment on function public.poker_stable_shrink_deal_after_slice_decline(uuid, uuid) is
  'After a slice is declined: shrink deal baseline/roll and renormalize remaining open action %.';

create or replace function public.poker_stable_decline_backer_slice(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_detach jsonb;
  v_release jsonb;
  v_shrink jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_slice
  from public.poker_stable_deal_slices s
  where s.id = p_slice_id
  for update;

  if v_slice.id is null then
    raise exception 'Slice not found';
  end if;
  if v_slice.staker_user_id is distinct from auth.uid() then
    raise exception 'Not your slice';
  end if;
  if v_slice.status is distinct from 'pending' then
    raise exception 'Slice is not pending';
  end if;

  update public.poker_stable_deal_slices
  set status = 'declined',
      responded_at = now()
  where id = p_slice_id;

  v_release := public.poker_stable_release_backer_allocation(p_slice_id);
  v_shrink := public.poker_stable_shrink_deal_after_slice_decline(v_slice.deal_id, p_slice_id);
  v_detach := public.poker_stable_detach_stake_sessions_to_personal(v_slice.deal_id);

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_slice.deal_id,
    'slice_id', p_slice_id,
    'release', v_release,
    'shrink', v_shrink,
    'detach', v_detach
  );
end;
$$;

revoke all on function public.poker_stable_release_backer_allocation(uuid) from public;
revoke all on function public.poker_stable_shrink_deal_after_slice_decline(uuid, uuid) from public;
revoke all on function public.poker_stable_decline_backer_slice(uuid) from public;

grant execute on function public.poker_stable_release_backer_allocation(uuid) to authenticated;
grant execute on function public.poker_stable_shrink_deal_after_slice_decline(uuid, uuid) to authenticated;
grant execute on function public.poker_stable_decline_backer_slice(uuid) to authenticated;

-- Repair: declined slices that still hold pending/active allocations, and open deals
-- whose baseline still includes declined capital (open+declined action% still on original scale).
do $$
declare
  r record;
  v_deal public.poker_stable_deals%rowtype;
  v_baseline numeric;
  v_starting numeric;
  v_roll numeric;
  v_declined_capital numeric;
  v_open_pct numeric;
  v_declined_pct numeric;
  v_new_baseline numeric;
  v_open record;
  v_dollar numeric;
  v_new_pct numeric;
begin
  for r in
    select a.slice_id
    from public.poker_stable_backer_allocations a
    inner join public.poker_stable_deal_slices s on s.id = a.slice_id
    where s.status = 'declined'
      and a.status in ('pending', 'active')
  loop
    perform public.poker_stable_release_backer_allocation(r.slice_id);
  end loop;

  for v_deal in
    select d.*
    from public.poker_stable_deals d
    where d.status in ('pending', 'active')
      and exists (
        select 1
        from public.poker_stable_deal_slices s
        where s.deal_id = d.id
          and s.status = 'declined'
      )
      and exists (
        select 1
        from public.poker_stable_deal_slices s
        where s.deal_id = d.id
          and s.status in ('pending', 'active')
      )
    for update
  loop
    select
      coalesce(sum(s.action_pct) filter (where s.status in ('pending', 'active')), 0),
      coalesce(sum(s.action_pct) filter (where s.status = 'declined'), 0)
    into v_open_pct, v_declined_pct
    from public.poker_stable_deal_slices s
    where s.deal_id = v_deal.id;

    -- Still on original % scale (declined never shrunk the pie).
    if v_declined_pct <= 0 or (v_open_pct + v_declined_pct) > 100.001 then
      continue;
    end if;

    v_baseline := public.poker_stable_round_money(coalesce(v_deal.baseline_bankroll, 0));
    v_starting := public.poker_stable_round_money(
      coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0)
    );
    v_declined_capital := public.poker_stable_round_money(v_baseline * (v_declined_pct / 100));
    if v_declined_capital <= 0 then
      continue;
    end if;
    if v_declined_capital > v_baseline + 0.005 then
      v_declined_capital := v_baseline;
    end if;

    v_new_baseline := public.poker_stable_round_money(v_baseline - v_declined_capital);
    if v_new_baseline < 0 then
      v_new_baseline := 0;
    end if;

    select coalesce(p.overall_bankroll, v_starting, v_baseline, 0)
    into v_roll
    from public.poker_deal_bankroll_profiles p
    where p.deal_id = v_deal.id;

    if v_roll is null then
      v_roll := v_starting;
    end if;
    v_roll := public.poker_stable_round_money(v_roll);

    if v_new_baseline > 0 then
      for v_open in
        select s.id, s.action_pct
        from public.poker_stable_deal_slices s
        where s.deal_id = v_deal.id
          and s.status in ('pending', 'active')
        order by s.slice_index, s.id
      loop
        v_dollar := public.poker_stable_round_money(
          v_baseline * (coalesce(v_open.action_pct, 0) / 100)
        );
        v_new_pct := public.poker_stable_round_money((v_dollar / v_new_baseline) * 100);
        update public.poker_stable_deal_slices
        set action_pct = v_new_pct
        where id = v_open.id
          and action_pct is distinct from v_new_pct;
      end loop;
    end if;

    update public.poker_stable_deals
    set baseline_bankroll = v_new_baseline,
        starting_roll = public.poker_stable_round_money(greatest(0, v_starting - v_declined_capital)),
        updated_at = now()
    where id = v_deal.id;

    update public.poker_deal_bankroll_profiles
    set overall_bankroll = public.poker_stable_round_money(v_roll - v_declined_capital)
    where deal_id = v_deal.id;

    if v_deal.stakee_user_id is not null then
      insert into public.poker_stable_ledger_entries (deal_id, user_id, entry_kind, message)
      values (
        v_deal.id,
        v_deal.stakee_user_id,
        'backing_reduced',
        format(
          'Stake reduced by %s after a backer declined',
          trim(to_char(v_declined_capital, 'FM$999,999,990.00'))
        )
      );
    end if;
  end loop;
end;
$$;

commit;
