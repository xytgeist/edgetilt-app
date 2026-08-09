-- Cut Disk IO from pg_cron history + high-frequency push flush.
-- 1) lounge_activity_push_flush: 10s → every minute (pg_cron seconds syntax is 1–59 only)
-- 2) Daily prune of cron.job_run_details (keep 3 days)
-- 3) One-shot batched delete of older history (safe for burstable compute)
-- Note: no BEGIN/COMMIT … apply-migration-once wraps the file in a transaction.

-- ---------------------------------------------------------------------------
-- Push flush: every minute (still plenty for activity push batches)
-- ---------------------------------------------------------------------------
do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_activity_push_flush'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'lounge_activity_push_flush',
  '* * * * *',
  $$select public.activity_push_flush_due_batches();$$
);

-- ---------------------------------------------------------------------------
-- Prune helper + daily job (keeps last 3 days for “did this cron fail?”)
-- ---------------------------------------------------------------------------
create or replace function public.cron_prune_job_run_details(p_keep interval default interval '3 days')
returns integer
language plpgsql
security definer
set search_path = cron, public, pg_catalog
as $$
declare
  v_deleted int := 0;
  v_n int;
begin
  loop
    delete from cron.job_run_details
    where ctid in (
      select ctid
      from cron.job_run_details
      where start_time < now() - p_keep
      limit 20000
    );
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;
    exit when v_n = 0;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function public.cron_prune_job_run_details(interval) from public;
grant execute on function public.cron_prune_job_run_details(interval) to postgres;

comment on function public.cron_prune_job_run_details(interval) is
  'Delete cron.job_run_details older than p_keep (default 3 days). Batched to limit Disk IO spikes.';

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'cron_prune_job_run_details_daily'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'cron_prune_job_run_details_daily',
  '20 4 * * *',
  $$select public.cron_prune_job_run_details(interval '3 days');$$
);

-- One-shot cleanup now (same batched helper).
select public.cron_prune_job_run_details(interval '3 days');
