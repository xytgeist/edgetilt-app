-- Backer Create Stake seeds assumed capital into Stable backing bankroll.
-- That seed must reverse when the offer dies without ever debiting (player decline,
-- delete declined, progressive release of an undebited seeded slice).

begin;

alter table public.poker_stable_backer_allocations
  add column if not exists seed_applied boolean not null default false;

comment on column public.poker_stable_backer_allocations.seed_applied is
  'True when first-time seed credited bankroll for this slice; reverse on release if never bankroll_debited.';

create or replace function public.poker_stable_reverse_backer_seed(
  p_user_id uuid,
  p_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_bal numeric;
  v_after numeric;
begin
  if p_user_id is null then
    return false;
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    return false;
  end if;

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  if v_bal is null then
    return false;
  end if;

  -- Never drive liquid below zero from a seed reverse.
  v_amt := least(v_amt, public.poker_stable_round_money(v_bal));
  if v_amt <= 0 then
    return false;
  end if;

  perform public.poker_stable_backer_adjust_balance(p_user_id, -v_amt);

  select b.bankroll_balance into v_after
  from public.poker_stable_backer_bankrolls b
  where b.user_id = p_user_id;

  perform public.poker_stable_backer_log_manual_adjustment(
    p_user_id,
    -v_amt,
    public.poker_stable_round_money(coalesce(v_after, 0))
  );

  return true;
end;
$$;

comment on function public.poker_stable_reverse_backer_seed(uuid, numeric) is
  'Removes assumed Create Stake seed from Stable backing bankroll + logs matching negative adjustment.';

create or replace function public.poker_stable_release_backer_allocation(p_slice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_credited numeric := 0;
  v_seed_reversed numeric := 0;
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
    -- Prior release may have skipped seed reverse (pre-fix). Finish the reverse once.
    if v_row.seed_applied and not v_row.bankroll_debited and v_row.amount > 0 then
      if public.poker_stable_reverse_backer_seed(v_row.user_id, v_row.amount) then
        v_seed_reversed := v_row.amount;
      end if;
      update public.poker_stable_backer_allocations
      set seed_applied = false
      where id = v_row.id;
      return jsonb_build_object(
        'ok', true,
        'released', false,
        'reason', 'already_released',
        'seed_reversed', v_seed_reversed
      );
    end if;
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'already_released');
  end if;

  if v_row.bankroll_debited and v_row.amount > 0 then
    perform public.poker_stable_backer_adjust_balance(v_row.user_id, v_row.amount);
    v_credited := v_row.amount;
  elsif v_row.seed_applied and v_row.amount > 0 then
    -- Offer died before capital left bankroll ... unwind the assumed seed.
    if public.poker_stable_reverse_backer_seed(v_row.user_id, v_row.amount) then
      v_seed_reversed := v_row.amount;
    end if;
  end if;

  update public.poker_stable_backer_allocations
  set
    status = 'released',
    seed_applied = false
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'released', true,
    'allocation_id', v_row.id,
    'credited', v_credited,
    'seed_reversed', v_seed_reversed
  );
end;
$$;

comment on function public.poker_stable_release_backer_allocation(uuid) is
  'Marks slice allocation released; credits if debited, or reverses Create Stake seed if never debited.';

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
  v_seeded boolean := false;
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

  v_is_initiator :=
    not v_deal_player_initiated
    and v_deal_lead is not null
    and v_slice.staker_user_id = v_deal_lead;

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
    if v_should_seed and not v_existing.bankroll_debited then
      v_seeded := public.poker_stable_maybe_seed_first_backer_bankroll(
        v_slice.staker_user_id,
        v_amount,
        p_slice_id
      );
      if v_seeded and not v_existing.seed_applied then
        update public.poker_stable_backer_allocations
        set seed_applied = true
        where id = v_existing.id;
      end if;
    end if;
    if v_should_debit and not v_existing.bankroll_debited then
      perform public.poker_stable_debit_backer_allocation(v_existing.id);
    end if;
    return;
  end if;

  if v_should_seed then
    v_seeded := public.poker_stable_maybe_seed_first_backer_bankroll(
      v_slice.staker_user_id,
      v_amount,
      p_slice_id
    );
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, status, bankroll_debited, seed_applied
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_amount,
    v_target_status,
    false,
    coalesce(v_seeded, false)
  )
  returning id into v_allocation_id;

  if v_should_debit then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

