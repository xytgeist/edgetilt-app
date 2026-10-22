-- NBA starter status pushes ride `fantasy-status-watch` (body { sport: 'nba' }) and `pushStarterAlerts`.
-- NBA designations live in their own table: Sleeper NBA and NFL player ids collide, and NFL readers (game hub
-- Fantasy tab, Jordan Pike key absences) look up `nfl_player_status` by sleeper_id.

begin;

create table if not exists public.nba_player_status (
  espn_id text primary key,
  sleeper_id text,
  name text not null default '',
  team text,
  status text not null check (status in ('active', 'questionable', 'doubtful', 'out', 'ir')),
  injury text,
  comment text,
  return_date date,
  reported_at timestamptz,
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nba_player_status_sleeper_idx on public.nba_player_status (sleeper_id) where sleeper_id is not null;

comment on table public.nba_player_status is
  'ESPN NBA injury report, one row per player (same shape as nfl_player_status). Kept by fantasy-status-watch { sport: nba }.';

alter table public.nba_player_status enable row level security;
drop policy if exists "Service all nba_player_status" on public.nba_player_status;
create policy "Service all nba_player_status" on public.nba_player_status
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Authenticated read nba_player_status" on public.nba_player_status;
create policy "Authenticated read nba_player_status" on public.nba_player_status
  for select to authenticated using (true);
grant select on public.nba_player_status to authenticated;
grant all on public.nba_player_status to service_role;

insert into public.fantasy_status_watch_state (id) values ('watch_nba') on conflict (id) do nothing;

-- Dedupe per sport: an NBA and an NFL player with the same Sleeper id in the same week number must not block each other.
alter table public.fantasy_status_alerts add column if not exists sport text not null default 'nfl';
alter table public.fantasy_status_alerts drop constraint if exists fantasy_status_alerts_user_id_sleeper_id_status_week_key;
alter table public.fantasy_status_alerts drop constraint if exists fantasy_status_alerts_user_player_status_week_sport_key;
alter table public.fantasy_status_alerts
  add constraint fantasy_status_alerts_user_player_status_week_sport_key unique (user_id, sleeper_id, status, week, sport);

create or replace function public.invoke_fantasy_status_watch_nba()
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
    raise warning 'invoke_fantasy_status_watch_nba: vault secrets missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');
  select net.http_post(
    url := base_url || '/functions/v1/fantasy-status-watch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{"sport":"nba"}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_status_watch_nba: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_status_watch_nba() from public;
grant execute on function public.invoke_fantasy_status_watch_nba() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_status_watch_nba'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('fantasy_status_watch_nba', '*/5 * * * *', $$select public.invoke_fantasy_status_watch_nba();$$);

commit;
