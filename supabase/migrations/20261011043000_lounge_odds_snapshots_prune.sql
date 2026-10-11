-- Disk IO relief: lounge_odds_snapshots grew unbounded (jsonb poll archive).
-- Keep 3 days (same window as cron.job_run_details / net._http_response).
-- Also VACUUM net._http_response daily so prune deletes do not leave 400MB+ bloat.

create or replace function public.cron_prune_lounge_odds_snapshots(p_keep interval default interval '3 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted int := 0;
  v_n int;
begin
  loop
    delete from public.lounge_odds_snapshots
    where ctid in (
      select ctid
      from public.lounge_odds_snapshots
      where fetched_at < now() - p_keep
      limit 5000
    );
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;
    exit when v_n = 0;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function public.cron_prune_lounge_odds_snapshots(interval) from public;
grant execute on function public.cron_prune_lounge_odds_snapshots(interval) to postgres;

comment on function public.cron_prune_lounge_odds_snapshots(interval) is
  'Delete lounge_odds_snapshots older than p_keep (default 3 days). Batched to limit Disk IO spikes.';

do $$
declare
  jid int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed … skip prune reschedule';
    return;
  end if;

  for jid in select jobid from cron.job where jobname = 'cron_prune_job_run_details_daily'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'cron_prune_job_run_details_daily',
    '20 4 * * *',
    $cron$select public.cron_prune_job_run_details(interval '3 days'), public.cron_prune_pg_net_http_response(interval '3 days'), public.cron_prune_lounge_odds_snapshots(interval '3 days');$cron$
  );

  for jid in select jobid from cron.job where jobname = 'vacuum_net_http_response_daily'
  loop
    perform cron.unschedule(jid);
  end loop;

  -- After prune deletes: reclaim dead pages so Disk IO budget does not refill with bloat.
  perform cron.schedule(
    'vacuum_net_http_response_daily',
    '35 4 * * *',
    $cron$vacuum (analyze) net._http_response;$cron$
  );
end $$;
