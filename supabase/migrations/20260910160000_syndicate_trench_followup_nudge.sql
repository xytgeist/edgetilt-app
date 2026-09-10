-- TEST ONLY (lvslotpro.com / theo mailbox). Do not apply on production.
-- Tuesday 15:00 UTC after 2026-09-29 posts a trench follow-up nag to /theo
-- until syndicate_trench_followup.status = 'done'.
-- One DO block so `npm run db:query:test -f` can apply it.

do $mig$
begin
  if to_regclass('public.theo_channel_messages') is null then
    raise notice 'skip syndicate_trench_followup: theo_channel_messages missing (not test)';
    return;
  end if;

  create table if not exists public.syndicate_trench_followup (
    id text primary key,
    status text not null default 'pending' check (status in ('pending', 'done')),
    due_on date not null default date '2026-09-29',
    updated_at timestamptz not null default now()
  );

  insert into public.syndicate_trench_followup (id, status, due_on)
  values ('nfl', 'pending', date '2026-09-29')
  on conflict (id) do nothing;

  alter table public.syndicate_trench_followup enable row level security;
  revoke all on table public.syndicate_trench_followup from public;
  revoke all on table public.syndicate_trench_followup from anon, authenticated;
  grant all on table public.syndicate_trench_followup to service_role;

  execute $fn$
    create or replace function public.run_trench_followup_nudge()
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_due date;
      v_status text;
      v_body text;
    begin
      if to_regclass('public.theo_channel_messages') is null then
        return;
      end if;

      select status, due_on into v_status, v_due
      from public.syndicate_trench_followup
      where id = 'nfl';

      if v_status is null or v_status = 'done' then
        return;
      end if;
      if current_date < v_due then
        return;
      end if;
      if exists (
        select 1
        from public.theo_channel_messages
        where body like '%TRENCH_FOLLOWUP_NUDGE%'
          and created_at > now() - interval '6 days'
      ) then
        return;
      end if;

      v_body := $msg$TRENCH_FOLLOWUP_NUDGE
NFL trench follow-up is due. Spec: data/syndicate/trench-followup.json

1. Recalibrate TRENCH_Z_TO_POINTS after 3-4 weeks of a 2026 ESPN board. Do not mix vintages. House 0.8 stays points.
2. Then scheme mixer (air_yards share / personnel_offense). Caps pass >= 0.35, run <= 0.60. Not week 1-2.
3. Then sack/hit flag from Tuesday nflverse. Haircut (~x0.6) if process != outcome. Kill fake pressure columns. No PFF.

Kill: set trench-followup.json status=done and syndicate_trench_followup.status='done' on test.
Read: https://lvslotpro.com/theo$msg$;

      insert into public.theo_channel_messages (author, body)
      values ('windows', v_body);

      update public.syndicate_trench_followup
      set updated_at = now()
      where id = 'nfl';
    end;
    $body$;
  $fn$;

  revoke all on function public.run_trench_followup_nudge() from public;
  revoke all on function public.run_trench_followup_nudge() from anon, authenticated;

  comment on function public.run_trench_followup_nudge() is
    'TEST ONLY. Tuesday theo nag for NFL trench scheme + sack/hit follow-up. Not granted to anon.';

  begin
    perform cron.unschedule(j.jobid)
    from cron.job j
    where j.jobname = 'syndicate_trench_followup_nudge';
  exception
    when undefined_table then null;
    when undefined_function then null;
  end;

  perform cron.schedule(
    'syndicate_trench_followup_nudge',
    '0 15 * * 2',
    $cron$select public.run_trench_followup_nudge()$cron$
  );
end;
$mig$;
