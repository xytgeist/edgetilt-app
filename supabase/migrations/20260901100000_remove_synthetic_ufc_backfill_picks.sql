-- Remove only backfill rows that were graded before the fight actually settled.
-- Keeps audited backtest picks for completed games; drops future cards with pre-baked outcomes.
delete from public.lounge_bot_picks
where commence_time > (now() - interval '90 minutes')
  and status in ('win', 'won', 'loss', 'lost', 'push')
  and (
    event_id like 'ufc\_%' escape '\'
    or event_id like 'espn-nfl-pre-%'
    or metadata->>'source' in ('backfill_ufc', 'backfill_nfl_preseason')
  );
