-- Deal roll profile: respect periodic settle resets when recomputing from sessions.
-- Fixes session trigger (20260804230000) setting roll = baseline + ALL session P/L.

begin;

create or replace function public.poker_stable_latest_settlement_at(p_deal_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(st.created_at)
  from public.poker_stable_deal_settlements st
  where st.deal_id = p_deal_id;
$$;

create or replace function public.poker_stable_deal_session_profit(p_deal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with last_settle as (
    select public.poker_stable_latest_settlement_at(p_deal_id) as at
  )
  select coalesce(
    sum(
      coalesce(s.cash_out, 0)
      - coalesce(s.buy_in, 0)
      - coalesce(s.rebuy_amount, 0)
      - coalesce(s.addon_amount, 0)
      + coalesce(s.bounty_winnings, 0)
    ),
    0
  )
  from public.poker_bankroll_sessions s
  cross join last_settle ls
  where s.deal_id = p_deal_id
    and s.status is distinct from 'active'
    and (
      ls.at is null
      or coalesce(s.end_at, s.start_at, s.created_at) > ls.at
    );
$$;

create or replace function public.poker_stable_ensure_deal_bankroll_profile(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.poker_stable_deals%rowtype;
  v_base numeric;
  v_overall numeric;
begin
  if p_deal_id is null then
    return;
  end if;

  select * into v_deal
  from public.poker_stable_deals d
  where d.id = p_deal_id;

  if v_deal.id is null then
    return;
  end if;

  if v_deal.status not in ('pending', 'active') then
    return;
  end if;

  v_base := public.poker_stable_round_money(
    coalesce(v_deal.baseline_bankroll, v_deal.starting_roll, 0)
  );
  v_overall := public.poker_stable_round_money(
    v_base + public.poker_stable_deal_session_profit(p_deal_id)
  );

  insert into public.poker_deal_bankroll_profiles (deal_id, overall_bankroll)
  values (p_deal_id, v_overall)
  on conflict (deal_id) do update
    set overall_bankroll = excluded.overall_bankroll;
end;
$$;

-- Recompute open deal rolls (e.g. BACKER -> PLAYER after periodic settles).
do $$
declare
  v_deal_id uuid;
begin
  for v_deal_id in
    select d.id
    from public.poker_stable_deals d
    where d.status in ('pending', 'active')
  loop
    perform public.poker_stable_ensure_deal_bankroll_profile(v_deal_id);
  end loop;
end $$;

commit;
