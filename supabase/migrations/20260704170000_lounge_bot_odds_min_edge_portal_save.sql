-- Bot portal: save min +EV threshold on odds bots via admin_lounge_bot_save_settings.

create or replace function public.admin_lounge_bot_save_settings(
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lounge_bot_accounts%rowtype;
  v_config jsonb;
  v_handle text;
  v_display_name text;
  v_min_edge numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id required';
  end if;

  select * into v_row from public.lounge_bot_accounts where user_id = p_user_id;
  if not found then
    raise exception 'bot not found';
  end if;

  v_config := coalesce(v_row.config, '{}'::jsonb);
  if p_patch ? 'config' and jsonb_typeof(p_patch->'config') = 'object' then
    v_config := v_config || (p_patch->'config');
  end if;

  if p_patch ? 'handle' then
    v_handle := lower(trim(p_patch->>'handle'));
    if v_handle is not null and v_handle <> '' and v_handle !~ '^[a-z0-9_]{2,30}$' then
      raise exception 'invalid handle';
    end if;
  end if;

  v_display_name := case
    when p_patch ? 'display_name' then nullif(trim(p_patch->>'display_name'), '')
    else null
  end;

  update public.lounge_bot_accounts
  set
    run_state = coalesce(nullif(p_patch->>'run_state', ''), run_state),
    display_name = coalesce(v_display_name, display_name),
    max_posts_per_day = coalesce((p_patch->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_hour = coalesce((p_patch->>'max_posts_per_hour')::int, max_posts_per_hour),
    publish_score_threshold = coalesce((p_patch->>'publish_score_threshold')::numeric, publish_score_threshold),
    category_pills_default = case
      when p_patch ? 'category_pills_default' and jsonb_typeof(p_patch->'category_pills_default') = 'array'
        then coalesce(
          (select array_agg(value)::text[] from jsonb_array_elements_text(p_patch->'category_pills_default')),
          category_pills_default
        )
      else category_pills_default
    end,
    config = v_config,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_row;

  update public.profiles
  set
    display_name = coalesce(v_display_name, display_name),
    handle = case
      when p_patch ? 'handle' then coalesce(nullif(v_handle, ''), handle)
      else handle
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else avatar_url
    end,
    banner_url = case
      when p_patch ? 'banner_url' then nullif(p_patch->>'banner_url', '')
      else banner_url
    end,
    bio = case
      when p_patch ? 'bio' then left(nullif(trim(p_patch->>'bio'), ''), 160)
      else bio
    end,
    about_me = case
      when p_patch ? 'about_me' then left(nullif(trim(p_patch->>'about_me'), ''), 140)
      else about_me
    end
  where user_id = p_user_id;

  if p_patch ? 'min_edge_pct' then
    if v_row.pipeline <> 'odds_api' then
      raise exception 'min_edge_pct applies to odds_api bots only';
    end if;

    v_min_edge := (p_patch->>'min_edge_pct')::numeric;
    if v_min_edge is null or v_min_edge < 0.5 or v_min_edge > 15 then
      raise exception 'min_edge_pct must be between 0.5 and 15';
    end if;

    update public.lounge_bot_odds_config
    set min_edge_pct = round(v_min_edge, 2)
    where bot_user_id = p_user_id;

    if not found then
      raise exception 'odds config not found for this bot';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'run_state', v_row.run_state,
    'max_posts_per_day', v_row.max_posts_per_day,
    'max_posts_per_hour', v_row.max_posts_per_hour,
    'publish_score_threshold', v_row.publish_score_threshold,
    'min_edge_pct', (
      select o.min_edge_pct
      from public.lounge_bot_odds_config o
      where o.bot_user_id = p_user_id
    )
  );
end;
$$;
