-- Editable swap terms with counterparty re-accept, plus a real unwind for paid swaps.
--
-- Before this, a saved swap was immutable: a mistyped % could only be fixed by cancel +
-- recreate, and Cancel disappeared once either side hit Mark settled ... so an already-paid
-- swap was permanently wrong.
--
-- Model: creator revises terms (bumps terms_revised_at) → counterparty must re-accept
-- (terms_reaccepted_at >= terms_revised_at) before cash can be marked settled again.
-- Guest counterparties auto-accept (no app presence to accept from). Terms cannot be
-- revised while money is posted to bankrolls ... unmark settled first, which reverses both
-- personal bankroll posts.
--
-- Apply on TEST first. Do not apply to production without Ryan's explicit ask.

begin;

alter table public.poker_tournament_swaps
  add column if not exists terms_revised_at timestamptz,
  add column if not exists terms_revised_by uuid references auth.users(id) on delete set null,
  add column if not exists terms_reaccepted_at timestamptz,
  add column if not exists terms_revision_count integer not null default 0;

comment on column public.poker_tournament_swaps.terms_revised_at is
  'Last time the creator changed % / optional terms after the swap was saved.';
comment on column public.poker_tournament_swaps.terms_reaccepted_at is
  'Counterparty acceptance of the revised terms. Accepted when >= terms_revised_at.';
comment on column public.poker_tournament_swaps.terms_revision_count is
  'How many times terms were revised (audit / UI copy).';

-- ── Revise terms (creator only, unpaid only) ──────────────────────────────────

create or replace function public.poker_tournament_swap_update_terms(
  p_swap_id uuid,
  p_pct_creator_gives numeric,
  p_pct_counterparty_gives numeric,
  p_both_must_cash boolean default false,
  p_final_bullet_only boolean default false,
  p_final_table_only boolean default false,
  p_min_cash_threshold numeric default null
)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.poker_tournament_swaps%rowtype;
  v_min numeric;
  v_unchanged boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_swap_id is null then
    raise exception 'Missing swap id';
  end if;

  select * into v_row
  from public.poker_tournament_swaps s
  where s.id = p_swap_id
  for update;

  if v_row.id is null then
    raise exception 'Swap not found';
  end if;
  if v_row.creator_user_id is distinct from v_uid then
    raise exception 'Only the swap creator can change these terms';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'Swap is cancelled';
  end if;
  if coalesce(v_row.settlement_bankroll_posted, false)
     or v_row.creator_marked_paid
     or v_row.counterparty_marked_paid then
    raise exception 'Mark Unsettled before changing swap terms';
  end if;

  if p_pct_creator_gives is null or p_pct_counterparty_gives is null then
    raise exception 'Enter both swap percentages';
  end if;
  if p_pct_creator_gives < 0 or p_pct_creator_gives > 100
     or p_pct_counterparty_gives < 0 or p_pct_counterparty_gives > 100 then
    raise exception 'Swap percentages must be between 0 and 100';
  end if;

  v_min := case
    when p_min_cash_threshold is null then null
    else public.poker_stable_round_money(p_min_cash_threshold)
  end;
  if v_min is not null and v_min <= 0 then
    raise exception 'Minimum cash threshold must be greater than 0';
  end if;

  v_unchanged :=
    v_row.pct_creator_gives = p_pct_creator_gives
    and v_row.pct_counterparty_gives = p_pct_counterparty_gives
    and v_row.both_must_cash = coalesce(p_both_must_cash, false)
    and v_row.final_bullet_only = coalesce(p_final_bullet_only, false)
    and v_row.final_table_only = coalesce(p_final_table_only, false)
    and v_row.min_cash_threshold is not distinct from v_min;

  if v_unchanged then
    return v_row;
  end if;

  update public.poker_tournament_swaps
  set
    pct_creator_gives = p_pct_creator_gives,
    pct_counterparty_gives = p_pct_counterparty_gives,
    both_must_cash = coalesce(p_both_must_cash, false),
    final_bullet_only = coalesce(p_final_bullet_only, false),
    final_table_only = coalesce(p_final_table_only, false),
    min_cash_threshold = v_min,
    terms_revised_at = now(),
    terms_revised_by = v_uid,
    terms_revision_count = coalesce(terms_revision_count, 0) + 1,
    -- Guests have no app surface to accept from; Edge users must re-accept.
    terms_reaccepted_at = case
      when counterparty_kind = 'guest' or counterparty_user_id is null then now()
      else null
    end
  where id = v_row.id
  returning * into v_row;

  -- Both results already in ⇒ recompute the owed amount under the new terms.
  if v_row.creator_result_ready and v_row.counterparty_result_ready then
    v_row := public.poker_tournament_swap_try_settle(v_row.id);
  end if;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_update_terms(uuid, numeric, numeric, boolean, boolean, boolean, numeric) is
  'Creator revises swap % / optional terms on an unpaid swap; resets Edge-user re-acceptance and re-settles.';

