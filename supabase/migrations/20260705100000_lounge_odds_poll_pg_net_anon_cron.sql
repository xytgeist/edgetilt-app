-- pg_net → lounge-odds-poll: use project anon/publishable + cron secret (stream purge pattern).
-- Never send service_role in Authorization Bearer (causes 401 Invalid or expired session on Edge).
-- Vault (test/prod once each):
--   lounge_odds_poll_cron_secret          → same as Edge LOUNGE_ODDS_POLL_CRON_SECRET
--   lounge_odds_poll_supabase_anon_key    → eyJ anon OR sb_publishable_ (or reuse lounge_cf_stream_purge_supabase_anon_key)
-- Prereq: lounge_odds_poll_project_url (unchanged).
-- After apply: set Edge LOUNGE_ODDS_POLL_CRON_SECRET + redeploy lounge-odds-poll + lounge-bot-publish-due.

create or replace function public.lounge_bot_odds_poll_pg_net_headers()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  anon_key text;
  cron_secret text;
begin
  select btrim(ds.decrypted_secret)
  into cron_secret
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_cron_secret'
  limit 1;

  if cron_secret is null or btrim(cron_secret) = '' then
    raise exception 'missing vault secret lounge_odds_poll_cron_secret (must match Edge LOUNGE_ODDS_POLL_CRON_SECRET)';
  end if;

  select btrim(ds.decrypted_secret)
  into anon_key
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_supabase_anon_key'
  limit 1;

  if anon_key is null or btrim(anon_key) = '' then
    select btrim(ds.decrypted_secret)
    into anon_key
    from vault.decrypted_secrets as ds
    where ds.name = 'lounge_cf_stream_purge_supabase_anon_key'
    limit 1;
  end if;

  if anon_key is null or btrim(anon_key) = '' then
    raise exception
      'missing vault anon key: create lounge_odds_poll_supabase_anon_key or lounge_cf_stream_purge_supabase_anon_key';
  end if;

  return public.lounge_bot_pg_net_service_headers(anon_key, cron_secret);
end;
$$;

comment on function public.lounge_bot_odds_poll_pg_net_headers() is
  'pg_net headers for lounge-odds-poll / lounge-bot-publish-due: anon/publishable apikey + x-lounge-odds-poll-cron-secret (no service_role Bearer).';
