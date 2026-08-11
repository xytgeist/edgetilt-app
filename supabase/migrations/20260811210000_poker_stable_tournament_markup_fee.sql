-- Tournament package markup: backer pays face × markup on accept.
-- Face stays in the stake; fee (overage) credits player personal Poker bankroll
-- and hits backer Realized P/L immediately. Fee is not portfolio capital.
-- Cancel after accept unwinds paid amount + fee.

begin;

alter table public.poker_stable_deals
  add column if not exists markup_rate numeric(8, 4);

comment on column public.poker_stable_deals.markup_rate is
  'Deal-level tournament markup rate (e.g. 1.15). Null when profit_split / cash_backing.';

alter table public.poker_stable_backer_allocations
  add column if not exists paid_amount numeric(12, 2),
  add column if not exists fee_amount numeric(12, 2) not null default 0,
  add column if not exists fee_posted boolean not null default false;

comment on column public.poker_stable_backer_allocations.amount is
  'Face stake capital (baseline × action %). Portfolio / MTM basis.';
comment on column public.poker_stable_backer_allocations.paid_amount is
  'Amount debited from Stable backing bankroll (face × markup for tournament markup).';
comment on column public.poker_stable_backer_allocations.fee_amount is
  'Markup fee (paid − face) credited to player personal bankroll.';
comment on column public.poker_stable_backer_allocations.fee_posted is
  'True after fee credited to player + backer realized hit.';

update public.poker_stable_backer_allocations
set paid_amount = amount
where paid_amount is null;

alter table public.poker_stable_backer_allocations
  alter column paid_amount set default 0;

alter table public.poker_stable_backer_allocations
  alter column paid_amount set not null;

