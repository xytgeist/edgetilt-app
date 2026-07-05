-- pg_net auth for Scott odds poll: shared cron secret header (same pattern as stream purge / activity push).
-- Vault: lounge_odds_poll_cron_secret (random string, same value as Edge LOUNGE_ODDS_POLL_CRON_SECRET).
-- Prereqs: lounge_odds_poll_project_url + lounge_odds_poll_service_role_key (unchanged).

create or replace function public.lounge_bot_pg_net_service_headers(
  p_service_key text,
  p_cron_secret text default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
  k text := btrim(coalesce(p_service_key, ''));
  headers jsonb;
begin
  if k ~* '^bearer\s+' then
    k := btrim(regexp_replace(k, '^[Bb]earer\s+', ''));
  end if;

  if k = '' then
    headers := jsonb_build_object('Content-Type', 'application/json');
  elsif k ~ '^eyJ' then
    if position('.' in k) = 0 or length(k) < 80 then
      raise exception 'service key JWT looks truncated';
    end if;
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', k,
      'Authorization', 'Bearer ' || k
    );
  elsif k ~ '^sb_publishable_' or k ~ '^sb_secret_' then
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', k
    );
  else
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', k,
      'Authorization', 'Bearer ' || k
    );
  end if;

  if p_cron_secret is not null and btrim(p_cron_secret) <> '' then
    headers := headers || jsonb_build_object('x-lounge-odds-poll-cron-secret', btrim(p_cron_secret));
  end if;

  return headers;
end;
$$;

comment on function public.lounge_bot_pg_net_service_headers(text, text) is
  'pg_net headers for Scott odds Edge calls: service key + optional x-lounge-odds-poll-cron-secret.';

-- Helper: load vault keys + build headers for odds poll Edge calls.
create or replace function public.lounge_bot_odds_poll_pg_net_headers()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  service_key text;
  cron_secret text;
begin
  select btrim(ds.decrypted_secret)
  into service_key
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_service_role_key'
  limit 1;

  select btrim(ds.decrypted_secret)
  into cron_secret
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_cron_secret'
  limit 1;

  if service_key is null or service_key = '' then
    raise exception 'missing vault secret lounge_odds_poll_service_role_key';
  end if;

  return public.lounge_bot_pg_net_service_headers(service_key, cron_secret);
end;
$$;

comment on function public.lounge_bot_odds_poll_pg_net_headers() is
  'Load Vault service key + cron secret; build pg_net headers for lounge-odds-poll / lounge-bot-publish-due.';

revoke all on function public.lounge_bot_odds_poll_pg_net_headers() from public;
grant execute on function public.lounge_bot_odds_poll_pg_net_headers() to postgres;

create or replace function public.admin_lounge_bot_queue_odds_poll(
  p_slug text,
  p_action text default 'poll_edges',
  p_dry_run boolean default false,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, net, extensions, pg_temp
as $$
declare
  base_url text;
  req_id bigint;
  action text;
  body jsonb;
  v_slug text;
  headers jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  v_slug := btrim(coalesce(p_slug, ''));
  if v_slug = '' then
    raise exception 'slug required';
  end if;

  action := lower(btrim(coalesce(p_action, '')));
  if action not in ('poll_edges', 'daily_slates', 'best_bet_hour', 'value_bet_radar') then
    raise exception 'invalid action: %', p_action;
  end if;

  if not exists (
    select 1
    from public.lounge_bot_accounts a
    where a.slug = v_slug
      and a.pipeline = 'odds_api'
      and a.enabled = true
  ) then
    raise exception 'odds bot not found: %', v_slug;
  end if;

  select btrim(ds.decrypted_secret)
  into base_url
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_project_url'
  limit 1;

  if base_url is null or btrim(base_url) = '' then
    raise exception 'missing vault secret lounge_odds_poll_project_url';
  end if;

  base_url := rtrim(btrim(base_url), '/');
  headers := public.lounge_bot_odds_poll_pg_net_headers();

  body := jsonb_build_object(
    'slug', v_slug,
    'action', action,
    'dryRun', coalesce(p_dry_run, false),
    'force', coalesce(p_force, false)
  );

  select
    net.http_post(
      url := base_url || '/functions/v1/lounge-odds-poll',
      headers := headers,
      body := body,
      timeout_milliseconds := 180000
    )
  into req_id;

  return jsonb_build_object(
    'ok', true,
    'queued', true,
    'asyncQueued', true,
    'request_id', req_id,
    'slug', v_slug,
    'action', action
  );
exception
  when others then
    raise exception '%', sqlerrm;
end;
$$;

create or replace function public.invoke_lounge_odds_poll(p_action text)
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  base_url text;
  req_id bigint;
  bot record;
  action text;
  body jsonb;
  headers jsonb;
begin
  action := lower(btrim(coalesce(p_action, '')));
  if action not in ('poll_edges', 'daily_slates', 'best_bet_hour', 'value_bet_radar') then
    raise warning 'invoke_lounge_odds_poll: action must be poll_edges, daily_slates, best_bet_hour, or value_bet_radar (got %)', p_action;
    return;
  end if;

  select btrim(ds.decrypted_secret)
  into base_url
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_project_url'
  limit 1;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_odds_poll: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  begin
    headers := public.lounge_bot_odds_poll_pg_net_headers();
  exception
    when others then
      raise warning 'invoke_lounge_odds_poll: %', sqlerrm;
      return;
  end;

  base_url := rtrim(btrim(base_url), '/');

  for bot in
    select a.slug
    from public.lounge_bot_accounts a
    where a.pipeline = 'odds_api'
      and a.run_state = 'running'
      and a.enabled = true
    order by a.slug
  loop
    body := jsonb_build_object(
      'slug', bot.slug,
      'action', action
    );

    begin
      select
        net.http_post(
          url := base_url || '/functions/v1/lounge-odds-poll',
          headers := headers,
          body := body,
          timeout_milliseconds := 180000
        )
      into req_id;
    exception
      when others then
        raise warning 'invoke_lounge_odds_poll: % for bot % — %', action, bot.slug, sqlerrm;
    end;
  end loop;
exception
  when others then
    raise warning 'invoke_lounge_odds_poll: %', sqlerrm;
end;
$$;

create or replace function public.invoke_lounge_bot_publish_scheduled()
returns void
language plpgsql
security definer
set search_path = public, vault, net, cron, extensions, pg_temp
as $$
declare
  base_url text;
  req_id bigint;
  headers jsonb;
begin
  select btrim(ds.decrypted_secret)
  into base_url
  from vault.decrypted_secrets as ds
  where ds.name = 'lounge_odds_poll_project_url'
  limit 1;

  if base_url is null or btrim(base_url) = '' then
    raise warning 'invoke_lounge_bot_publish_scheduled: add vault secret lounge_odds_poll_project_url';
    return;
  end if;

  begin
    headers := public.lounge_bot_odds_poll_pg_net_headers();
  exception
    when others then
      raise warning 'invoke_lounge_bot_publish_scheduled: %', sqlerrm;
      return;
  end;

  base_url := rtrim(btrim(base_url), '/');

  begin
    select
      net.http_post(
        url := base_url || '/functions/v1/lounge-bot-publish-due',
        headers := headers,
        body := jsonb_build_object('publishScheduledOdds', true),
        timeout_milliseconds := 120000
      )
    into req_id;
  exception
    when others then
      raise warning 'invoke_lounge_bot_publish_scheduled: %', sqlerrm;
  end;
exception
  when others then
    raise warning 'invoke_lounge_bot_publish_scheduled: %', sqlerrm;
end;
$$;
