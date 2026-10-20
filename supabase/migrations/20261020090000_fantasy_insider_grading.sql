-- Self-grading for insider statuses. Edge `fantasy-insider-grade` (daily) checks each Out / Doubtful / IR status an
-- insider set against what happened: did the player play his next game (Sleeper weekly stats), or did ESPN designate
-- him the same way. A source whose push accuracy drops below the bar loses push trust automatically (news still
-- shows); it never regains trust on its own. Tuesdays it emails a scorecard and runs the regression set.

alter table public.fantasy_insider_news
  add column if not exists grade text check (grade in ('confirmed', 'contradicted', 'unconfirmed')),
  add column if not exists graded_at timestamptz,
  add column if not exists grade_note text,
  add column if not exists espn_lead_min int;

alter table public.fantasy_insider_sources
  add column if not exists push_trusted boolean not null default true,
  add column if not exists demoted_at timestamptz,
  add column if not exists demote_reason text;

comment on column public.fantasy_insider_sources.push_trusted is
  'False = this source can no longer trigger starter pushes (set by fantasy-insider-grade when accuracy drops). Re-enable by hand after review.';

create table if not exists public.fantasy_insider_poll_log (
  id bigserial primary key,
  polled_at timestamptz not null default now(),
  fetched int not null default 0,
  matched int not null default 0,
  by_handle jsonb not null default '{}'::jsonb
);

create index if not exists fantasy_insider_poll_log_at_idx on public.fantasy_insider_poll_log (polled_at desc);

comment on table public.fantasy_insider_poll_log is
  'One row per X poll: posts read in total and per handle (X bills ~$0.005 per post read). Feeds the weekly scorecard.';

create table if not exists public.fantasy_insider_regression (
  id bigserial primary key,
  handle text not null,
  text text not null,
  expected_next text not null check (expected_next in ('out', 'doubtful', 'ir', 'questionable', 'cleared', 'none')),
  expected_player text,
  origin text not null default 'seed',
  note text,
  added_at timestamptz not null default now(),
  unique (handle, text)
);

comment on table public.fantasy_insider_regression is
  'Known-answer insider posts. Any prompt or rule change must keep these passing; contradicted statuses are added here by the grader.';

alter table public.fantasy_insider_poll_log enable row level security;
alter table public.fantasy_insider_regression enable row level security;

drop policy if exists "Service all fantasy_insider_poll_log" on public.fantasy_insider_poll_log;
create policy "Service all fantasy_insider_poll_log" on public.fantasy_insider_poll_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Service all fantasy_insider_regression" on public.fantasy_insider_regression;
create policy "Service all fantasy_insider_regression" on public.fantasy_insider_regression
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

grant all on public.fantasy_insider_poll_log, public.fantasy_insider_regression to service_role;
grant usage, select on sequence public.fantasy_insider_poll_log_id_seq, public.fantasy_insider_regression_id_seq to service_role;

create or replace function public.invoke_fantasy_insider_grade()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  service_key text;
  base_url text;
  req_id bigint;
begin
  select btrim(ds.decrypted_secret) into service_key
  from vault.decrypted_secrets as ds where ds.name = 'lounge_odds_poll_service_role_key' limit 1;
  select btrim(ds.decrypted_secret) into base_url
  from vault.decrypted_secrets as ds where ds.name = 'lounge_odds_poll_project_url' limit 1;

  if service_key is null or service_key = '' or base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_fantasy_insider_grade: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-insider-grade',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_insider_grade: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_insider_grade() from public;
grant execute on function public.invoke_fantasy_insider_grade() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_insider_grade'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Daily 13:00 UTC (9 AM ET). Tuesday runs also send the scorecard + regression results.
select cron.schedule('fantasy_insider_grade', '0 13 * * *', $$select public.invoke_fantasy_insider_grade();$$);
