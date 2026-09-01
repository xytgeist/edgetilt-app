-- Remove synthetic Sharpe Syndicate backfill rows (NOT live lounge-odds-poll picks).
-- Sources: scripts/backfill-ufc-picks.mjs, scripts/backfill-nfl-preseason-picks.mjs
-- UFC backfill included future fights with pre-baked outcomes; NFL backfill used Math.random() CLV.
delete from public.lounge_bot_picks
where event_id like 'ufc\_%' escape '\'
   or event_id like 'espn-nfl-pre-%'
   or sport_key = '1.5';
