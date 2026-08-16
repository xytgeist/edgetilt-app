-- Snapshot the exact bankroll credit written by Mark settled so Mark Unsettled
-- reverses the same dollars even if results / local terms later change.
-- Also update guest claim catch-up for the per-player bankroll model.
--
-- Apply on TEST first. Do not apply to production without Ryan's explicit ask.

begin;

alter table public.poker_tournament_swaps
  add column if not exists creator_bankroll_posted_amount numeric(12, 2),
  add column if not exists counterparty_bankroll_posted_amount numeric(12, 2);

comment on column public.poker_tournament_swaps.creator_bankroll_posted_amount is
  'Exact personal-bankroll delta credited to the creator on Mark settled. Reverse this on Mark Unsettled.';
comment on column public.poker_tournament_swaps.counterparty_bankroll_posted_amount is
  'Exact personal-bankroll delta credited to the counterparty on Mark settled. Reverse this on Mark Unsettled.';

-- Backfill snapshots for rows already posted under independent books / legacy shared post.
update public.poker_tournament_swaps
set
  creator_bankroll_posted_amount = case
    when creator_bankroll_posted and creator_bankroll_posted_amount is null then
      public.poker_stable_round_money(
        coalesce(creator_book_settlement_amount, settlement_amount, 0)
      )
    else creator_bankroll_posted_amount
  end,
  counterparty_bankroll_posted_amount = case
    when counterparty_bankroll_posted and counterparty_bankroll_posted_amount is null then
      public.poker_stable_round_money(
        -coalesce(counterparty_book_settlement_amount, settlement_amount, 0)
      )
    else counterparty_bankroll_posted_amount
  end
where creator_bankroll_posted or counterparty_bankroll_posted;

-- Do not rewrite a posted side's settlement amount when later results sync.
create or replace function public.poker_tournament_swap_refresh_book_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.poker_tournament_swaps
  set
    creator_book_settlement_amount = case
      when creator_bankroll_posted then creator_book_settlement_amount
      when creator_book_terms is null then null
      else public.poker_tournament_swap_calculate_book_amount(id, creator_book_terms)
    end,
    counterparty_book_settlement_amount = case
      when counterparty_bankroll_posted then counterparty_book_settlement_amount
      when counterparty_book_terms is null then null
      else public.poker_tournament_swap_calculate_book_amount(id, counterparty_book_terms)
    end
  where id = new.id;
  return new;
end;
$$;

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
  v_role text;
  v_terms jsonb;
  v_amt numeric;
  v_delta numeric;
  v_posted boolean;
  v_posted_amount numeric;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_row
  from public.poker_tournament_swaps s
  where s.id = p_swap_id
  for update;

  if v_row.id is null then raise exception 'Swap not found'; end if;
  if v_row.status = 'cancelled' then raise exception 'Swap is cancelled'; end if;

  v_role := case
    when v_row.creator_user_id = v_uid then 'creator'
    when v_row.counterparty_user_id = v_uid then 'counterparty'
    else null
  end;
  if v_role is null then raise exception 'Not a party to this swap'; end if;

  v_posted := case
    when v_role = 'creator' then v_row.creator_bankroll_posted
    else v_row.counterparty_bankroll_posted
  end;
  v_posted_amount := case
    when v_role = 'creator' then v_row.creator_bankroll_posted_amount
    else v_row.counterparty_bankroll_posted_amount
  end;

  if coalesce(p_paid, true) then
    v_terms := case
      when v_role = 'creator' then
        coalesce(v_row.creator_book_terms, public.poker_tournament_swap_base_terms(v_row))
      else
        coalesce(v_row.counterparty_book_terms, public.poker_tournament_swap_base_terms(v_row))
    end;
    v_amt := case
      when v_role = 'creator' then
        coalesce(
          public.poker_tournament_swap_calculate_book_amount(v_row.id, v_terms),
          v_row.creator_book_settlement_amount,
          v_row.settlement_amount,
          0
        )
      else
        coalesce(
          public.poker_tournament_swap_calculate_book_amount(v_row.id, v_terms),
          v_row.counterparty_book_settlement_amount,
          v_row.settlement_amount,
          0
        )
    end;
    v_amt := public.poker_stable_round_money(v_amt);
    v_delta := case when v_role = 'creator' then v_amt else -v_amt end;

    if v_row.status <> 'settled' and abs(v_amt) >= 0.005 then
      raise exception 'Swap results are not settled yet';
    end if;

    if not v_posted and abs(v_delta) >= 0.005 then
      perform public.poker_stable_credit_player_personal_bankroll(v_uid, v_delta);
      v_posted := true;
      v_posted_amount := v_delta;
    elsif not v_posted then
      v_posted := true;
      v_posted_amount := 0;
    end if;
  else
    -- Reverse the exact dollars that were posted, not a recomputed amount.
    v_delta := coalesce(v_posted_amount, 0);
    if v_posted and abs(v_delta) >= 0.005 then
      perform public.poker_stable_credit_player_personal_bankroll(v_uid, -v_delta);
    end if;
    v_posted := false;
    v_posted_amount := null;
    v_amt := case
      when v_role = 'creator' then
        coalesce(v_row.creator_book_settlement_amount, v_row.settlement_amount)
      else
        coalesce(v_row.counterparty_book_settlement_amount, v_row.settlement_amount)
    end;
  end if;

  if v_role = 'creator' then
    update public.poker_tournament_swaps
    set
      creator_marked_paid = coalesce(p_paid, true),
      creator_bankroll_posted = v_posted,
      creator_bankroll_posted_amount = v_posted_amount,
      creator_book_settlement_amount = coalesce(v_amt, creator_book_settlement_amount),
      settlement_bankroll_posted =
        v_posted or coalesce(counterparty_bankroll_posted, false)
    where id = v_row.id
    returning * into v_row;
  else
    update public.poker_tournament_swaps
    set
      counterparty_marked_paid = coalesce(p_paid, true),
      counterparty_bankroll_posted = v_posted,
      counterparty_bankroll_posted_amount = v_posted_amount,
      counterparty_book_settlement_amount = coalesce(v_amt, counterparty_book_settlement_amount),
      settlement_bankroll_posted =
        coalesce(creator_bankroll_posted, false) or v_posted
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_mark_paid(uuid, boolean) is
  'Post or reverse only the caller''s local swap amount. Unmark reverses the snapped posted amount.';

