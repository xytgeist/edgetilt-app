-- Pause the X insider poller (Ryan, 2026-10-19): Rotowire covers ~3/4 of the same news ~20 min later, so X only
-- pays off once it feeds starter alerts / pushes. Re-enable with:
--   select cron.schedule('fantasy_insider_poll', '*/2 * * * *', $$select public.invoke_fantasy_insider_poll();$$);
do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_insider_poll'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;
