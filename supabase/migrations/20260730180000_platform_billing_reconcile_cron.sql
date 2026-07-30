-- Hourly pg_cron → platform-billing-reconcile-stripe (Stripe Starter/Pro → user_subscriptions).
-- Repairs stale incomplete rows + syncs active Stripe subs when webhooks race or miss.
-- Reuses Vault secrets: lounge_odds_poll_project_url, lounge_odds_poll_service_role_key
--
-- Manual smoke (after Edge deploy):
--   select public.invoke_platform_billing_reconcile_stripe();
-- Dry run: POST .../platform-billing-reconcile-stripe?dryRun=1

create or replace function public.invoke_platform_billing_reconcile_stripe()
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
    raise warning 'invoke_platform_billing_reconcile_stripe: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_platform_billing_reconcile_stripe: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  select
    net.http_post(
      url := base_url || '/functions/v1/platform-billing-reconcile-stripe',
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
    raise warning 'invoke_platform_billing_reconcile_stripe: %', sqlerrm;
end;
$$;

comment on function public.invoke_platform_billing_reconcile_stripe() is
  'pg_cron helper: POST platform-billing-reconcile-stripe (service_role). Vault: lounge_odds_poll_project_url, lounge_odds_poll_service_role_key.';

revoke all on function public.invoke_platform_billing_reconcile_stripe() from public;
grant execute on function public.invoke_platform_billing_reconcile_stripe() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'platform_billing_reconcile_hourly'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'platform_billing_reconcile_hourly',
    '15 * * * *',
    $cron$select public.invoke_platform_billing_reconcile_stripe();$cron$
  );
end;
$$;
