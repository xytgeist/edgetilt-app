-- Tournament swaps are bookkeeping, not a binding contract.
--
-- Each Edge user keeps independent terms, calculated settlement, and bankroll posting.
-- Editing one side never rewrites or blocks the other side. The other player may later
-- copy those terms into their own books or explicitly keep their existing terms.
--
-- Supersedes the mandatory re-accept gate introduced by 20260816130000.
-- Apply on TEST first. Do not apply to production without Ryan's explicit instruction.

begin;

alter table public.poker_tournament_swaps
  add column if not exists creator_book_terms jsonb,
  add column if not exists counterparty_book_terms jsonb,
  add column if not exists creator_book_settlement_amount numeric(12, 2),
  add column if not exists counterparty_book_settlement_amount numeric(12, 2),
  add column if not exists creator_book_revised_at timestamptz,
  add column if not exists counterparty_book_revised_at timestamptz,
  add column if not exists creator_ack_counterparty_revision_at timestamptz,
  add column if not exists counterparty_ack_creator_revision_at timestamptz,
  add column if not exists creator_bankroll_posted boolean not null default false,
  add column if not exists counterparty_bankroll_posted boolean not null default false;

comment on column public.poker_tournament_swaps.creator_book_terms is
  'Creator-local swap terms. Null falls back to the original shared terms.';
comment on column public.poker_tournament_swaps.counterparty_book_terms is
  'Counterparty-local swap terms. Null falls back to the original shared terms.';
comment on column public.poker_tournament_swaps.creator_book_settlement_amount is
  'Settlement amount under creator-local terms. Positive means counterparty owes creator.';
comment on column public.poker_tournament_swaps.counterparty_book_settlement_amount is
  'Settlement amount under counterparty-local terms. Positive means counterparty owes creator.';

-- Existing settlement_bankroll_posted meant both account posts were written together.
update public.poker_tournament_swaps
set
  creator_bankroll_posted =
    coalesce(settlement_bankroll_posted, false) and creator_user_id is not null,
  counterparty_bankroll_posted =
    coalesce(settlement_bankroll_posted, false) and counterparty_user_id is not null
where coalesce(settlement_bankroll_posted, false);

create or replace function public.poker_tournament_swap_base_terms(
  p_swap public.poker_tournament_swaps
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'pct_creator_gives', p_swap.pct_creator_gives,
    'pct_counterparty_gives', p_swap.pct_counterparty_gives,
    'both_must_cash', coalesce(p_swap.both_must_cash, false),
    'final_bullet_only', coalesce(p_swap.final_bullet_only, false),
    'final_table_only', coalesce(p_swap.final_table_only, false),
    'min_cash_threshold', p_swap.min_cash_threshold
  );
$$;