-- Guest claim catch-up: creator may already have posted their own books. Credit the
-- new Edge counterparty using the creator's posted snapshot / local amount, then mark
-- only the claimer's side as posted.
create or replace function public.poker_tournament_swap_attach_counterparty_user(
  p_swap_id uuid,
  p_user_id uuid
)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps;
  v_amt numeric;
  v_delta numeric;
  v_was_null boolean;
begin
  select * into s
  from public.poker_tournament_swaps
  where id = p_swap_id
  for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    raise exception 'Swap is cancelled';
  end if;
  if s.status not in ('active', 'settled') then
    raise exception 'Swap is not available to claim';
  end if;
  if p_user_id is null then
    raise exception 'Sign in to claim this swap';
  end if;
  if s.creator_user_id = p_user_id then
    raise exception 'You cannot claim your own swap';
  end if;
  if s.counterparty_kind = 'user'
     and s.counterparty_user_id is not null
     and s.counterparty_user_id <> p_user_id then
    raise exception 'This swap is already linked to another Edge account';
  end if;

  v_was_null := s.counterparty_user_id is null;

  if s.counterparty_user_id is null or s.counterparty_kind = 'guest' then
    update public.poker_tournament_swaps
    set
      counterparty_kind = 'user',
      counterparty_user_id = p_user_id,
      counterparty_guest_email = null,
      counterparty_guest_phone = null,
      counterparty_session_id = null,
      counterparty_session_accepted_at = null,
      updated_at = now()
    where id = s.id
    returning * into s;
  end if;

  if v_was_null
     and coalesce(s.creator_bankroll_posted, s.settlement_bankroll_posted, false)
     and not coalesce(s.counterparty_bankroll_posted, false) then
    -- Creator's posted credit is +settlement; claimer gets the opposite.
    v_delta := case
      when s.creator_bankroll_posted_amount is not null then
        -public.poker_stable_round_money(s.creator_bankroll_posted_amount)
      else
        -public.poker_stable_round_money(
          coalesce(s.creator_book_settlement_amount, s.settlement_amount, 0)
        )
    end;
    v_amt := -v_delta;
    if abs(v_delta) >= 0.005 then
      perform public.poker_stable_credit_player_personal_bankroll(p_user_id, v_delta);
    end if;
    update public.poker_tournament_swaps
    set
      counterparty_bankroll_posted = true,
      counterparty_bankroll_posted_amount = v_delta,
      counterparty_marked_paid = true,
      counterparty_book_settlement_amount = coalesce(
        counterparty_book_settlement_amount,
        creator_book_settlement_amount,
        settlement_amount,
        v_amt
      ),
      settlement_bankroll_posted = true
    where id = s.id
    returning * into s;
  end if;

  update public.poker_tournament_swap_claim_tokens
  set
    claimed_at = coalesce(claimed_at, now()),
    claimed_by_user_id = p_user_id
  where swap_id = s.id
    and claimed_at is null;

  return s;
end;
$$;

revoke all on function public.poker_tournament_swap_attach_counterparty_user(uuid, uuid) from public;
grant execute on function public.poker_tournament_swap_attach_counterparty_user(uuid, uuid)
  to service_role;

commit;
