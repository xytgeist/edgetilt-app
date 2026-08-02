-- Stake reduction (inverse of top-up) + pro-rata backer personal bankroll on top-up debit / reduction credit.
-- Optional stake_reduction on periodic settlement proposals.

begin;

-- ---------------------------------------------------------------------------
-- Reduction log (mirror top-ups)
-- ---------------------------------------------------------------------------

create table if not exists public.poker_stable_deal_reductions (
  id                  uuid           primary key default gen_random_uuid(),
  deal_id             uuid           not null references public.poker_stable_deals(id) on delete cascade,
  settlement_id       uuid           references public.poker_stable_deal_settlements(id) on delete set null,
  amount              numeric(12, 2) not null check (amount > 0),
  funding_mode        text           not null default 'deal_wide'
                      check (funding_mode in ('deal_wide', 'single_staker', 'pro_rata')),
  baseline_before     numeric(12, 2) not null,
  baseline_after      numeric(12, 2) not null,
  roll_before         numeric(12, 2) not null,
  roll_after          numeric(12, 2) not null,
  logged_by_user_id   uuid           not null references auth.users(id) on delete cascade,
  note                text,
  created_at          timestamptz    not null default now()
);

create index if not exists poker_stable_deal_reductions_deal_idx
  on public.poker_stable_deal_reductions (deal_id, created_at desc);

alter table public.poker_stable_deal_reductions enable row level security;

drop policy if exists "poker_stable_deal_reductions_select" on public.poker_stable_deal_reductions;
create policy "poker_stable_deal_reductions_select"
  on public.poker_stable_deal_reductions for select
  to authenticated
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));

