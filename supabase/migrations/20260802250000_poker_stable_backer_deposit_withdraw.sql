-- Backer manual deposit / withdraw (adjust bankroll_balance only; no stake metrics impact).

begin;

create or replace function public.poker_stable_backer_deposit(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_bal numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive deposit amount.';
  end if;

  perform public.poker_stable_backer_adjust_balance(v_uid, v_amt);

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  return jsonb_build_object(
    'bankroll_balance', coalesce(v_bal, v_amt),
    'has_profile', true
  );
end;
$$;

create or replace function public.poker_stable_backer_withdraw(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_bal numeric;
  v_row public.poker_stable_backer_bankrolls%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt <= 0 then
    raise exception 'Enter a positive withdrawal amount.';
  end if;

  select * into v_row from public.poker_stable_backer_bankrolls where user_id = v_uid;
  if v_row.user_id is null or v_row.bankroll_balance < v_amt then
    raise exception 'Insufficient backing bankroll for that withdrawal.';
  end if;

  perform public.poker_stable_backer_adjust_balance(v_uid, -v_amt);

  select b.bankroll_balance into v_bal
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  return jsonb_build_object(
    'bankroll_balance', coalesce(v_bal, 0),
    'has_profile', true
  );
end;
$$;

revoke all on function public.poker_stable_backer_deposit(numeric) from public;
revoke all on function public.poker_stable_backer_withdraw(numeric) from public;

grant execute on function public.poker_stable_backer_deposit(numeric) to authenticated;
grant execute on function public.poker_stable_backer_withdraw(numeric) to authenticated;

commit;
