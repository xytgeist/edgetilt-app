-- Bot pick CLV v2 backfill (Syndicate / Signal ledgers). Code fix: `computePickClvPts` totals sign +
-- `computePickClvProb` moneyline price CLV, new writes carry metadata.clv_v = 2.
-- 1. Totals picks graded before v2 stored clv_pts with the sign inverted (Over = line - close). Flip once.
-- 2. Settled moneyline picks with a locked closing ML get clv_prob (closing implied prob - pick implied prob, x100)
--    and a real clv_beat (+/- 0.25 pt = even).
-- Rows already at clv_v = 2 are skipped, so a re-run or a pick graded by the new code is never flipped back.

begin;

update public.lounge_bot_picks
set metadata = metadata || jsonb_build_object(
  'clv_pts', -((metadata->>'clv_pts')::numeric),
  'clv_beat', case
    when (metadata->>'clv_pts')::numeric < 0 then to_jsonb(true)
    when (metadata->>'clv_pts')::numeric > 0 then to_jsonb(false)
    else 'null'::jsonb
  end,
  'clv_v', 2
)
where market_key = 'totals'
  and jsonb_typeof(metadata->'clv_pts') = 'number'
  and coalesce(metadata->>'clv_v', '') <> '2';

with priced as (
  select
    p.id,
    case
      when lower(btrim(p.pick_name)) = lower(btrim(p.home_team))
        or position(lower(btrim(p.home_team)) in lower(btrim(p.pick_name))) > 0
        or position(lower(btrim(p.pick_name)) in lower(btrim(p.home_team))) > 0
        or reverse(split_part(reverse(lower(btrim(p.pick_name))), ' ', 1)) = reverse(split_part(reverse(lower(btrim(p.home_team))), ' ', 1))
        then mf.close_home_ml
      when lower(btrim(p.pick_name)) = lower(btrim(p.away_team))
        or position(lower(btrim(p.away_team)) in lower(btrim(p.pick_name))) > 0
        or position(lower(btrim(p.pick_name)) in lower(btrim(p.away_team))) > 0
        or reverse(split_part(reverse(lower(btrim(p.pick_name))), ' ', 1)) = reverse(split_part(reverse(lower(btrim(p.away_team))), ' ', 1))
        then mf.close_away_ml
    end as close_ml,
    p.pick_price,
    mf.close_home_ml,
    mf.close_away_ml
  from public.lounge_bot_picks p
  join public.lounge_market_files mf on mf.event_id = p.event_id
  where p.market_key = 'h2h'
    and p.status in ('won', 'lost', 'push')
    and mf.close_locked = true
    and p.pick_price is not null and p.pick_price <> 0
    and coalesce(p.metadata->>'clv_v', '') <> '2'
),
graded as (
  select
    id,
    close_home_ml,
    close_away_ml,
    round((
      (case when close_ml < 0 then (-close_ml)::numeric / ((-close_ml) + 100) else 100::numeric / (close_ml + 100) end)
      - (case when pick_price < 0 then (-pick_price)::numeric / ((-pick_price) + 100) else 100::numeric / (pick_price + 100) end)
    ) * 100, 2) as clv_prob
  from priced
  where close_ml is not null and close_ml <> 0
)
update public.lounge_bot_picks p
set metadata = p.metadata || jsonb_build_object(
  'clv_prob', g.clv_prob,
  'clv_beat', case when g.clv_prob >= 0.25 then to_jsonb(true) when g.clv_prob <= -0.25 then to_jsonb(false) else 'null'::jsonb end,
  'close_home_ml', g.close_home_ml,
  'close_away_ml', g.close_away_ml,
  'close_locked', true,
  'clv_v', 2
)
from graded g
where p.id = g.id;

commit;
