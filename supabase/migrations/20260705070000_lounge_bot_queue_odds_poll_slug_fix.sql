-- Fix PL/pgSQL "column reference slug is ambiguous" on Scott bot portal posts.
-- admin_lounge_bot_queue_odds_poll declared `slug text` then queried `where a.slug = slug`.
-- PostgreSQL cannot tell the bare `slug` from lounge_bot_accounts.slug vs the variable.
--
-- Also fix admin_lounge_bot_publish_post: unnest alias `slug` vs v_bot.slug composite field.

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
  service_key text;
  base_url text;
  req_id bigint;
  action text;
  body jsonb;
  v_slug text;
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
    raise exception 'missing vault secret lounge_odds_poll_service_role_key';
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise exception 'missing vault secret lounge_odds_poll_project_url';
  end if;

  if service_key ~* '^bearer\s+' then
    service_key := btrim(regexp_replace(service_key, '^[Bb]earer\s+', ''));
  end if;

  base_url := rtrim(btrim(base_url), '/');

  body := jsonb_build_object(
    'slug', v_slug,
    'action', action,
    'dryRun', coalesce(p_dry_run, false),
    'force', coalesce(p_force, false)
  );

  select
    net.http_post(
      url := base_url || '/functions/v1/lounge-odds-poll',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', service_key,
        'Authorization', 'Bearer ' || service_key
      ),
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

comment on function public.admin_lounge_bot_queue_odds_poll(text, text, boolean, boolean) is
  'Admin portal: async POST lounge-odds-poll for one odds bot (pg_net, 180s worker timeout).';

create or replace function public.admin_lounge_bot_publish_post(
  p_bot_user_id uuid,
  p_caption text,
  p_category_pills text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot public.lounge_bot_accounts%rowtype;
  v_cap text;
  v_pills text[];
  v_post_id uuid;
  v_max integer;
  v_allowed text[] := array[
    'ap_slots', 'ap_tables', 'poker', 'gaming', 'sports', 'tabletop',
    'investing', 'trading', 'stocks', 'crypto', 'collectibles'
  ];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;

  select * into v_bot
  from public.lounge_bot_accounts a
  where a.user_id = p_bot_user_id;
  if not found then raise exception 'bot not found'; end if;

  v_max := public.lounge_feed_caption_max_for_user(p_bot_user_id);
  v_cap := left(trim(coalesce(p_caption, '')), v_max);
  if char_length(v_cap) < 1 then raise exception 'caption required'; end if;

  select coalesce(array(
    select distinct pill_slug
    from unnest(
      case
        when p_category_pills is not null and cardinality(p_category_pills) > 0 then
          p_category_pills
        else coalesce(v_bot.category_pills_default, '{}'::text[])
      end
    ) as pill_slug
    where pill_slug = any(v_allowed)
    limit 3
  ), '{}'::text[])
  into v_pills;

  insert into public.community_feed_posts (
    user_id, caption, game_title, game_slug, category_pills
  ) values (
    p_bot_user_id, v_cap, '', null, v_pills
  )
  returning id into v_post_id;

  insert into public.lounge_bot_publish_log (
    bot_user_id, post_id, caption, status, post_kind
  ) values (
    p_bot_user_id, v_post_id, v_cap, 'published', 'other'
  );

  update public.lounge_bot_accounts
  set last_publish_at = now()
  where user_id = p_bot_user_id;

  return jsonb_build_object(
    'ok', true,
    'post_id', v_post_id,
    'caption', v_cap,
    'category_pills', v_pills
  );
end;
$$;

comment on function public.admin_lounge_bot_publish_post(uuid, text, text[]) is
  'Admin bot portal: publish a feed post as the bot (2000 cap for bots).';
