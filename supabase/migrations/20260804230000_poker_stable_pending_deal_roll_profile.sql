-- Pending player-created stakes: maintain deal roll profile + activate when first backer accepts.
-- Fixes Stable portfolio MTM stuck at baseline when co-backers are still pending.

begin;

create or replace function public.poker_stable_deal_session_profit(p_deal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    sum(
      coalesce(s.cash_out, 0)
      - coalesce(s.buy_in, 0)
      - coalesce(s.rebuy_amount, 0)
      - coalesce(s.addon_amount, 0)
      + coalesce(s.bounty_winnings, 0)
    ),
    0
  )
  from public.poker_bankroll_sessions s
  where s.deal_id = p_deal_id
    and s.status is distinct from 'active';
$$;

create or replace function public.poker_stable_ensure_deal_bankroll_profile(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_base numeric;
  v_overall numeric;
begin
  if p_deal_id is null then
    return;
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  if v_deal.id is null then
    return;
  end if;

  if v_deal.status not in ('pending', 'active') then
    return;
  end if;

  v_base := public.poker_stable_round_money(
    coalesce(v_deal.starting_roll, v_deal.baseline_bankroll, 0)
  );
  v_overall := public.poker_stable_round_money(
    v_base + public.poker_stable_deal_session_profit(p_deal_id)
  );

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, v_overall)
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;
end;
$$;

create or replace function public.poker_stable_activate_player_deal_on_backer_accept(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
begin
  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  if v_deal.id is null then
    return;
  end if;

  if v_deal.staker_user_id is not null then
    return;
  end if;

  if not exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.status = 'active'
  ) then
    return;
  end if;

  if v_deal.status in ('pending', 'draft') then
    update public.poker_stable_deals
    set status = 'active',
        responded_at = coalesce(responded_at, now())
    where id = p_deal_id
      and status in ('pending', 'draft');
  end if;

  perform public.poker_stable_ensure_deal_bankroll_profile(p_deal_id);
end;
$$;

-- Extend slice allocation hook: activate player deal + roll profile when backer accepts.
create or replace function public.poker_stable_ensure_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal_status text;
  v_deal_player_initiated boolean;
  v_amount numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
  v_should_debit boolean;
begin
  select * into v_slice from public.poker_stable_deal_slices where id = p_slice_id;
  if v_slice.id is null then
    return;
  end if;
  if v_slice.counterparty_kind <> 'user' or v_slice.staker_user_id is null then
    return;
  end if;
  if v_slice.status not in ('pending', 'active') then
    return;
  end if;

  select d.status, (d.stakee_user_id is not null and d.staker_user_id is null)
  into v_deal_status, v_deal_player_initiated
  from public.poker_stable_deals d
  where d.id = v_slice.deal_id;

  if v_slice.status = 'active' and v_deal_player_initiated then
    perform public.poker_stable_activate_player_deal_on_backer_accept(v_slice.deal_id);
    select d.status into v_deal_status
    from public.poker_stable_deals d
    where d.id = v_slice.deal_id;
  end if;

  v_target_status := case when v_slice.status = 'active' then 'active' else 'pending' end;
  v_amount := public.poker_stable_slice_allocation_amount(v_slice.deal_id, v_slice.action_pct);

  v_should_debit :=
    v_slice.status = 'active'
    and (
      v_deal_status = 'active'
      or (v_deal_status = 'pending' and v_deal_player_initiated)
    );

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    if v_should_debit and not v_existing.bankroll_debited then
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    end if;
    return;
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, status, bankroll_debited
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_amount,
    v_target_status,
    false
  )
  returning id into v_allocation_id;

  if v_should_debit then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

create or replace function public.poker_stable_sessions_refresh_deal_roll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deal_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status and coalesce(old.cash_out, 0) = coalesce(new.cash_out, 0)
     and coalesce(old.buy_in, 0) = coalesce(new.buy_in, 0)
     and coalesce(old.rebuy_amount, 0) = coalesce(new.rebuy_amount, 0)
     and coalesce(old.addon_amount, 0) = coalesce(new.addon_amount, 0)
     and coalesce(old.bounty_winnings, 0) = coalesce(new.bounty_winnings, 0) then
    return new;
  end if;
  perform public.poker_stable_ensure_deal_bankroll_profile(new.deal_id);
  return new;
end;
$$;

drop trigger if exists poker_stable_sessions_refresh_deal_roll on public.poker_bankroll_sessions;
create trigger poker_stable_sessions_refresh_deal_roll
  after insert or update of status, buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, deal_id
  on public.poker_bankroll_sessions
  for each row
  when (new.deal_id is not null)
  execute function public.poker_stable_sessions_refresh_deal_roll();

-- Stakee may bootstrap/update roll while deal is still pending (pending stake sessions).
drop policy if exists "poker_deal_bankroll_profiles_insert" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_insert"
  on public.poker_deal_bankroll_profiles for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.status in ('pending', 'active')
        and public.poker_stable_user_can_access_deal(d.id, auth.uid())
    )
  );

-- Backfill stuck player deals + roll profiles (e.g. Testing 14 / LVSlotGod).
do $$
declare
  v_deal_id uuid;
begin
  for v_deal_id in
    select d.id
    from public.poker_stable_deals d
    where d.staker_user_id is null
      and d.status in ('pending', 'draft', 'active')
      and exists (
        select 1
        from public.poker_stable_deal_slices s
        where s.deal_id = d.id
          and s.status = 'active'
      )
  loop
    perform public.poker_stable_activate_player_deal_on_backer_accept(v_deal_id);
    perform public.poker_stable_ensure_deal_bankroll_profile(v_deal_id);
  end loop;
end $$;

commit;
