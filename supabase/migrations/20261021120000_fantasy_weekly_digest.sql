-- Weekly fantasy digest (Edge `fantasy-weekly-digest`): Tuesday ~5 PM Pacific, each user with NFL leagues gets a push
-- and an email with every league's outlook (playoff / title odds, injuries, top waiver add, sniper pick, trade idea).
-- `fantasy_weekly_digests` is the once-per-user-per-week dedupe key and delivery log.

alter table public.notification_preferences
  add column if not exists push_fantasy_digest boolean not null default true,
  add column if not exists email_fantasy_digest boolean not null default true;

create table if not exists public.fantasy_weekly_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  season int not null,
  week int not null,
  league_ids uuid[] not null default '{}',
  title text not null default '',
  body text not null default '',
  sent jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, season, week)
);

comment on table public.fantasy_weekly_digests is
  'One row per weekly fantasy digest (user + season + NFL week) … dedupe key and delivery log (push + email).';

alter table public.fantasy_weekly_digests enable row level security;
drop policy if exists "Service all fantasy_weekly_digests" on public.fantasy_weekly_digests;
create policy "Service all fantasy_weekly_digests" on public.fantasy_weekly_digests
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Own read fantasy_weekly_digests" on public.fantasy_weekly_digests;
create policy "Own read fantasy_weekly_digests" on public.fantasy_weekly_digests
  for select to authenticated using (auth.uid() = user_id);
grant select on public.fantasy_weekly_digests to authenticated;
grant all on public.fantasy_weekly_digests to service_role;

create or replace function public.invoke_fantasy_weekly_digest()
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
    raise warning 'invoke_fantasy_weekly_digest: vault secrets lounge_odds_poll_service_role_key / lounge_odds_poll_project_url missing';
    return;
  end if;
  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;
  base_url := rtrim(btrim(base_url), '/');

  select net.http_post(
    url := base_url || '/functions/v1/fantasy-weekly-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', service_key, 'Authorization', 'Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into req_id;
exception
  when others then
    raise warning 'invoke_fantasy_weekly_digest: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_fantasy_weekly_digest() from public;
grant execute on function public.invoke_fantasy_weekly_digest() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname in ('fantasy_weekly_digest_pdt', 'fantasy_weekly_digest_pst')
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Tuesday 5 PM Pacific is Wednesday 00:00 UTC (PDT) or 01:00 UTC (PST); the Edge sends only in the 5 PM Pacific hour.
select cron.schedule('fantasy_weekly_digest_pdt', '0 0 * * 3', $$select public.invoke_fantasy_weekly_digest();$$);
select cron.schedule('fantasy_weekly_digest_pst', '0 1 * * 3', $$select public.invoke_fantasy_weekly_digest();$$);