create or replace function public.poker_stable_backer_apply_realized_only(
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
  set realized_backing_pl = public.poker_stable_round_money(realized_backing_pl + v_amt)
  where user_id = p_user_id;
end;
$$;

comment on function public.poker_stable_backer_apply_realized_only(uuid, numeric) is
  'Adjust Realized P/L only (no bankroll_balance). Used for tournament markup fees.';

create or replace function public.poker_stable_credit_player_personal_bankroll(
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

  insert into public.poker_bankroll_profiles (user_id, overall_bankroll)
  values (p_user_id, v_amt)
  on conflict (user_id) do update
  set overall_bankroll = public.poker_stable_round_money(
    public.poker_bankroll_profiles.overall_bankroll + excluded.overall_bankroll
  );
end;
$$;

create or replace function public.poker_stable_slice_entry_amounts(p_slice_id uuid)
returns table (
  face_amount numeric,
  paid_amount numeric,
  fee_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slice public.poker_stable_deal_slices%rowtype;
  v_deal public.poker_stable_deals%rowtype;
  v_face numeric;
  v_rate numeric;
  v_paid numeric;
  v_fee numeric;
begin
  select * into v_slice from public.poker_stable_deal_slices where id = p_slice_id;
  if v_slice.id is null then
    face_amount := 0;
    paid_amount := 0;
    fee_amount := 0;
    return next;
    return;
  end if;

  select * into v_deal from public.poker_stable_deals where id = v_slice.deal_id;
  v_face := public.poker_stable_slice_allocation_amount(v_slice.deal_id, v_slice.action_pct);

  if v_deal.deal_type = 'tournament_package'
     and v_slice.pricing_mode = 'markup' then
    v_rate := coalesce(v_deal.markup_rate, v_slice.markup_rate, 1);
    if v_rate is null or v_rate < 1 then
      v_rate := 1;
    end if;
    v_paid := public.poker_stable_round_money(v_face * v_rate);
    v_fee := public.poker_stable_round_money(v_paid - v_face);
  else
    v_paid := v_face;
    v_fee := 0;
  end if;

  face_amount := v_face;
  paid_amount := v_paid;
  fee_amount := v_fee;
  return next;
end;
$$;

create or replace function public.poker_stable_post_markup_fee(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_stakee uuid;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id
  for update;

  if v_row.id is null or v_row.fee_posted or coalesce(v_row.fee_amount, 0) <= 0 then
    return;
  end if;

  select d.stakee_user_id into v_stakee
  from public.poker_stable_deals d
  where d.id = v_row.deal_id;

  if v_stakee is null then
    return;
  end if;

  perform public.poker_stable_credit_player_personal_bankroll(v_stakee, v_row.fee_amount);
  perform public.poker_stable_backer_apply_realized_only(v_row.user_id, -v_row.fee_amount);

  update public.poker_stable_backer_allocations
  set fee_posted = true
  where id = v_row.id;
end;
$$;

create or replace function public.poker_stable_unwind_markup_fee(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_stakee uuid;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id
  for update;

  if v_row.id is null or not v_row.fee_posted or coalesce(v_row.fee_amount, 0) <= 0 then
    return;
  end if;

  select d.stakee_user_id into v_stakee
  from public.poker_stable_deals d
  where d.id = v_row.deal_id;

  if v_stakee is not null then
    perform public.poker_stable_credit_player_personal_bankroll(v_stakee, -v_row.fee_amount);
  end if;
  perform public.poker_stable_backer_apply_realized_only(v_row.user_id, v_row.fee_amount);

  update public.poker_stable_backer_allocations
  set fee_posted = false
  where id = v_row.id;
end;
$$;

create or replace function public.poker_stable_debit_backer_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.poker_stable_backer_allocations%rowtype;
  v_paid numeric;
begin
  select * into v_row
  from public.poker_stable_backer_allocations
  where id = p_allocation_id
  for update;

  if v_row.id is null or v_row.bankroll_debited then
    return;
  end if;

  v_paid := public.poker_stable_round_money(coalesce(v_row.paid_amount, v_row.amount, 0));
  if v_paid <= 0 then
    return;
  end if;

  -- Seed enough liquid to cover paid (markup) amount for first-timers.
  perform public.poker_stable_maybe_seed_first_backer_bankroll(
    v_row.user_id,
    v_paid,
    v_row.slice_id
  );

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_row.user_id, 0)
  on conflict (user_id) do nothing;

  update public.poker_stable_backer_bankrolls
  set bankroll_balance = public.poker_stable_round_money(bankroll_balance - v_paid)
  where user_id = v_row.user_id;

  update public.poker_stable_backer_allocations
  set bankroll_debited = true
  where id = v_row.id;

  perform public.poker_stable_post_markup_fee(p_allocation_id);
end;
$$;

comment on function public.poker_stable_debit_backer_allocation(uuid) is
  'Debits paid amount (face × markup when applicable); posts tournament markup fee to player + realized.';

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
  v_paid numeric;
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

  v_paid := public.poker_stable_round_money(coalesce(v_row.paid_amount, v_row.amount, 0));

  if v_row.status = 'released' then
    perform public.poker_stable_unwind_markup_fee(v_row.id);
    if v_row.seed_applied and not v_row.bankroll_debited and v_paid > 0 then
      if public.poker_stable_reverse_backer_seed(v_row.user_id, v_paid) then
        v_seed_reversed := v_paid;
      end if;
      update public.poker_stable_backer_allocations
      set seed_applied = false
      where id = v_row.id;
    end if;
    return jsonb_build_object(
      'ok', true,
      'released', false,
      'reason', 'already_released',
      'seed_reversed', v_seed_reversed
    );
  end if;

  -- Unwind fee before crediting paid (player personal ↔ backer realized).
  perform public.poker_stable_unwind_markup_fee(v_row.id);

  if v_row.bankroll_debited and v_paid > 0 then
    perform public.poker_stable_backer_adjust_balance(v_row.user_id, v_paid);
    v_credited := v_paid;
  elsif v_row.seed_applied and v_paid > 0 then
    if public.poker_stable_reverse_backer_seed(v_row.user_id, v_paid) then
      v_seed_reversed := v_paid;
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
  'Release allocation: credit paid amount if debited, reverse undebited seed, unwind markup fee.';

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
  v_face numeric;
  v_paid numeric;
  v_fee numeric;
  v_existing public.poker_stable_backer_allocations%rowtype;
  v_target_status text;
  v_allocation_id uuid;
  v_should_debit boolean;
  v_is_initiator boolean;
  v_should_seed boolean;
  v_seeded boolean := false;
  v_entry record;
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

  select * into v_entry from public.poker_stable_slice_entry_amounts(p_slice_id);
  v_face := coalesce(v_entry.face_amount, 0);
  v_paid := coalesce(v_entry.paid_amount, v_face);
  v_fee := coalesce(v_entry.fee_amount, 0);

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
    if not v_existing.bankroll_debited then
      update public.poker_stable_backer_allocations
      set
        amount = v_face,
        paid_amount = v_paid,
        fee_amount = v_fee
      where id = v_existing.id;
    end if;
    if v_should_seed and not v_existing.bankroll_debited then
      v_seeded := public.poker_stable_maybe_seed_first_backer_bankroll(
        v_slice.staker_user_id,
        v_paid,
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
    elsif v_existing.bankroll_debited and not v_existing.fee_posted and v_fee > 0 then
      perform public.poker_stable_post_markup_fee(v_existing.id);
    end if;
    return;
  end if;

  if v_should_seed then
    v_seeded := public.poker_stable_maybe_seed_first_backer_bankroll(
      v_slice.staker_user_id,
      v_paid,
      p_slice_id
    );
  end if;

  insert into public.poker_stable_backer_allocations (
    user_id, deal_id, slice_id, amount, paid_amount, fee_amount,
    status, bankroll_debited, seed_applied, fee_posted
  )
  values (
    v_slice.staker_user_id,
    v_slice.deal_id,
    p_slice_id,
    v_face,
    v_paid,
    v_fee,
    v_target_status,
    false,
    coalesce(v_seeded, false),
    false
  )
  returning id into v_allocation_id;

  if v_should_debit then
    perform public.poker_stable_debit_backer_allocation(v_allocation_id);
  end if;
end;
$$;

comment on function public.poker_stable_ensure_backer_allocation(uuid) is
  'Ensures allocation with face/paid/fee; seeds/debits paid; posts tournament markup fee on debit.';

create or replace function public.poker_stable_cancel_stake_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_label text;
  v_slice record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.status, d.label
  into v_status, v_label
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('pending', 'active');

  if v_status is null then
    raise exception 'You cannot delete this stake';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_settlements
    where deal_id = p_deal_id
  ) then
    raise exception 'Cannot delete a stake that has been settled';
  end if;

  -- Unwind any accepted backer capital + markup fees before tear-down.
  for v_slice in
    select s.id
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
  loop
    perform public.poker_stable_release_backer_allocation(v_slice.id);
  end loop;

  with ranked as (
    select
      ae.id,
      ae.recipient_user_id,
      row_number() over (
        partition by ae.recipient_user_id
        order by ae.created_at desc nulls last, ae.id desc
      ) as rn
    from public.activity_events ae
    where ae.poker_stable_deal_id = p_deal_id
      and ae.event_type in (
        'poker_stable_slice_invite',
        'poker_stable_slice_nudge',
        'poker_stable_terms_edited',
        'poker_stable_offer_withdrawn'
      )
  ),
  dropped as (
    delete from public.activity_events ae
    using ranked r
    where ae.id = r.id
      and r.rn > 1
    returning ae.id
  )
  update public.activity_events ae
  set
    event_type = 'poker_stable_offer_withdrawn',
    detail_text = coalesce(nullif(trim(v_label), ''), nullif(trim(ae.detail_text), ''), 'Stake offer'),
    created_at = now(),
    read_at = null
  from ranked r
  where ae.id = r.id
    and r.rn = 1;

  delete from public.poker_bankroll_sessions
  where deal_id = p_deal_id
    and user_id = v_uid;

  delete from public.poker_stable_deals
  where id = p_deal_id
    and stakee_user_id = v_uid;
end;
$$;

comment on function public.poker_stable_cancel_stake_deal(uuid) is
  'Stakee cancels stake (including after Edge accepts); unwinds paid capital + markup fees, then deletes.';

revoke all on function public.poker_stable_backer_apply_realized_only(uuid, numeric) from public;
revoke all on function public.poker_stable_credit_player_personal_bankroll(uuid, numeric) from public;
revoke all on function public.poker_stable_slice_entry_amounts(uuid) from public;
revoke all on function public.poker_stable_post_markup_fee(uuid) from public;
revoke all on function public.poker_stable_unwind_markup_fee(uuid) from public;

grant execute on function public.poker_stable_backer_apply_realized_only(uuid, numeric) to authenticated;
grant execute on function public.poker_stable_credit_player_personal_bankroll(uuid, numeric) to authenticated;
grant execute on function public.poker_stable_slice_entry_amounts(uuid) to authenticated;
grant execute on function public.poker_stable_post_markup_fee(uuid) to authenticated;
grant execute on function public.poker_stable_unwind_markup_fee(uuid) to authenticated;

commit;
