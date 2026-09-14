-- MNF public lean moves from 3:30pm PT to 2:00pm PT (PDT = 21:00 UTC).
-- Lock stays nfl_primetime_lock ~90 min pre-kick.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lounge_odds_nfl_mnf_spotlight') then
    perform cron.unschedule('lounge_odds_nfl_mnf_spotlight');
  end if;
  perform cron.schedule(
    'lounge_odds_nfl_mnf_spotlight',
    '0 21 * * 1',
    'select public.invoke_lounge_odds_poll(''nfl_primetime_spotlight'');'
  );
end $$;