comment on function public.poker_stable_ensure_backer_allocation(uuid) is
  'Ensures allocation row; seeds for initiator/accept; records seed_applied for decline reverse.';

create or replace function public.poker_stable_stakee_decline_backer_offer(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detail text;
  v_slice record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(d.label, 'Backing stake')
  into v_detail
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status = 'pending'
    and d.staker_user_id is not null;

  update public.poker_stable_deals
  set
    status = 'declined',
    responded_at = now(),
    pending_terms_json = null,
    stakee_terms_ack_required = false,
    staker_terms_ack_required = false
  where id = p_deal_id
    and stakee_user_id = v_uid
    and status = 'pending'
    and staker_user_id is not null;

  if not found then
    raise exception 'You cannot decline this stake';
  end if;

  update public.poker_stable_deal_slices
  set status = 'declined', responded_at = now()
  where deal_id = p_deal_id
    and status in ('pending', 'active');

  -- Drop holds + reverse Create Stake seed so assumed capital does not stick in liquid.
  for v_slice in
    select s.id
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
  loop
    perform public.poker_stable_release_backer_allocation(v_slice.id);
  end loop;

  perform public.poker_stable_notify_lead_and_syndicate_backers(
    p_deal_id,
    v_uid,
    'poker_stable_stakee_declined',
    v_detail,
    false
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'declined');
end;
$$;

comment on function public.poker_stable_stakee_decline_backer_offer(uuid) is
  'Player declines backer Create Stake; releases allocations and reverses undebited seed.';

create or replace function public.poker_stable_delete_declined_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_deal public.poker_stable_deals%rowtype;
  v_allowed boolean := false;
  v_slice record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id
  for update;

  if v_deal.id is null then
    raise exception 'Stake not found';
  end if;

  if v_deal.status <> 'declined' then
    raise exception 'Only declined stakes can be deleted this way';
  end if;

  if v_deal.stakee_user_id = v_uid then
    v_allowed := true;
  elsif v_deal.staker_user_id is not null and v_deal.staker_user_id = v_uid then
    v_allowed := true;
  elsif exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.staker_user_id = v_uid
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'You cannot delete this declined offer';
  end if;

  -- Release before cascade-delete so undebited seed is reversed.
  for v_slice in
    select s.id
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
  loop
    perform public.poker_stable_release_backer_allocation(v_slice.id);
  end loop;

  update public.poker_bankroll_sessions
  set deal_id = null
  where deal_id = p_deal_id;

  delete from public.activity_events
  where poker_stable_deal_id = p_deal_id;

  delete from public.poker_stable_deals
  where id = p_deal_id;
end;
$fn$;

comment on function public.poker_stable_delete_declined_deal(uuid) is
  'Hard-delete declined stake after releasing allocations / reversing undebited seed.';

-- Repair: declined (or already-released) undebited allocations that still hold invented seed.
-- Mark seed_applied when liquid still equals the slice amount and there are no other open stakes.
do $$
declare
  r record;
begin
  for r in
    select
      a.id as allocation_id,
      a.slice_id,
      a.user_id,
      a.amount,
      a.status,
      a.seed_applied,
      a.bankroll_debited
    from public.poker_stable_backer_allocations a
    inner join public.poker_stable_deals d on d.id = a.deal_id
    left join public.poker_stable_backer_bankrolls b on b.user_id = a.user_id
    where not a.bankroll_debited
      and a.amount > 0
      and d.status in ('declined', 'cancelled', 'revoked')
      and (
        a.seed_applied
        or (
          public.poker_stable_round_money(coalesce(b.bankroll_balance, 0))
            = public.poker_stable_round_money(a.amount)
          and not public.poker_stable_backer_has_other_open_stakes(a.user_id, a.slice_id)
        )
      )
  loop
    if not r.seed_applied then
      update public.poker_stable_backer_allocations
      set seed_applied = true
      where id = r.allocation_id;
    end if;
    perform public.poker_stable_release_backer_allocation(r.slice_id);
  end loop;
end;
$$;

revoke all on function public.poker_stable_reverse_backer_seed(uuid, numeric) from public;
grant execute on function public.poker_stable_reverse_backer_seed(uuid, numeric) to authenticated;

commit;
