-- Swap % is of prize, not prize minus the first buy-in.
-- Extra-bullet face math is unchanged. Apply on TEST first.

create or replace function public.poker_tournament_swap_try_settle(p_swap_id uuid)
returns public.poker_tournament_swaps
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.poker_tournament_swaps;
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
  creator_net numeric;
  counterparty_net numeric;
  creator_owes numeric;
  counterparty_owes numeric;
  amount numeric;
begin
  select * into s from public.poker_tournament_swaps where id = p_swap_id for update;
  if not found then
    raise exception 'swap not found';
  end if;
  if s.status = 'cancelled' then
    return s;
  end if;
  if not s.creator_result_ready or not s.counterparty_result_ready then
    return s;
  end if;

  v_creator_cashed := coalesce(s.creator_cashed, coalesce(s.creator_prize, 0) > 0);
  v_cp_cashed := coalesce(s.counterparty_cashed, coalesce(s.counterparty_prize, 0) > 0);

  if s.both_must_cash and (not v_creator_cashed or not v_cp_cashed) then
    update public.poker_tournament_swaps
    set
      status = 'settled',
      settlement_amount = 0,
      settled_at = coalesce(settled_at, now()),
      updated_at = now()
    where id = p_swap_id
    returning * into s;
    return s;
  end if;

  if s.final_table_only then
    v_ft_size_c := case when s.creator_table_size = '6max' then 6 else 9 end;
    v_ft_size_p := case when s.counterparty_table_size = '6max' then 6 else 9 end;
    v_creator_ft := s.creator_finish_place is not null
      and s.creator_finish_place >= 1
      and s.creator_finish_place <= v_ft_size_c;
    v_cp_ft := s.counterparty_finish_place is not null
      and s.counterparty_finish_place >= 1
      and s.counterparty_finish_place <= v_ft_size_p;
    if not v_creator_ft and not v_cp_ft then
      if s.creator_finish_place is null or s.counterparty_finish_place is null then
        return s;
      end if;
      update public.poker_tournament_swaps
      set
        status = 'settled',
        settlement_amount = 0,
        settled_at = coalesce(settled_at, now()),
        updated_at = now()
      where id = p_swap_id
      returning * into s;
      return s;
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

  if s.final_bullet_only then
    v_bullets_c := 1;
    v_bullets_p := 1;
  else
    v_bullets_c := coalesce(
      s.creator_bullets,
      case
        when v_face > 0 and coalesce(s.creator_buy_in, 0) > 0
          then greatest(1, round(s.creator_buy_in / v_face))
        else 1
      end
    );
    v_bullets_p := coalesce(
      s.counterparty_bullets,
      case
        when v_face > 0 and coalesce(s.counterparty_buy_in, 0) > 0
          then greatest(1, round(s.counterparty_buy_in / v_face))
        else 1
      end
    );
  end if;

  v_extra_c := greatest(0, v_bullets_c - v_bullets_p);
  v_extra_p := greatest(0, v_bullets_p - v_bullets_c);
  v_face_c := v_extra_c * v_face * (s.pct_creator_gives / 100.0);
  v_face_p := v_extra_p * v_face * (s.pct_counterparty_gives / 100.0);
  v_creator_pays_face := case when not v_cp_cashed then v_face_p else 0 end;
  v_cp_pays_face := case when not v_creator_cashed then v_face_c else 0 end;

  if v_creator_cashed then
    creator_net := coalesce(s.creator_prize, 0) - v_face_c - v_creator_pays_face;
    creator_owes := greatest(0, creator_net) * (s.pct_creator_gives / 100.0) + v_creator_pays_face;
  else
    creator_net := 0;
    creator_owes := v_creator_pays_face;
  end if;

  if v_cp_cashed then
    counterparty_net := coalesce(s.counterparty_prize, 0) - v_face_p - v_cp_pays_face;
    counterparty_owes := greatest(0, counterparty_net) * (s.pct_counterparty_gives / 100.0) + v_cp_pays_face;
  else
    counterparty_net := 0;
    counterparty_owes := v_cp_pays_face;
  end if;

  amount := round((counterparty_owes - creator_owes)::numeric, 2);

  update public.poker_tournament_swaps
  set
    status = 'settled',
    settlement_amount = amount,
    settled_at = coalesce(settled_at, now()),
    updated_at = now()
  where id = p_swap_id
  returning * into s;

  return s;
end;
$$;
