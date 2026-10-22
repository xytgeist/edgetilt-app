-- Strip synthetic CLV from bot picks (Ryan 2026-10-22). UFC picks + the NFL / UFC backfill scripts wrote a random
-- clv_beat (~70-76%) with no closing-line data behind it. Real CLV always carries clv_pts or clv_prob; keep those.
update public.lounge_bot_picks
set metadata = metadata - 'clv_beat'
where metadata ? 'clv_beat'
  and jsonb_typeof(metadata->'clv_pts') is distinct from 'number'
  and jsonb_typeof(metadata->'clv_prob') is distinct from 'number';
