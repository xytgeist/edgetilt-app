-- Disable daily market_instruments bulk sync cron.
-- Stock universe already backfilled (~8.8k rows); new/obscure tickers use resolve_symbol on first use.
-- invoke_lounge_market_symbol_sync() remains for optional manual one-shot (e.g. crypto top-N backfill).

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_market_symbol_sync_daily'
  loop
    perform cron.unschedule(jid);
  end loop;
end;
$$;