revoke all on function public.poker_tournament_swap_update_terms(uuid, numeric, numeric, boolean, boolean, boolean, numeric) from public;
grant execute on function public.poker_tournament_swap_update_terms(uuid, numeric, numeric, boolean, boolean, boolean, numeric) to authenticated;

-- ── Counterparty accepts revised terms ────────────────────────────────────────

create or replace function public.poker_tournament_swap_accept_revised_terms(p_swap_id uuid)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.poker_tournament_swaps%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from public.poker_tournament_swaps s
  where s.id = p_swap_id
  for update;

  if v_row.id is null then
    raise exception 'Swap not found';
  end if;
  if v_row.counterparty_user_id is distinct from v_uid then
    raise exception 'Only the swap counterparty can accept revised terms';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'Swap is cancelled';
  end if;
  if v_row.terms_revised_at is null then
    return v_row;
  end if;

  update public.poker_tournament_swaps
  set terms_reaccepted_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_accept_revised_terms(uuid) is
  'Counterparty accepts revised swap terms so cash can be marked settled again.';

revoke all on function public.poker_tournament_swap_accept_revised_terms(uuid) from public;
grant execute on function public.poker_tournament_swap_accept_revised_terms(uuid) to authenticated;

-- ── Mark paid: block on unaccepted terms, and unmark clears BOTH sides ────────

create or replace function public.poker_tournament_swap_mark_paid(
  p_swap_id uuid,
  p_paid boolean default true
)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.poker_tournament_swaps%rowtype;
  v_amt numeric;
  v_was_posted boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_swap_id is null then
    raise exception 'Missing swap id';
  end if;

  select * into v_row
  from public.poker_tournament_swaps s
  where s.id = p_swap_id
  for update;

  if v_row.id is null then
    raise exception 'Swap not found';
  end if;

  if v_row.creator_user_id is distinct from v_uid
     and v_row.counterparty_user_id is distinct from v_uid then
    raise exception 'Not a party to this swap';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'Swap is cancelled';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(v_row.settlement_amount, 0));
  v_was_posted := coalesce(v_row.settlement_bankroll_posted, false);

  if coalesce(p_paid, true) then
    if v_row.status <> 'settled' and abs(v_amt) >= 0.005 then
      raise exception 'Swap results are not settled yet';
    end if;

    -- Revised terms must be accepted before money moves under them.
    if v_row.terms_revised_at is not null
       and (
         v_row.terms_reaccepted_at is null
         or v_row.terms_reaccepted_at < v_row.terms_revised_at
       ) then
      raise exception 'Revised swap terms are not accepted yet';
    end if;

    if not v_was_posted and abs(v_amt) >= 0.005 then
      -- settlement_amount > 0 ⇒ counterparty owes creator
      if v_row.creator_user_id is not null then
        perform public.poker_stable_credit_player_personal_bankroll(v_row.creator_user_id, v_amt);
      end if;
      if v_row.counterparty_user_id is not null then
        perform public.poker_stable_credit_player_personal_bankroll(v_row.counterparty_user_id, -v_amt);
      end if;
      v_was_posted := true;
    end if;

    update public.poker_tournament_swaps
    set
      creator_marked_paid = true,
      counterparty_marked_paid = true,
      settlement_bankroll_posted = v_was_posted
    where id = v_row.id
    returning * into v_row;
  else
    if v_was_posted and abs(v_amt) >= 0.005 then
      if v_row.creator_user_id is not null then
        perform public.poker_stable_credit_player_personal_bankroll(v_row.creator_user_id, -v_amt);
      end if;
      if v_row.counterparty_user_id is not null then
        perform public.poker_stable_credit_player_personal_bankroll(v_row.counterparty_user_id, v_amt);
      end if;
      v_was_posted := false;
    end if;

    -- Mark settled sets both flags, so unmark must clear both ... otherwise the swap
    -- stays "paid" for Cancel / Edit purposes with nothing posted to either bankroll.
    update public.poker_tournament_swaps
    set
      creator_marked_paid = false,
      counterparty_marked_paid = false,
      settlement_bankroll_posted = v_was_posted
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_mark_paid(uuid, boolean) is
  'Mark swap cash settled and post settlement_amount to personal bankrolls (idempotent). Unmark reverses both posts and clears both paid flags. Blocked while revised terms are unaccepted.';

revoke all on function public.poker_tournament_swap_mark_paid(uuid, boolean) from public;
grant execute on function public.poker_tournament_swap_mark_paid(uuid, boolean) to authenticated;

commit;