drop policy if exists "poker_stable_deal_reductions_insert" on public.poker_stable_deal_reductions;
create policy "poker_stable_deal_reductions_insert"
  on public.poker_stable_deal_reductions for insert
  to authenticated
  with check (
    logged_by_user_id = auth.uid()
    and exists (
      select 1 from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );

grant select, insert on public.poker_stable_deal_reductions to authenticated;

alter table public.poker_stable_deal_settlements
  add column if not exists stake_reduction_total numeric(12, 2) not null default 0;

alter table public.poker_stable_settlement_requests
  add column if not exists stake_reduction_total numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Pro-rata helpers
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_active_slice_action_total(p_deal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(s.action_pct), 0)
  from public.poker_stable_deal_slices s
  where s.deal_id = p_deal_id
    and s.status = 'active';
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
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (v_slice.staker_user_id, v_share)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
    end if;
  end loop;

  if v_last_staker is not null and v_allocated <> public.poker_stable_round_money(p_amount) then
    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (
      v_last_staker,
      public.poker_stable_round_money(p_amount - v_allocated)
    )
    on conflict (user_id) do update
      set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
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
      insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
      values (v_slice.staker_user_id, -v_share)
      on conflict (user_id) do update
        set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll - v_share;
    end if;
  end loop;

  if v_last_staker is not null and v_allocated <> public.poker_stable_round_money(p_amount) then
    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (
      v_last_staker,
      public.poker_stable_round_money(-(p_amount - v_allocated))
    )
    on conflict (user_id) do update
      set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll
        + public.poker_stable_round_money(-(p_amount - v_allocated));
  end if;
end;
$$;

create or replace function public.poker_stable_apply_stake_reduction(
  p_deal_id uuid,
  p_amount numeric,
  p_logged_by_user_id uuid,
  p_settlement_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_reduction_id uuid;
begin
  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    return null;
  end if;

  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  if v_deal.status <> 'active' then
    raise exception 'Stake reduction requires an active deal';
  end if;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);

  if v_amt > v_baseline + 0.005 then
    raise exception 'Reduction cannot exceed baseline (%).', trim(to_char(v_baseline, 'FM999,999,990.00'));
  end if;
  if v_amt > v_roll + 0.005 then
    raise exception 'Reduction cannot exceed current roll (%).', trim(to_char(v_roll, 'FM999,999,990.00'));
  end if;

  insert into public.poker_stable_deal_reductions (
    deal_id,
    settlement_id,
    amount,
    funding_mode,
    baseline_before,
    baseline_after,
    roll_before,
    roll_after,
    logged_by_user_id,
    note
  )
  values (
    p_deal_id,
    p_settlement_id,
    v_amt,
    'pro_rata',
    v_baseline,
    public.poker_stable_round_money(v_baseline - v_amt),
    v_roll,
    public.poker_stable_round_money(v_roll - v_amt),
    p_logged_by_user_id,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_reduction_id;

  update public.poker_stable_deals
  set baseline_bankroll = public.poker_stable_round_money(v_baseline - v_amt),
      updated_at = now()
  where id = p_deal_id;

  update public.poker_deal_bankroll_profiles
  set overall_bankroll = public.poker_stable_round_money(v_roll - v_amt)
  where deal_id = p_deal_id;

  perform public.poker_stable_credit_stakers_pro_rata(p_deal_id, v_amt);

  return v_reduction_id;
end;
$$;

create or replace function public.poker_stable_record_topup(
  p_deal_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_topup_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive amount.';
  end if;

  select d.* into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status = 'active';

  if v_deal.id is null then
    raise exception 'Active stake not found';
  end if;

  select coalesce(p.overall_bankroll, v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  into v_roll
  from public.poker_deal_bankroll_profiles p
  where p.deal_id = p_deal_id;

  if v_roll is null then
    v_roll := coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0);
  end if;

  v_baseline := coalesce(v_deal.baseline_bankroll, 0);

  insert into public.poker_stable_deal_topups (
    deal_id,
    amount,
    funding_mode,
    baseline_before,
    baseline_after,
    roll_before,
    roll_after,
    logged_by_user_id,
    note
  )
  values (
    p_deal_id,
    v_amt,
    'pro_rata',
    v_baseline,
    public.poker_stable_round_money(v_baseline + v_amt),
    v_roll,
    public.poker_stable_round_money(v_roll + v_amt),
    v_uid,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_topup_id;

  update public.poker_stable_deals
  set baseline_bankroll = public.poker_stable_round_money(v_baseline + v_amt),
      updated_at = now()
  where id = p_deal_id;

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, public.poker_stable_round_money(v_roll + v_amt))
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;

  perform public.poker_stable_debit_stakers_pro_rata(p_deal_id, v_amt);

  return v_topup_id;
end;
$$;

create or replace function public.poker_stable_record_reduction(
  p_deal_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.poker_stable_deals d
    where d.id = p_deal_id
      and d.stakee_user_id = v_uid
      and d.status = 'active'
  ) then
    raise exception 'Active stake not found';
  end if;

  return public.poker_stable_apply_stake_reduction(
    p_deal_id,
    p_amount,
    v_uid,
    null,
    p_note
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Settlement engine: optional post-settle reduction
-- ---------------------------------------------------------------------------

create or replace function public.poker_stable_preview_settlement(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_stake_reduction_total numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_roll numeric;
  v_baseline numeric;
  v_profit_above numeric;
  v_makeup numeric;
  v_slice public.poker_stable_deal_slices%rowtype;
  v_shares record;
  v_player_net numeric := 0;
  v_line_signed numeric;
  v_lines jsonb := '[]'::jsonb;
  v_player_credit numeric := 0;
  v_reduction numeric;
  v_baseline_after_settle numeric;
  v_baseline_after_reduction numeric;
begin
  select d.* into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
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
  v_reduction := public.poker_stable_round_money(greatest(0, coalesce(p_stake_reduction_total, 0)));
  v_baseline_after_settle := v_baseline;
  v_baseline_after_reduction := public.poker_stable_round_money(v_baseline - v_reduction);

  for v_slice in
    select *
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
    order by s.slice_index
  loop
    select * into v_shares
    from public.poker_stable_slice_settle_shares(v_slice, v_profit_above, coalesce(p_rakeback_total, 0));

    v_lines := v_lines || jsonb_build_object(
      'slice_id', v_slice.id,
      'staker_user_id', v_slice.staker_user_id,
      'counterparty_kind', v_slice.counterparty_kind,
      'guest_label', v_slice.guest_label,
      'action_pct', v_slice.action_pct,
      'profit_share', v_shares.profit_share,
      'rakeback_share', v_shares.rakeback_share,
      'total_owed', v_shares.total_owed,
      'direction', v_shares.direction
    );

    v_line_signed := case
      when v_shares.direction = 'player_to_staker' then v_shares.total_owed
      else -v_shares.total_owed
    end;
    v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);
  end loop;

  v_player_net := public.poker_stable_round_money(v_profit_above + v_player_net);
  v_player_credit := case when v_profit_above > 0 then v_player_net else 0 end;

  return jsonb_build_object(
    'baseline_at_settle', v_baseline,
    'roll_at_settle', v_roll,
    'profit_above_baseline', v_profit_above,
    'makeup_at_settle', v_makeup,
    'rakeback_total', public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    'stake_reduction_total', v_reduction,
    'baseline_after_settle', v_baseline_after_settle,
    'baseline_after_reduction', v_baseline_after_reduction,
    'player_net', v_player_net,
    'player_credit', v_player_credit,
    'lines', v_lines
  );
end;
$$;

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
  v_player_net numeric := 0;
  v_player_credit numeric := 0;
  v_line_signed numeric;
  v_staker_credit numeric;
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

  if v_deal.deal_type not in ('cash_backing', 'tournament_package') then
    raise exception 'Settle is only for ongoing backing deals';
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

    v_line_signed := case
      when v_shares.direction = 'player_to_staker' then v_shares.total_owed
      else -v_shares.total_owed
    end;
    v_player_net := public.poker_stable_round_money(v_player_net - v_line_signed);

    if v_slice.counterparty_kind = 'user' and v_slice.staker_user_id is not null then
      v_staker_credit := public.poker_stable_round_money(v_shares.profit_share + v_shares.rakeback_share);
      if v_shares.direction = 'staker_to_player' then
        v_staker_credit := -v_staker_credit;
      end if;
      if v_staker_credit <> 0 then
        insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
        values (v_slice.staker_user_id, v_staker_credit)
        on conflict (user_id) do update
          set overall_bankroll = public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll;
      end if;
    end if;
  end loop;

  v_player_net := public.poker_stable_round_money(v_profit_above + v_player_net);
  v_player_credit := case when v_profit_above > 0 then v_player_net else 0 end;

  if v_player_credit <> 0 then
    insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
    values (v_deal.stakee_user_id, v_player_credit)
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

  if v_reduction > 0 then
    perform public.poker_stable_apply_stake_reduction(
      p_deal_id,
      v_reduction,
      v_uid,
      v_settlement_id,
      'With periodic settlement'
    );
  end if;

  return v_settlement_id;
end;
$$;

create or replace function public.poker_stable_propose_settlement(
  p_deal_id uuid,
  p_finalize boolean default false,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_stake_reduction_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
  v_is_stakee boolean;
  v_is_staker boolean;
  v_request_id uuid;
  v_settlement_id uuid;
  v_preview jsonb;
  v_voter uuid;
  v_kind text;
  v_detail text;
  v_reduction numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_reduction := public.poker_stable_round_money(greatest(0, coalesce(p_stake_reduction_total, 0)));

  select * into v_deal from public.poker_stable_deals d where d.id = p_deal_id;
  if v_deal.id is null then
    raise exception 'Deal not found';
  end if;

  v_is_stakee := v_deal.stakee_user_id = v_uid;
  v_is_staker := exists (
    select 1 from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
      and s.staker_user_id = v_uid
      and s.counterparty_kind = 'user'
  );

  if not v_is_stakee and not v_is_staker then
    raise exception 'Not authorized to propose settlement on this stake';
  end if;

  if v_deal.status not in ('active', 'revoked') then
    raise exception 'Deal is not open for settlement';
  end if;

  if exists (
    select 1 from public.poker_stable_settlement_requests r
    where r.deal_id = p_deal_id and r.status = 'pending'
  ) then
    raise exception 'A settlement is already awaiting confirmation';
  end if;

  if not p_finalize and v_deal.deal_type <> 'cash_backing' then
    raise exception 'Periodic settle applies to cash backing only';
  end if;

  if v_reduction > coalesce(v_deal.baseline_bankroll, 0) + 0.005 then
    raise exception 'Stake reduction cannot exceed baseline';
  end if;

  v_preview := public.poker_stable_preview_settlement(p_deal_id, p_rakeback_total, v_reduction);
  v_kind := case when p_finalize then 'close' else 'periodic' end;

  if not public.poker_stable_deal_needs_settlement_sync(p_deal_id) then
    v_settlement_id := public.poker_stable_apply_settlement(
      p_deal_id,
      p_rakeback_total,
      p_note,
      p_finalize,
      v_uid,
      v_reduction
    );
    perform public.poker_stable_write_settlement_ledger_entries(
      v_settlement_id,
      null,
      p_deal_id,
      p_finalize
    );
    return jsonb_build_object(
      'immediate', true,
      'settlement_id', v_settlement_id,
      'request_id', null
    );
  end if;

  insert into public.poker_stable_settlement_requests (
    deal_id,
    proposed_by_user_id,
    settle_kind,
    rakeback_total,
    stake_reduction_total,
    note,
    preview_json
  )
  values (
    p_deal_id,
    v_uid,
    v_kind,
    public.poker_stable_round_money(coalesce(p_rakeback_total, 0)),
    v_reduction,
    nullif(trim(coalesce(p_note, '')), ''),
    v_preview
  )
  returning id into v_request_id;

  if v_is_stakee then
    for v_voter in
      select distinct s.staker_user_id
      from public.poker_stable_deal_slices s
      where s.deal_id = p_deal_id
        and s.status = 'active'
        and s.counterparty_kind = 'user'
        and s.staker_user_id is not null
    loop
      insert into public.poker_stable_settlement_request_votes (request_id, user_id)
      values (v_request_id, v_voter);

      v_detail := format(
        '%s · %s settlement proposed%s',
        coalesce(v_deal.label, 'Stake'),
        case when p_finalize then 'Close' else 'Periodic' end,
        case when v_reduction > 0 then format(' · reduce %s', trim(to_char(v_reduction, 'FM999,999,990.00'))) else '' end
      );

      perform public.poker_stable_emit_activity_event(
        v_voter,
        v_uid,
        'poker_stable_settlement_proposed',
        p_deal_id,
        v_request_id,
        v_detail
      );
    end loop;
  else
    insert into public.poker_stable_settlement_request_votes (request_id, user_id)
    values (v_request_id, v_deal.stakee_user_id);

    v_detail := format(
      '%s · %s settlement proposed%s',
      coalesce(v_deal.label, 'Stake'),
      case when p_finalize then 'Close' else 'Periodic' end,
      case when v_reduction > 0 then format(' · reduce %s', trim(to_char(v_reduction, 'FM999,999,990.00'))) else '' end
    );

    perform public.poker_stable_emit_activity_event(
      v_deal.stakee_user_id,
      v_uid,
      'poker_stable_settlement_proposed',
      p_deal_id,
      v_request_id,
      v_detail
    );
  end if;

  return jsonb_build_object(
    'immediate', false,
    'settlement_id', null,
    'request_id', v_request_id
  );
end;
$$;

create or replace function public.poker_stable_respond_settlement(
  p_request_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.poker_stable_settlement_requests%rowtype;
  v_vote public.poker_stable_settlement_request_votes%rowtype;
  v_pending int;
  v_denied int;
  v_settlement_id uuid;
  v_finalize boolean;
  v_detail text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_response not in ('confirmed', 'denied') then
    raise exception 'Invalid response';
  end if;

  select * into v_req
  from public.poker_stable_settlement_requests r
  where r.id = p_request_id
  for update;

  if v_req.id is null then
    raise exception 'Settlement request not found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Settlement request is no longer pending';
  end if;

  select * into v_vote
  from public.poker_stable_settlement_request_votes v
  where v.request_id = p_request_id
    and v.user_id = v_uid
  for update;

  if v_vote.user_id is null then
    raise exception 'You are not required to respond to this settlement';
  end if;

  if v_vote.status <> 'pending' then
    raise exception 'You already responded to this settlement';
  end if;

  update public.poker_stable_settlement_request_votes
  set status = case when p_response = 'confirmed' then 'confirmed' else 'denied' end,
      responded_at = now()
  where request_id = p_request_id
    and user_id = v_uid;

  if p_response = 'denied' then
    update public.poker_stable_settlement_requests
    set status = 'rejected',
        finalized_at = now()
    where id = p_request_id;

    v_detail := 'Settlement was denied';
    perform public.poker_stable_emit_activity_event(
      v_req.proposed_by_user_id,
      v_uid,
      'poker_stable_settlement_resolved',
      v_req.deal_id,
      p_request_id,
      v_detail
    );

    return jsonb_build_object('status', 'rejected', 'settlement_id', null);
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'denied')
  into v_pending, v_denied
  from public.poker_stable_settlement_request_votes
  where request_id = p_request_id;

  if v_denied > 0 then
    update public.poker_stable_settlement_requests
    set status = 'rejected',
        finalized_at = now()
    where id = p_request_id;

    return jsonb_build_object('status', 'rejected', 'settlement_id', null);
  end if;

  if v_pending > 0 then
    return jsonb_build_object('status', 'pending', 'settlement_id', null);
  end if;

  v_finalize := v_req.settle_kind = 'close';

  v_settlement_id := public.poker_stable_apply_settlement(
    v_req.deal_id,
    v_req.rakeback_total,
    v_req.note,
    v_finalize,
    v_req.proposed_by_user_id,
    coalesce(v_req.stake_reduction_total, 0)
  );

  perform public.poker_stable_write_settlement_ledger_entries(
    v_settlement_id,
    p_request_id,
    v_req.deal_id,
    v_finalize
  );

  update public.poker_stable_settlement_requests
  set status = 'accepted',
      settlement_id = v_settlement_id,
      finalized_at = now()
  where id = p_request_id;

  v_detail := 'Settlement confirmed and applied';
  perform public.poker_stable_emit_activity_event(
    v_req.proposed_by_user_id,
    v_uid,
    'poker_stable_settlement_resolved',
    v_req.deal_id,
    p_request_id,
    v_detail
  );

  return jsonb_build_object('status', 'accepted', 'settlement_id', v_settlement_id);
end;
$$;

create or replace function public.poker_stable_periodic_settle(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_stake_reduction_total numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.poker_stable_propose_settlement(
    p_deal_id,
    false,
    p_rakeback_total,
    p_note,
    p_stake_reduction_total
  );
  if coalesce((v_result->>'immediate')::boolean, false) then
    return (v_result->>'settlement_id')::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.poker_stable_close_deal(
  p_deal_id uuid,
  p_rakeback_total numeric default 0,
  p_note text default null,
  p_stake_reduction_total numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.poker_stable_propose_settlement(
    p_deal_id,
    true,
    p_rakeback_total,
    p_note,
    p_stake_reduction_total
  );
  if coalesce((v_result->>'immediate')::boolean, false) then
    return (v_result->>'settlement_id')::uuid;
  end if;
  return null;
end;
$$;

revoke all on function public.poker_stable_record_topup(uuid, numeric, text) from public;
revoke all on function public.poker_stable_record_reduction(uuid, numeric, text) from public;
revoke all on function public.poker_stable_preview_settlement(uuid, numeric, numeric) from public;
revoke all on function public.poker_stable_propose_settlement(uuid, boolean, numeric, text, numeric) from public;

grant execute on function public.poker_stable_record_topup(uuid, numeric, text) to authenticated;
grant execute on function public.poker_stable_record_reduction(uuid, numeric, text) to authenticated;
grant execute on function public.poker_stable_preview_settlement(uuid, numeric, numeric) to authenticated;
grant execute on function public.poker_stable_propose_settlement(uuid, boolean, numeric, text, numeric) to authenticated;

commit;
