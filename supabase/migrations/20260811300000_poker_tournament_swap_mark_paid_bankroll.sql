-- Mark settled must post settlement_amount to personal poker bankrolls.
-- UI already said it did; the client only flipped *_marked_paid flags.

begin;

alter table public.poker_tournament_swaps
  add column if not exists settlement_bankroll_posted boolean not null default false;

comment on column public.poker_tournament_swaps.settlement_bankroll_posted is
  'True after Mark settled posted settlement_amount to both parties personal bankrolls (idempotent).';

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

    update public.poker_tournament_swaps
    set
      creator_marked_paid = case
        when v_uid = creator_user_id then false
        else creator_marked_paid
      end,
      counterparty_marked_paid = case
        when v_uid = counterparty_user_id then false
        else counterparty_marked_paid
      end,
      settlement_bankroll_posted = v_was_posted
    where id = v_row.id
    returning * into v_row;

    -- If either side still shows paid, keep mutual paid UX when bankroll still posted.
    if v_row.creator_marked_paid or v_row.counterparty_marked_paid then
      null;
    end if;
  end if;

  return v_row;
end;
$$;

comment on function public.poker_tournament_swap_mark_paid(uuid, boolean) is
  'Mark swap cash settled and post settlement_amount to personal bankrolls (idempotent).';

revoke all on function public.poker_tournament_swap_mark_paid(uuid, boolean) from public;
grant execute on function public.poker_tournament_swap_mark_paid(uuid, boolean) to authenticated;

-- Backfill only recent Mark-settled swaps (avoid rewriting ancient test history).
do $$
declare
  r public.poker_tournament_swaps%rowtype;
  v_amt numeric;
begin
  for r in
    select s.*
    from public.poker_tournament_swaps s
    where s.status = 'settled'
      and coalesce(s.settlement_bankroll_posted, false) = false
      and (s.creator_marked_paid or s.counterparty_marked_paid)
      and abs(coalesce(s.settlement_amount, 0)) >= 0.005
      and s.updated_at >= timestamptz '2026-08-11 00:00:00+00'
    for update of s
  loop
    v_amt := public.poker_stable_round_money(coalesce(r.settlement_amount, 0));
    if r.creator_user_id is not null then
      perform public.poker_stable_credit_player_personal_bankroll(r.creator_user_id, v_amt);
    end if;
    if r.counterparty_user_id is not null then
      perform public.poker_stable_credit_player_personal_bankroll(r.counterparty_user_id, -v_amt);
    end if;
    update public.poker_tournament_swaps
    set
      creator_marked_paid = true,
      counterparty_marked_paid = true,
      settlement_bankroll_posted = true
    where id = r.id;
  end loop;
end;
$$;

commit;
