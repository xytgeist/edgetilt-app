-- Staff / admin can read GHA job heartbeats (Syndicate Ops weekly pulls board).
-- Writes stay service_role via admin_ops_record_job_heartbeat.
-- No-op on projects that never got admin_ops_job_heartbeats (some test DBs).

do $$
begin
  if to_regclass('public.admin_ops_job_heartbeats') is null then
    return;
  end if;

  execute 'drop policy if exists "Staff read admin_ops_job_heartbeats" on public.admin_ops_job_heartbeats';
  execute $pol$
    create policy "Staff read admin_ops_job_heartbeats"
      on public.admin_ops_job_heartbeats
      for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'moderator', 'staff')
        )
      )
  $pol$;
end
$$;
