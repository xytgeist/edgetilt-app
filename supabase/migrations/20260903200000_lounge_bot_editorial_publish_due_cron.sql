-- Drain editorial Scheduled inbox (lounge_bot_queue) via lounge-bot-publish-due.
-- Odds stagger already uses invoke_lounge_bot_publish_scheduled → publishScheduledOdds.
-- Editorial schedule had no cron ... Fat Cat / X rows sat forever until Publish due / Publish now.
-- Vault: reuses lounge_odds_poll_project_url + lounge_odds_poll_service_role_key.

create or replace function public.invoke_lounge_bot_publish_due_editorial()
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
    raise warning 'invoke_lounge_bot_publish_due_editorial: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_bot_publish_due_editorial: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  begin
    select
      net.http_post(
        url := base_url || '/functions/v1/lounge-bot-publish-due',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object('publishDue', true),
        timeout_milliseconds := 120000
      )
    into req_id;
  exception
    when others then
      raise warning 'invoke_lounge_bot_publish_due_editorial: %', sqlerrm;
  end;
exception
  when others then
    raise warning 'invoke_lounge_bot_publish_due_editorial: %', sqlerrm;
end;
$$;

comment on function public.invoke_lounge_bot_publish_due_editorial() is
  'pg_cron helper: drain due lounge_bot_queue scheduled rows via lounge-bot-publish-due (publishDue).';

revoke all on function public.invoke_lounge_bot_publish_due_editorial() from public;
grant execute on function public.invoke_lounge_bot_publish_due_editorial() to postgres;

do $$
declare
  jid int;
begin
  for jid in select jobid from cron.job where jobname = 'lounge_bot_publish_due_editorial'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'lounge_bot_publish_due_editorial',
  '*/5 * * * *',
  $$select public.invoke_lounge_bot_publish_due_editorial();$$
);
