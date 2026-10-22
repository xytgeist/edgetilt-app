-- NBA insider news from X (Edge `fantasy-insider-poll` with { sport: 'nba' }): national NBA insiders + Underdog /
-- FantasyLabs, read only 11:00-13:00 and 17:00-23:00 ET with a daily read cap. Sleeper NBA ids collide with NFL ids,
-- so sources, news, and the poll log gain `sport` (existing rows are NFL) and every reader filters on it.
-- Deploy `fantasy-insider-poll` right after this (the old poller has no sport filter on sources).

alter table public.fantasy_insider_sources add column if not exists sport text not null default 'nfl';
alter table public.fantasy_insider_news add column if not exists sport text not null default 'nfl';
alter table public.fantasy_insider_poll_log add column if not exists sport text not null default 'nfl';

create index if not exists fantasy_insider_news_sport_posted_idx
  on public.fantasy_insider_news (sport, posted_at desc);

insert into public.fantasy_insider_state (id) values ('poll_nba') on conflict (id) do nothing;

insert into public.fantasy_insider_sources (handle, display_name, kind, team, active, sport) values
  ('shamscharania', 'Shams Charania', 'national', null, true, 'nba'),
  ('chrisbhaynes', 'Chris Haynes', 'national', null, true, 'nba'),
  ('underdognba', 'Underdog NBA', 'national', null, true, 'nba'),
  ('fantasylabsnba', 'FantasyLabs NBA', 'national', null, true, 'nba'),
  ('thesteinline', 'Marc Stein', 'national', null, true, 'nba'),
  ('jakelfischer', 'Jake Fischer', 'national', null, true, 'nba'),
  ('windhorstespn', 'Brian Windhorst', 'national', null, true, 'nba')
on conflict (handle) do update set display_name = excluded.display_name, kind = excluded.kind, sport = 'nba', active = true;

create or replace function public.invoke_fantasy_insider_poll_nba()
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
    raise warning 'invoke_fantasy_insider_poll_nba: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-insider-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{"sport":"nba"}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_insider_poll_nba: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_insider_poll_nba() from public;
grant execute on function public.invoke_fantasy_insider_poll_nba() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_insider_poll_nba'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule('fantasy_insider_poll_nba', '*/2 * * * *', $$select public.invoke_fantasy_insider_poll_nba();$$);
