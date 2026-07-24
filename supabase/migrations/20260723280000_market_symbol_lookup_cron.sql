-- Daily pg_cron → lounge-market-symbol-sync (bulk market_instruments sync).
-- Reuses Vault secrets from lounge odds cron:
--   lounge_odds_poll_project_url
--   lounge_odds_poll_service_role_key
--
-- Manual smoke (after Edge deploy):
--   select public.invoke_lounge_market_symbol_sync();

create or replace function public.invoke_lounge_market_symbol_sync()
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

  if service_key is null or service_key = '' then
    raise warning 'invoke_lounge_market_symbol_sync: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_market_symbol_sync: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  select
    net.http_post(
      url := base_url || '/functions/v1/lounge-market-symbol-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', service_key,
        'Authorization', 'Bearer ' || service_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    )
  into req_id;
exception
  when others then
    raise warning 'invoke_lounge_market_symbol_sync: %', sqlerrm;
end;
$$;

comment on function public.invoke_lounge_market_symbol_sync() is
  'pg_cron helper: POST lounge-market-symbol-sync (service_role). Vault: lounge_odds_poll_project_url, lounge_odds_poll_service_role_key.';

revoke all on function public.invoke_lounge_market_symbol_sync() from public;
grant execute on function public.invoke_lounge_market_symbol_sync() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_market_symbol_sync_daily'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'lounge_market_symbol_sync_daily',
    '0 9 * * *',
    $cron$select public.invoke_lounge_market_symbol_sync();$cron$
  );
end;
$$;
