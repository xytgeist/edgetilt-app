-- First-time bankroll seed was firing on pending player-offer invites (received
-- slices), inventing $10k + pending hold before Accept. Seed only when:
--   • backer initiated Create Stake (deal.staker_user_id = slice staker), or
--   • capital is actually committing (debit / slice becomes active).
-- Received pending invites stay at $0 until Accept (then seed + debit).

begin;

create or replace function public.poker_stable_ensure_backer_allocation(p_slice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal_status text;
  v_deal_lead uuid;
  v_deal_player_initiated boolean;
  v_amount numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
  v_should_debit boolean;
  v_is_initiator boolean;
  v_should_seed boolean;
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

  select
    d.status,
    d.staker_user_id,
    (d.stakee_user_id is not null and d.staker_user_id is null)
  into v_deal_status, v_deal_lead, v_deal_player_initiated
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

  -- Create Stake lead only … not syndicate invites / player-offer recipients.
  v_is_initiator :=
    not v_deal_player_initiated
    and v_deal_lead is not null
    and v_slice.staker_user_id = v_deal_lead;

  -- Seed when committing funds, when initiator creates, or when slice is active
  -- but still on pending-hold (accepted, deal not live yet).
  v_should_seed :=
    v_should_debit
    or v_is_initiator
    or v_slice.status = 'active';

  select * into v_existing
  from public.poker_stable_backer_allocations a
  where a.slice_id = p_slice_id;

  if v_existing.id is not null then
    if v_existing.status <> v_target_status and v_target_status = 'active' then
      update public.poker_stable_backer_allocations
      set status = 'active'
      where id = v_existing.id;
    end if;
    if v_should_seed then
      perform public.poker_stable_maybe_seed_first_backer_bankroll(
        v_slice.staker_user_id,
        v_amount,
        p_slice_id
      );
    end if;
    if v_should_debit and not v_existing.bankroll_debited then
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    end if;
    return;
  end if;

  if v_should_seed then
    perform public.poker_stable_maybe_seed_first_backer_bankroll(
      v_slice.staker_user_id,
      v_amount,
      p_slice_id
    );
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

comment on function public.poker_stable_ensure_backer_allocation(uuid) is
  'Ensures allocation row; seeds first-time bankroll only for Create Stake initiator or when slice commits (active/debit), not on received pending invites.';

-- Repair mistaken seeds: first-time +$seed with only pending player-offer allocation(s), not debited.
do $$
declare
  r record;
  v_pending_total numeric;
  v_adj_total numeric;
  v_bal numeric;
  v_after numeric;
begin
  for r in
    select b.user_id, public.poker_stable_round_money(b.bankroll_balance) as bal
    from public.poker_stable_backer_bankrolls b
    where public.poker_stable_round_money(b.bankroll_balance) > 0
  loop
    -- Only open stakes are pending player-initiated slices for this user.
    if exists (
      select 1
      from public.poker_stable_deal_slices s
      join public.poker_stable_deals d on d.id = s.deal_id
      where s.staker_user_id = r.user_id
        and s.counterparty_kind = 'user'
        and s.status in ('pending', 'active')
        and d.status in ('pending', 'active')
        and not (d.stakee_user_id is not null and d.staker_user_id is null and s.status = 'pending')
    ) then
      continue;
    end if;

    if not exists (
      select 1
      from public.poker_stable_deal_slices s
      join public.poker_stable_deals d on d.id = s.deal_id
      where s.staker_user_id = r.user_id
        and s.counterparty_kind = 'user'
        and s.status = 'pending'
        and d.status = 'pending'
        and d.stakee_user_id is not null
        and d.staker_user_id is null
    ) then
      continue;
    end if;

    select public.poker_stable_round_money(coalesce(sum(a.amount), 0))
    into v_pending_total
    from public.poker_stable_backer_allocations a
    join public.poker_stable_deals d on d.id = a.deal_id
    where a.user_id = r.user_id
      and a.status = 'pending'
      and not a.bankroll_debited
      and d.status = 'pending'
      and d.stakee_user_id is not null
      and d.staker_user_id is null;

    select public.poker_stable_round_money(coalesce(sum(adj.amount), 0))
    into v_adj_total
    from public.poker_stable_backer_bankroll_adjustments adj
    where adj.user_id = r.user_id;

    -- Seed-only history matching pending player-offer capital.
    if v_pending_total <= 0 then
      continue;
    end if;
    if v_adj_total is distinct from r.bal then
      continue;
    end if;
    if v_adj_total is distinct from v_pending_total then
      continue;
    end if;

    update public.poker_stable_backer_bankrolls
    set bankroll_balance = 0
    where user_id = r.user_id;

    insert into public.poker_stable_backer_bankroll_adjustments (user_id, amount, balance_after)
    values (r.user_id, -v_pending_total, 0);
  end loop;
end;
$$;

commit;
