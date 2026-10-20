-- Fantasy starter status pushes. Edge `fantasy-status-watch` (cron every 5 min, cadence gated in the Edge) keeps each
-- NFL player's ESPN game designation in `nfl_player_status`, and when one moves to Out / Doubtful / IR before his game
-- it pushes the users who start him (deduped in `fantasy_status_alerts`).

create table if not exists public.nfl_player_status (
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

create index if not exists nfl_player_status_sleeper_idx on public.nfl_player_status (sleeper_id) where sleeper_id is not null;

comment on table public.nfl_player_status is
  'ESPN fantasy game designation per NFL player (fresh injury pills + status-change pushes). changed_at moves only when status changes.';

create table if not exists public.fantasy_status_watch_state (
  id text primary key,
  seeded boolean not null default false,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.fantasy_status_watch_state (id) values ('watch') on conflict (id) do nothing;

create table if not exists public.fantasy_status_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sleeper_id text not null,
  status text not null,
  week int not null,
  league_ids uuid[] not null default '{}',
  title text not null default '',
  body text not null default '',
  sent jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, sleeper_id, status, week)
);

comment on table public.fantasy_status_alerts is
  'One row per starter status push (user + player + status + NFL week) … the dedupe key and a delivery log.';

alter table public.nfl_player_status enable row level security;
alter table public.fantasy_status_watch_state enable row level security;
alter table public.fantasy_status_alerts enable row level security;

drop policy if exists "Service all nfl_player_status" on public.nfl_player_status;
create policy "Service all nfl_player_status" on public.nfl_player_status
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Authenticated read nfl_player_status" on public.nfl_player_status;
create policy "Authenticated read nfl_player_status" on public.nfl_player_status
  for select to authenticated using (true);
drop policy if exists "Service all fantasy_status_watch_state" on public.fantasy_status_watch_state;
create policy "Service all fantasy_status_watch_state" on public.fantasy_status_watch_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Service all fantasy_status_alerts" on public.fantasy_status_alerts;
create policy "Service all fantasy_status_alerts" on public.fantasy_status_alerts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Own read fantasy_status_alerts" on public.fantasy_status_alerts;
create policy "Own read fantasy_status_alerts" on public.fantasy_status_alerts
  for select to authenticated using (auth.uid() = user_id);

grant select on public.nfl_player_status to authenticated;
grant select on public.fantasy_status_alerts to authenticated;
grant all on public.nfl_player_status, public.fantasy_status_watch_state, public.fantasy_status_alerts to service_role;

alter table public.notification_preferences
  add column if not exists push_fantasy_status boolean not null default true;

create or replace function public.invoke_fantasy_status_watch()
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
    raise warning 'invoke_fantasy_status_watch: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-status-watch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_status_watch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_status_watch() from public;
grant execute on function public.invoke_fantasy_status_watch() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_status_watch'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('fantasy_status_watch', '*/5 * * * *', $$select public.invoke_fantasy_status_watch();$$);
