-- ActivityKit Live Activity push tokens (watched-game Island / Lock Screen).
-- Separate from apns_device_tokens: these tokens are per activity, topic
-- `{bundleId}.push-type.liveactivity`, and rotate while the Activity is live.

create table if not exists public.live_activity_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  token text not null,
  environment text not null default 'production'
    check (environment in ('sandbox', 'production')),
  bundle_id text not null default 'com.edgetilt.app',
  last_fingerprint text,
  last_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token),
  unique (user_id, game_id)
);

create index if not exists live_activity_push_tokens_game_id_idx
  on public.live_activity_push_tokens (game_id);

create or replace function public.set_live_activity_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_live_activity_push_tokens_updated_at on public.live_activity_push_tokens;
create trigger trg_live_activity_push_tokens_updated_at
before update on public.live_activity_push_tokens
for each row
execute function public.set_live_activity_push_tokens_updated_at();

alter table public.live_activity_push_tokens enable row level security;

drop policy if exists "Users read own live activity tokens" on public.live_activity_push_tokens;
create policy "Users read own live activity tokens"
on public.live_activity_push_tokens
for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own live activity tokens" on public.live_activity_push_tokens;
create policy "Users insert own live activity tokens"
on public.live_activity_push_tokens
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own live activity tokens" on public.live_activity_push_tokens;
create policy "Users update own live activity tokens"
on public.live_activity_push_tokens
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own live activity tokens" on public.live_activity_push_tokens;
create policy "Users delete own live activity tokens"
on public.live_activity_push_tokens
for delete
using (auth.uid() = user_id);

comment on table public.live_activity_push_tokens is
  'ActivityKit push tokens for watched-game Live Activities. APNs topic com.edgetilt.app.push-type.liveactivity.';

-- pg_cron: push Island updates while anyone is watching (service role via Vault).
create or replace function public.invoke_lounge_live_activity_push()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  service_key text;
  base_url text;
  req_id bigint;
  watcher_count int;
begin
  select count(*)::int into watcher_count from public.live_activity_push_tokens;
  if coalesce(watcher_count, 0) = 0 then
    return;
  end if;

  select btrim(ds.decrypted_secret)
  into service_key
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_service_role_key'
  limit 1;

  select btrim(ds.decrypted_secret)
  into base_url
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_project_url'
  limit 1;

  if service_key is null or service_key = '' or base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_live_activity_push: missing vault lounge_odds_poll_* secrets';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  begin
    select
      net.http_post(
        url := base_url || '/functions/v1/lounge-live-activity-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      )
    into req_id;
  exception
    when others then
      raise warning 'invoke_lounge_live_activity_push: %', sqlerrm;
  end;
end;
$$;

comment on function public.invoke_lounge_live_activity_push() is
  'pg_cron helper: POST lounge-live-activity-push when any Live Activity token is registered.';

revoke all on function public.invoke_lounge_live_activity_push() from public;
grant execute on function public.invoke_lounge_live_activity_push() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'live_activity_island_push'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

-- Every minute is the hosted pg_cron floor. Function no-ops when nobody is watching.
select cron.schedule(
  'live_activity_island_push',
  '* * * * *',
  $$select public.invoke_lounge_live_activity_push();$$
);
