-- NBA weekly fantasy digest (Edge `fantasy-weekly-digest` with { sport: 'nba' }): Monday ~9 AM Pacific, the start of
-- a Sleeper NBA week. Same push + email as the NFL Tuesday digest (odds, injuries, waiver add, boom pick, trade idea).
-- `fantasy_weekly_digests` gains `sport` so NFL and NBA weeks dedupe separately (existing rows are NFL).

alter table public.fantasy_weekly_digests add column if not exists sport text not null default 'nfl';

alter table public.fantasy_weekly_digests drop constraint if exists fantasy_weekly_digests_user_id_season_week_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fantasy_weekly_digests_user_season_week_sport_key') then
    alter table public.fantasy_weekly_digests
      add constraint fantasy_weekly_digests_user_season_week_sport_key unique (user_id, season, week, sport);
  end if;
end $$;

comment on table public.fantasy_weekly_digests is
  'One row per weekly fantasy digest (user + season + week + sport) … dedupe key and delivery log (push + email).';

create or replace function public.invoke_fantasy_weekly_digest_nba()
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
    raise warning 'invoke_fantasy_weekly_digest_nba: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-weekly-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{"sport":"nba"}'::jsonb,
    timeout_milliseconds := 300000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_weekly_digest_nba: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_weekly_digest_nba() from public;
grant execute on function public.invoke_fantasy_weekly_digest_nba() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname in ('fantasy_weekly_digest_nba_pdt', 'fantasy_weekly_digest_nba_pst')
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Monday 9 AM Pacific is 16:00 UTC (PDT) or 17:00 UTC (PST); the Edge sends only in the 9 AM Pacific hour.
select cron.schedule('fantasy_weekly_digest_nba_pdt', '0 16 * * 1', $$select public.invoke_fantasy_weekly_digest_nba();$$);
select cron.schedule('fantasy_weekly_digest_nba_pst', '0 17 * * 1', $$select public.invoke_fantasy_weekly_digest_nba();$$);
