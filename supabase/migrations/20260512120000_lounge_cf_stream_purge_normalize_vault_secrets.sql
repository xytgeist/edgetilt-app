-- Fix UNAUTHORIZED_INVALID_JWT_FORMAT: never send sb_publishable_/sb_secret_ in Authorization Bearer (not a JWT).
-- For sb_* keys use only the apikey header. Edge Function must deploy with verify_jwt = false (see supabase/config.toml).
-- Legacy anon/service_role JWT (eyJ…) may still use apikey + Bearer. Apply after 20260509180000_*.sql.

CREATE OR REPLACE FUNCTION public.invoke_lounge_cf_stream_purge_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, cron, extensions, pg_temp
AS $$
DECLARE
  purge_secret text;
  api_key text;
  base_url text := 'https://jtjgtucumuoswnbauxry.supabase.co';
  req_id bigint;
  headers jsonb;
BEGIN
  SELECT btrim(ds.decrypted_secret)
  INTO purge_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lounge_cf_stream_purge_http_secret'
  LIMIT 1;

  SELECT btrim(ds.decrypted_secret)
  INTO api_key
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lounge_cf_stream_purge_supabase_anon_key'
  LIMIT 1;

  IF purge_secret IS NULL OR purge_secret = '' THEN
    RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: missing vault secret lounge_cf_stream_purge_http_secret (must match Edge LOUNGE_CF_STREAM_PURGE_SECRET)';
    RETURN;
  END IF;

  IF api_key IS NULL OR api_key = '' THEN
    RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: missing vault secret lounge_cf_stream_purge_supabase_anon_key';
    RETURN;
  END IF;

  IF api_key ~* '^bearer\s+' THEN
    api_key := btrim(regexp_replace(api_key, '^[Bb]earer\s+', ''));
  END IF;

  IF api_key ~ '^eyJ' THEN
    IF position('.' in api_key) = 0 OR length(api_key) < 80 THEN
      RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: JWT looks truncated; re-copy legacy anon from API keys tab.';
      RETURN;
    END IF;
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', api_key,
      'Authorization', 'Bearer ' || api_key,
      'x-lounge-cf-stream-purge-secret', purge_secret
    );
  ELSIF api_key ~ '^sb_publishable_' OR api_key ~ '^sb_secret_' THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', api_key,
      'x-lounge-cf-stream-purge-secret', purge_secret
    );
  ELSE
    RAISE WARNING 'invoke_lounge_cf_stream_purge_pending: lounge_cf_stream_purge_supabase_anon_key must start with eyJ (legacy JWT) or sb_publishable_/sb_secret_.';
    RETURN;
  END IF;

  SELECT
    net.http_post(
      url := base_url || '/functions/v1/lounge-cf-stream-purge-pending-uploads',
      headers := headers,
      body := '{"maxAgeHours": 24, "dryRun": false}'::jsonb,
      timeout_milliseconds := 120000
    )
  INTO req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_lounge_cf_stream_purge_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_lounge_cf_stream_purge_pending() TO postgres;
