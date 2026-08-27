-- Keyless pg_cron entrypoint for send-due-offer-reminders.
--
-- Why: test's cron job called the Edge function via an inline net.http_post with a
-- hardcoded bearer token pointing at the PRODUCTION project ref, so test reminders
-- never fired and a prod credential sat in the test DB. This wrapper resolves the
-- project URL + service key from vault at call time, so each environment targets
-- itself and no token is stored in cron.job.
--
-- Mirrors the definition already live on production. Idempotent (create or replace),
-- so applying to production is a no-op beyond normalizing the body.
--
-- Cadence note: the function scans [now - graceLookbackSeconds, now + lookaheadMinutes).
-- With lookaheadMinutes = 1 the caller MUST run every minute; a */5 schedule leaves a
-- dead zone where events firing 1-3 minutes past a tick are never picked up.

create or replace function public.invoke_send_due_offer_reminders()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'cron', 'extensions', 'pg_temp'
as $function$
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
    raise warning 'invoke_send_due_offer_reminders: add vault secret lounge_odds_poll_service_role_key';
    return;
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_send_due_offer_reminders: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  select
    net.http_post(
      url := base_url || '/functions/v1/send-due-offer-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', service_key,
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('lookaheadMinutes', 1),
      timeout_milliseconds := 120000
    )
  into req_id;
exception
  when others then
    raise warning 'invoke_send_due_offer_reminders: %', sqlerrm;
end;
$function$;