create or replace function public.poker_tournament_swap_calculate_book_amount(
  p_swap_id uuid,
  p_terms jsonb
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps%rowtype;
  v_event_buy numeric;
  v_face numeric;
  v_creator_cashed boolean;
  v_cp_cashed boolean;
  v_creator_ft boolean;
  v_cp_ft boolean;
  v_ft_size_c integer;
  v_ft_size_p integer;
  v_bullets_c integer;
  v_bullets_p integer;
  v_extra_c integer;
  v_extra_p integer;
  v_face_c numeric;
  v_face_p numeric;
  v_creator_pays_face numeric;
  v_cp_pays_face numeric;
  v_min_cash numeric;
  v_pct_c numeric;
  v_pct_p numeric;
  v_both_cash boolean;
  v_final_bullet boolean;
  v_final_table boolean;
  creator_net numeric;
  counterparty_net numeric;
  creator_owes numeric;
  counterparty_owes numeric;
begin
  select * into s
  from public.poker_tournament_swaps
  where id = p_swap_id;

  if s.id is null
     or not s.creator_result_ready
     or not s.counterparty_result_ready then
    return null;
  end if;

  p_terms := coalesce(p_terms, public.poker_tournament_swap_base_terms(s));
  v_pct_c := coalesce((p_terms ->> 'pct_creator_gives')::numeric, s.pct_creator_gives);
  v_pct_p := coalesce((p_terms ->> 'pct_counterparty_gives')::numeric, s.pct_counterparty_gives);
  v_both_cash := coalesce((p_terms ->> 'both_must_cash')::boolean, false);
  v_final_bullet := coalesce((p_terms ->> 'final_bullet_only')::boolean, false);
  v_final_table := coalesce((p_terms ->> 'final_table_only')::boolean, false);
  v_min_cash := coalesce((p_terms ->> 'min_cash_threshold')::numeric, 0);

  v_creator_cashed := coalesce(s.creator_cashed, coalesce(s.creator_prize, 0) > 0);
  v_cp_cashed := coalesce(s.counterparty_cashed, coalesce(s.counterparty_prize, 0) > 0);

  if v_both_cash and (not v_creator_cashed or not v_cp_cashed) then
    return 0;
  end if;
  if v_min_cash > 0
     and coalesce(s.creator_prize, 0) < v_min_cash
     and coalesce(s.counterparty_prize, 0) < v_min_cash then
    return 0;
  end if;

  if v_final_table then
    v_ft_size_c := case when s.creator_table_size = '6max' then 6 else 9 end;
    v_ft_size_p := case when s.counterparty_table_size = '6max' then 6 else 9 end;
    v_creator_ft := s.creator_finish_place is not null
      and s.creator_finish_place between 1 and v_ft_size_c;
    v_cp_ft := s.counterparty_finish_place is not null
      and s.counterparty_finish_place between 1 and v_ft_size_p;
    if not v_creator_ft and not v_cp_ft then
      if s.creator_finish_place is null or s.counterparty_finish_place is null then
        return null;
      end if;
      return 0;
    end if;
  end if;

  select e.buy_in into v_event_buy
  from public.poker_tournament_events e
  where e.id = s.tournament_event_id;

  v_face := coalesce(
    nullif(s.creator_face_buy_in, 0),
    nullif(s.counterparty_face_buy_in, 0),
    nullif(v_event_buy, 0),
    0
  );

  if v_final_bullet then
    v_bullets_c := 1;
    v_bullets_p := 1;
  else
    v_bullets_c := coalesce(
      s.creator_bullets,
      case when v_face > 0 and coalesce(s.creator_buy_in, 0) > 0
        then greatest(1, round(s.creator_buy_in / v_face))
        else 1
      end
    );
    v_bullets_p := coalesce(
      s.counterparty_bullets,
      case when v_face > 0 and coalesce(s.counterparty_buy_in, 0) > 0
        then greatest(1, round(s.counterparty_buy_in / v_face))
        else 1
      end
    );
    v_bullets_c := greatest(1, v_bullets_c - coalesce(s.creator_exclude_prior_bullets, 0));
    v_bullets_p := greatest(1, v_bullets_p - coalesce(s.counterparty_exclude_prior_bullets, 0));
  end if;

  v_extra_c := greatest(0, v_bullets_c - v_bullets_p);
  v_extra_p := greatest(0, v_bullets_p - v_bullets_c);
  v_face_c := v_extra_c * v_face * (v_pct_c / 100.0);
  v_face_p := v_extra_p * v_face * (v_pct_p / 100.0);
  v_creator_pays_face := case when not v_cp_cashed then v_face_p else 0 end;
  v_cp_pays_face := case when not v_creator_cashed then v_face_c else 0 end;

  if v_creator_cashed then
    creator_net := coalesce(s.creator_prize, 0) - v_face_c - v_creator_pays_face;
    creator_owes := greatest(0, creator_net) * (v_pct_c / 100.0) + v_creator_pays_face;
  else
    creator_owes := v_creator_pays_face;
  end if;

  if v_cp_cashed then
    counterparty_net := coalesce(s.counterparty_prize, 0) - v_face_p - v_cp_pays_face;
    counterparty_owes := greatest(0, counterparty_net) * (v_pct_p / 100.0) + v_cp_pays_face;
  else
    counterparty_owes := v_cp_pays_face;
  end if;

  return public.poker_stable_round_money(counterparty_owes - creator_owes);
end;
$$;

revoke all on function public.poker_tournament_swap_calculate_book_amount(uuid, jsonb) from public;
grant execute on function public.poker_tournament_swap_calculate_book_amount(uuid, jsonb)
  to authenticated, service_role;

-- Keep local amounts current when either player logs/corrects results or a later flight
-- changes bullet totals. The trigger watches only result inputs, so its book-amount update
-- does not recurse.
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
      when creator_book_terms is null then null
      else public.poker_tournament_swap_calculate_book_amount(id, creator_book_terms)
    end,
    counterparty_book_settlement_amount = case
      when counterparty_book_terms is null then null
      else public.poker_tournament_swap_calculate_book_amount(id, counterparty_book_terms)
    end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists poker_tournament_swap_refresh_book_amounts
  on public.poker_tournament_swaps;
create trigger poker_tournament_swap_refresh_book_amounts
after update of
  creator_buy_in,
  creator_prize,
  creator_result_ready,
  counterparty_buy_in,
  counterparty_prize,
  counterparty_result_ready,
  creator_cashed,
  counterparty_cashed,
  creator_finish_place,
  counterparty_finish_place,
  creator_table_size,
  counterparty_table_size,
  creator_face_buy_in,
  counterparty_face_buy_in,
  creator_bullets,
  counterparty_bullets,
  creator_exclude_prior_bullets,
  counterparty_exclude_prior_bullets
on public.poker_tournament_swaps
for each row execute function public.poker_tournament_swap_refresh_book_amounts();

create or replace function public.poker_tournament_swap_update_my_book(
  p_swap_id uuid,
  p_pct_you_give numeric,
  p_pct_they_give numeric,
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
  v_role text;
  v_terms jsonb;
  v_amt numeric;
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

  if (v_role = 'creator' and (v_row.creator_marked_paid or v_row.creator_bankroll_posted))
     or (v_role = 'counterparty'
         and (v_row.counterparty_marked_paid or v_row.counterparty_bankroll_posted)) then
    raise exception 'Mark Unsettled in your books before changing your swap terms';
  end if;

  if p_pct_you_give is null or p_pct_they_give is null
     or p_pct_you_give < 0 or p_pct_you_give > 100
     or p_pct_they_give < 0 or p_pct_they_give > 100 then
    raise exception 'Swap percentages must be between 0 and 100';
  end if;
  if p_min_cash_threshold is not null and p_min_cash_threshold <= 0 then
    raise exception 'Minimum cash threshold must be greater than 0';
  end if;

  v_terms := jsonb_build_object(
    'pct_creator_gives', case when v_role = 'creator' then p_pct_you_give else p_pct_they_give end,
    'pct_counterparty_gives', case when v_role = 'creator' then p_pct_they_give else p_pct_you_give end,
    'both_must_cash', coalesce(p_both_must_cash, false),
    'final_bullet_only', coalesce(p_final_bullet_only, false),
    'final_table_only', coalesce(p_final_table_only, false),
    'min_cash_threshold', case
      when p_min_cash_threshold is null then null
      else public.poker_stable_round_money(p_min_cash_threshold)
    end
  );
  v_amt := public.poker_tournament_swap_calculate_book_amount(v_row.id, v_terms);

  if v_role = 'creator' then
    update public.poker_tournament_swaps
    set
      creator_book_terms = v_terms,
      creator_book_settlement_amount = v_amt,
      creator_book_revised_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    update public.poker_tournament_swaps
    set
      counterparty_book_terms = v_terms,
      counterparty_book_settlement_amount = v_amt,
      counterparty_book_revised_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.poker_tournament_swap_update_my_book(
  uuid, numeric, numeric, boolean, boolean, boolean, numeric
) from public;
grant execute on function public.poker_tournament_swap_update_my_book(
  uuid, numeric, numeric, boolean, boolean, boolean, numeric
) to authenticated;

create or replace function public.poker_tournament_swap_resolve_other_revision(
  p_swap_id uuid,
  p_use_their_terms boolean
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
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_row
  from public.poker_tournament_swaps s
  where s.id = p_swap_id
  for update;

  if v_row.id is null then raise exception 'Swap not found'; end if;
  v_role := case
    when v_row.creator_user_id = v_uid then 'creator'
    when v_row.counterparty_user_id = v_uid then 'counterparty'
    else null
  end;
  if v_role is null then raise exception 'Not a party to this swap'; end if;

  if coalesce(p_use_their_terms, false) then
    if (v_role = 'creator' and (v_row.creator_marked_paid or v_row.creator_bankroll_posted))
       or (v_role = 'counterparty'
           and (v_row.counterparty_marked_paid or v_row.counterparty_bankroll_posted)) then
      raise exception 'Mark Unsettled in your books before using their terms';
    end if;

    v_terms := case
      when v_role = 'creator' then
        coalesce(v_row.counterparty_book_terms, public.poker_tournament_swap_base_terms(v_row))
      else
        coalesce(v_row.creator_book_terms, public.poker_tournament_swap_base_terms(v_row))
    end;
    v_amt := public.poker_tournament_swap_calculate_book_amount(v_row.id, v_terms);
  end if;

  if v_role = 'creator' then
    update public.poker_tournament_swaps
    set
      creator_book_terms = case
        when coalesce(p_use_their_terms, false) then v_terms
        else creator_book_terms
      end,
      creator_book_settlement_amount = case
        when coalesce(p_use_their_terms, false) then v_amt
        else creator_book_settlement_amount
      end,
      creator_ack_counterparty_revision_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    update public.poker_tournament_swaps
    set
      counterparty_book_terms = case
        when coalesce(p_use_their_terms, false) then v_terms
        else counterparty_book_terms
      end,
      counterparty_book_settlement_amount = case
        when coalesce(p_use_their_terms, false) then v_amt
        else counterparty_book_settlement_amount
      end,
      counterparty_ack_creator_revision_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.poker_tournament_swap_resolve_other_revision(uuid, boolean)
  from public;
grant execute on function public.poker_tournament_swap_resolve_other_revision(uuid, boolean)
  to authenticated;

-- Marking settled is now local bookkeeping. It posts only the viewer's signed amount
-- to their own personal bankroll and never changes the other player's books.
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
  v_posted := case
    when v_role = 'creator' then v_row.creator_bankroll_posted
    else v_row.counterparty_bankroll_posted
  end;

  if coalesce(p_paid, true) then
    if v_row.status <> 'settled' and abs(v_amt) >= 0.005 then
      raise exception 'Swap results are not settled yet';
    end if;
    if not v_posted and abs(v_delta) >= 0.005 then
      perform public.poker_stable_credit_player_personal_bankroll(v_uid, v_delta);
      v_posted := true;
    end if;
  else
    if v_posted and abs(v_delta) >= 0.005 then
      perform public.poker_stable_credit_player_personal_bankroll(v_uid, -v_delta);
      v_posted := false;
    end if;
  end if;

  if v_role = 'creator' then
    update public.poker_tournament_swaps
    set
      creator_marked_paid = coalesce(p_paid, true),
      creator_bankroll_posted = v_posted,
      creator_book_settlement_amount = v_amt,
      settlement_bankroll_posted =
        v_posted or coalesce(counterparty_bankroll_posted, false)
    where id = v_row.id
    returning * into v_row;
  else
    update public.poker_tournament_swaps
    set
      counterparty_marked_paid = coalesce(p_paid, true),
      counterparty_bankroll_posted = v_posted,
      counterparty_book_settlement_amount = v_amt,
      settlement_bankroll_posted =
        coalesce(creator_bankroll_posted, false) or v_posted
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_mark_paid(uuid, boolean) is
  'Post or reverse only the caller''s local swap amount in their personal bankroll.';

revoke all on function public.poker_tournament_swap_mark_paid(uuid, boolean) from public;
grant execute on function public.poker_tournament_swap_mark_paid(uuid, boolean)
  to authenticated;

commit;
