-- Manual backing bankroll edits (Edit → Adjust bankroll) for TWR period boundaries.
-- Settle credits and slice allocations are not logged here.

begin;

create table if not exists public.poker_stable_backer_bankroll_adjustments (
  id              uuid           primary key default gen_random_uuid(),
  user_id         uuid           not null references auth.users(id) on delete cascade,
  amount          numeric(12, 2) not null,
  balance_after   numeric(12, 2) not null,
  occurred_at     timestamptz    not null default now(),
  created_at      timestamptz    not null default now()
);

create index if not exists poker_stable_backer_bankroll_adjustments_user_idx
  on public.poker_stable_backer_bankroll_adjustments (user_id, occurred_at desc);

alter table public.poker_stable_backer_bankroll_adjustments enable row level security;

drop policy if exists poker_stable_backer_bankroll_adjustments_select
  on public.poker_stable_backer_bankroll_adjustments;
create policy poker_stable_backer_bankroll_adjustments_select
  on public.poker_stable_backer_bankroll_adjustments for select
  using (auth.uid() = user_id);

create or replace function public.poker_stable_backer_log_manual_adjustment(
  p_user_id uuid,
  p_amount numeric,
  p_balance_after numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.poker_stable_backer_bankroll_adjustments (user_id, amount, balance_after)
  values (
    p_user_id,
    public.poker_stable_round_money(coalesce(p_amount, 0)),
    public.poker_stable_round_money(coalesce(p_balance_after, 0))
  );
end;
$$;

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

  perform public.poker_stable_backer_log_manual_adjustment(v_uid, v_amt, coalesce(v_bal, v_amt));

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

  perform public.poker_stable_backer_log_manual_adjustment(v_uid, -v_amt, coalesce(v_bal, 0));

  return jsonb_build_object(
    'bankroll_balance', coalesce(v_bal, 0),
    'has_profile', true
  );
end;
$$;

create or replace function public.poker_stable_set_backer_bankroll(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_amt numeric;
  v_prev numeric := 0;
  v_delta numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_amt := public.poker_stable_round_money(coalesce(p_amount, 0));
  if v_amt < 0 then
    raise exception 'Enter a non-negative amount.';
  end if;

  select coalesce(b.bankroll_balance, 0) into v_prev
  from public.poker_stable_backer_bankrolls b
  where b.user_id = v_uid;

  v_delta := public.poker_stable_round_money(v_amt - v_prev);

  insert into public.poker_stable_backer_bankrolls (user_id, bankroll_balance)
  values (v_uid, v_amt)
  on conflict (user_id) do update
    set bankroll_balance = excluded.bankroll_balance;

  if v_delta <> 0 then
    perform public.poker_stable_backer_log_manual_adjustment(v_uid, v_delta, v_amt);
  end if;

  return jsonb_build_object('bankroll_balance', v_amt);
end;
$$;

revoke all on function public.poker_stable_backer_log_manual_adjustment(uuid, numeric, numeric) from public;

grant execute on function public.poker_stable_backer_deposit(numeric) to authenticated;
grant execute on function public.poker_stable_backer_withdraw(numeric) to authenticated;
grant execute on function public.poker_stable_set_backer_bankroll(numeric) to authenticated;

commit;
