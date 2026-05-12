-- Daily pg_cron → pg_net POST to Edge `lounge-cf-stream-purge-pending-uploads` (test project).
--
-- Prereqs (Supabase Dashboard → Database → Extensions): enable **pg_cron** and **pg_net** if not already.
--
-- Prereqs (Vault secrets — same values you use for Edge + HTTP; run in SQL Editor once per project):
--   select vault.create_secret('YOUR_PURGE_SECRET', 'lounge_cf_stream_purge_http_secret');
--   select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'lounge_cf_stream_purge_supabase_anon_key');
-- `YOUR_PURGE_SECRET` must match Edge secret **LOUNGE_CF_STREAM_PURGE_SECRET** (Dashboard → Edge Functions → Secrets).
-- `YOUR_SUPABASE_ANON_KEY` must be the **legacy** JWT **anon** `public` key (starts with `eyJ...`).
-- Project Settings → API → tab **Legacy anon, service_role API keys** → copy **anon** `public`.
-- New **`sb_publishable_...`** keys are NOT JWTs; the Edge gateway returns `UNAUTHORIZED_INVALID_JWT_FORMAT` if used here.
--
-- Cron: **07:15 UTC** daily. Change the 5-arg `cron.schedule` expression if you want another time.
-- Verify: `select * from cron.job where jobname = 'lounge_cf_stream_purge_pending_daily';`
-- Recent runs: `select * from cron.job_run_details order by start_time desc limit 20;`

CREATE OR REPLACE FUNCTION public.invoke_lounge_cf_stream_purge_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, cron, extensions, pg_temp
AS $$
DECLARE
  purge_secret text;
  anon_key text;
  base_url text := 'https://jtjgtucumuoswnbauxry.supabase.co';
  req_id bigint;
BEGIN
  SELECT ds.decrypted_secret
  INTO purge_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lounge_cf_stream_purge_http_secret'
  LIMIT 1;

  SELECT ds.decrypted_secret
  INTO anon_key
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lounge_cf_stream_purge_supabase_anon_key'
  LIMIT 1;

  IF purge_secret IS NULL OR btrim(purge_secret) = '' THEN
    RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: add vault secret lounge_cf_stream_purge_http_secret (same value as Edge LOUNGE_CF_STREAM_PURGE_SECRET)';
    RETURN;
  END IF;

  IF anon_key IS NULL OR btrim(anon_key) = '' THEN
    RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: add vault secret lounge_cf_stream_purge_supabase_anon_key (project anon key)';
    RETURN;
  END IF;

  SELECT
    net.http_post(
      url := base_url || '/functions/v1/lounge-cf-stream-purge-pending-uploads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key,
        'Authorization', 'Bearer ' || anon_key,
        'x-lounge-cf-stream-purge-secret', purge_secret
      ),
      body := '{"maxAgeHours": 24, "dryRun": false}'::jsonb,
      timeout_milliseconds := 120000
    )
  INTO req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_lounge_cf_stream_purge_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_lounge_cf_stream_purge_pending() TO postgres;

DO $$
DECLARE
  jid int;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'lounge_cf_stream_purge_pending_daily'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'lounge_cf_stream_purge_pending_daily',
  '15 7 * * *',
  $cron$SELECT public.invoke_lounge_cf_stream_purge_pending();$cron$
);
