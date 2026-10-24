-- NBA daily lineup check (Edge `fantasy-lineup-check`): once per US Eastern day, about an hour before the first NBA
-- tip, push users whose daily-lineup NBA leagues have a Start/Sit swap worth making today or an injured starter with
-- no backup. Opt out with notification_preferences.push_fantasy_lineup. One row per user per ET day dedupes sends.

alter table public.notification_preferences
  add column if not exists push_fantasy_lineup boolean not null default true;

create table if not exists public.fantasy_lineup_checks (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  et_date date not null,
  league_ids text[] not null default '{}',
  title text not null default '',
  body text not null default '',
  sent jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, et_date)
);

comment on table public.fantasy_lineup_checks is
  'NBA daily lineup check push log: one row per user per US Eastern date (dedupe key) with what was sent.';

alter table public.fantasy_lineup_checks enable row level security;
drop policy if exists "Service all fantasy_lineup_checks" on public.fantasy_lineup_checks;
create policy "Service all fantasy_lineup_checks" on public.fantasy_lineup_checks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
grant all on public.fantasy_lineup_checks to service_role;
grant usage, select on sequence public.fantasy_lineup_checks_id_seq to service_role;

create or replace function public.invoke_fantasy_lineup_check()
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
    raise warning 'invoke_fantasy_lineup_check: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-lineup-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_lineup_check: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_lineup_check() from public;
grant execute on function public.invoke_fantasy_lineup_check() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'fantasy_lineup_check'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Every 15 minutes; the Edge only acts in the window before the day's first tip and sends once per user per ET day.
select cron.schedule('fantasy_lineup_check', '*/15 * * * *', $$select public.invoke_fantasy_lineup_check();$$);
