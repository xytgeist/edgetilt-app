-- Bet Tracker CLV v2 (Ryan 2026-10-22: "CLV beat 100%" was 1 graded bet of 27).
-- 1. Totals sign was inverted (Over 44.5 closing 45.5 is a beat: close - line; Under is line - close).
-- 2. Moneylines grade by price: clv_prob = closing implied prob - bet implied prob (pct points, + = beat).
-- 3. Spreads / totals keep point CLV (clv_pts) and also store clv_prob from the closing price on the same side,
--    so a same-number bet at better juice counts as a beat instead of a tie.
-- close_odds = closing price for the bet's side. Re-grades every linked bet on each call, so history corrects.

begin;

alter table public.sports_bets add column if not exists clv_prob numeric;

comment on column public.sports_bets.clv_prob is
  'Price CLV in implied-probability points: closing price implied prob minus the bet price implied prob (x100). Positive = beat. Moneylines grade on this alone; spreads / totals use it to break a same-number tie.';

create or replace function public.american_odds_implied(p_odds integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_odds is null or p_odds = 0 then null
    when p_odds < 0 then (-p_odds)::numeric / ((-p_odds)::numeric + 100)
    else 100::numeric / (p_odds::numeric + 100)
  end;
$$;

create or replace function public.sports_bets_refresh_clv()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  with graded as (
    select
      b.id,
      case
        when b.market = 'spread' and b.side = 'home' then mf.close_spread_home
        when b.market = 'spread' and b.side = 'away' then -mf.close_spread_home
        when b.market = 'total' then mf.close_total
        else null
      end as close_line,
      case
        when b.market = 'spread' and b.side = 'home' then mf.close_spread_home_price
        when b.market = 'spread' and b.side = 'away' then mf.close_spread_away_price
        when b.market = 'total' and b.side = 'over' then mf.close_over_price
        when b.market = 'total' and b.side = 'under' then mf.close_under_price
        when b.market = 'h2h' and b.side = 'home' then mf.close_home_ml
        when b.market = 'h2h' and b.side = 'away' then mf.close_away_ml
        else null
      end as close_odds,
      case
        when b.market = 'spread' and b.line is not null and mf.close_spread_home is not null then
          case
            when b.side = 'home' then b.line - mf.close_spread_home
            when b.side = 'away' then b.line + mf.close_spread_home
            else null
          end
        when b.market = 'total' and b.line is not null and mf.close_total is not null then
          case
            when b.side = 'over' then mf.close_total - b.line
            when b.side = 'under' then b.line - mf.close_total
            else null
          end
        else null
      end as clv_pts
    from public.sports_bets b
    join public.lounge_market_files mf on mf.event_id = b.event_id
    where b.user_id = uid
      and b.event_id is not null
      and mf.close_locked = true
      and b.market in ('spread', 'total', 'h2h')
  )
  update public.sports_bets b
  set
    close_line = g.close_line,
    close_odds = g.close_odds,
    clv_pts = g.clv_pts,
    clv_prob = round((public.american_odds_implied(g.close_odds) - public.american_odds_implied(b.odds)) * 100, 2),
    clv_graded_at = now()
  from graded g
  where b.id = g.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sports_bets_refresh_clv() from public;
grant execute on function public.sports_bets_refresh_clv() to authenticated;

comment on function public.sports_bets_refresh_clv() is
  'Refresh CLV for the signed-in user from locked lounge_market_files closes: point CLV (spreads / totals) + price CLV (all three markets).';

commit;
