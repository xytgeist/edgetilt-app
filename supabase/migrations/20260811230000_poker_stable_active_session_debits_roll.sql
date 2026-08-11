-- Stake roll should fall as soon as buy-in / re-entries / add-ons are logged,
-- not only when the tournament (or cash) session is completed.

begin;

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
      case
        when s.status = 'active' then
          -- In-progress: costs leave the stake immediately; no cash-out yet.
          -(
            coalesce(s.buy_in, 0)
            + coalesce(s.rebuy_amount, 0)
            + coalesce(s.addon_amount, 0)
          )
        else
          coalesce(s.cash_out, 0)
          - coalesce(s.buy_in, 0)
          - coalesce(s.rebuy_amount, 0)
          - coalesce(s.addon_amount, 0)
          + coalesce(s.bounty_winnings, 0)
      end
    ),
    0
  )
  from public.poker_bankroll_sessions s
  cross join last_settle ls
  where s.deal_id = p_deal_id
    and (
      ls.at is null
      or coalesce(s.end_at, s.start_at, s.created_at) > ls.at
    );
$$;

comment on function public.poker_stable_deal_session_profit(uuid) is
  'Net session impact on stake roll since last settle. Active sessions debit buy-in/re-entry/add-on immediately.';

-- Refresh open deal rolls so in-progress tournament costs appear now.
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
