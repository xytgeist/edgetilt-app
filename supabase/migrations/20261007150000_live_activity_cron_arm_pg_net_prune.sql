-- 1) Island APNs cron only while live_activity_push_tokens has rows.
--    Always-on * * * * * was 1440 cron.job_run_details writes/day with zero watchers.
-- 2) Daily prune net._http_response (keep 3 days), same pattern as cron.job_run_details.

-- ---------------------------------------------------------------------------
-- Arm / disarm live_activity_island_push
-- ---------------------------------------------------------------------------
create or replace function public.sync_live_activity_island_cron()
returns trigger
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  n int;
  jid int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return null;
  end if;

  select count(*)::int into n from public.live_activity_push_tokens;

  if coalesce(n, 0) > 0 then
    if not exists (
      select 1 from cron.job
      where jobname = 'live_activity_island_push' and coalesce(active, false)
    ) then
      for jid in select jobid from cron.job where jobname = 'live_activity_island_push'
      loop
        perform cron.unschedule(jid);
      end loop;
      perform cron.schedule(
        'live_activity_island_push',
        '* * * * *',
        $cron$select public.invoke_lounge_live_activity_push();$cron$
      );
    end if;
  else
    for jid in select jobid from cron.job where jobname = 'live_activity_island_push'
    loop
      perform cron.unschedule(jid);
    end loop;
  end if;
  return null;
exception
  when others then
    raise warning 'sync_live_activity_island_cron: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.sync_live_activity_island_cron() from public;
grant execute on function public.sync_live_activity_island_cron() to postgres;

comment on function public.sync_live_activity_island_cron() is
  'Statement trigger: schedule live_activity_island_push every minute only while any Live Activity token exists.';

drop trigger if exists trg_live_activity_island_cron on public.live_activity_push_tokens;
create trigger trg_live_activity_island_cron
after insert or delete on public.live_activity_push_tokens
for each statement
execute function public.sync_live_activity_island_cron();

do $$
declare
  jid int;
  n int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed … skip island cron arm/disarm';
    return;
  end if;
  select count(*)::int into n from public.live_activity_push_tokens;
  if coalesce(n, 0) = 0 then
    for jid in select jobid from cron.job where jobname = 'live_activity_island_push'
    loop
      perform cron.unschedule(jid);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Prune pg_net response log (WAL + seq scans on leftover bodies)
-- ---------------------------------------------------------------------------
create or replace function public.cron_prune_pg_net_http_response(p_keep interval default interval '3 days')
returns integer
language plpgsql
security definer
set search_path = net, public, pg_catalog
as $$
declare
  v_deleted int := 0;
  v_n int;
begin
  loop
    delete from net._http_response
    where ctid in (
      select ctid
      from net._http_response
      where created < now() - p_keep
      limit 20000
    );
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;
    exit when v_n = 0;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function public.cron_prune_pg_net_http_response(interval) from public;
grant execute on function public.cron_prune_pg_net_http_response(interval) to postgres;

comment on function public.cron_prune_pg_net_http_response(interval) is
  'Delete net._http_response older than p_keep (default 3 days). Batched to limit Disk IO spikes.';

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
    $cron$select public.cron_prune_job_run_details(interval '3 days'), public.cron_prune_pg_net_http_response(interval '3 days');$cron$
  );
end $$;
