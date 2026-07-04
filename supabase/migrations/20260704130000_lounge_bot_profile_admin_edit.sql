-- Bot portal: admin edit bot Lounge profile (avatar, banner, bio, handle).

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

  return jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'run_state', v_row.run_state,
    'max_posts_per_day', v_row.max_posts_per_day,
    'max_posts_per_hour', v_row.max_posts_per_hour,
    'publish_score_threshold', v_row.publish_score_threshold
  );
end;
$$;

-- Extend portal snapshot with profile fields for the bot editor UI.
create or replace function public.admin_lounge_bot_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  v_hour_start timestamptz := v_now - interval '1 hour';
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'editorial_pending', (
      select count(*)::int from public.lounge_bot_queue q where q.status = 'pending_review'
    ),
    'editorial_scheduled', (
      select count(*)::int from public.lounge_bot_queue q where q.status = 'scheduled'
    ),
    'bots', coalesce((
      select jsonb_agg(bot_row order by bot_row->>'slug')
      from (
        select jsonb_build_object(
          'user_id', a.user_id,
          'slug', a.slug,
          'pipeline', a.pipeline,
          'review_mode', a.review_mode,
          'display_name', a.display_name,
          'run_state', a.run_state,
          'enabled', a.enabled,
          'max_posts_per_day', a.max_posts_per_day,
          'max_posts_per_hour', a.max_posts_per_hour,
          'publish_score_threshold', a.publish_score_threshold,
          'category_pills_default', coalesce(a.category_pills_default, '{}'::text[]),
          'config', coalesce(a.config, '{}'::jsonb),
          'last_poll_at', a.last_poll_at,
          'last_publish_at', a.last_publish_at,
          'created_at', a.created_at,
          'handle', p.handle,
          'avatar_url', p.avatar_url,
          'banner_url', p.banner_url,
          'bio', p.bio,
          'about_me', p.about_me,
          'is_bot', coalesce(p.is_bot, false),
          'pending_review', (
            select count(*)::int from public.lounge_bot_queue q
            where q.bot_user_id = a.user_id and q.status = 'pending_review'
          ),
          'posts_today', (
            select count(*)::int from public.lounge_bot_publish_log l
            where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_day_start
          ),
          'posts_last_hour', (
            select count(*)::int from public.lounge_bot_publish_log l
            where l.bot_user_id = a.user_id and l.status = 'published' and l.created_at >= v_hour_start
          ),
          'sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'name', s.name, 'kind', s.kind, 'enabled', s.enabled,
              'poll_interval_sec', s.poll_interval_sec, 'last_polled_at', s.last_polled_at,
              'last_error', s.last_error
            ) order by s.name)
            from public.lounge_news_sources s where s.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'x_sources', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', xs.id, 'x_handle', xs.x_handle, 'enabled', xs.enabled,
              'last_polled_at', xs.last_polled_at, 'last_error', xs.last_error
            ) order by xs.x_handle)
            from public.lounge_bot_x_sources xs where xs.bot_user_id = a.user_id
          ), '[]'::jsonb),
          'recent_posts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'post_id', c.id, 'caption', c.caption,
              'category_pills', coalesce(c.category_pills, '{}'::text[]),
              'created_at', c.created_at, 'edited_at', c.edited_at,
              'like_count', c.like_count, 'comment_count', c.comment_count
            ) order by c.created_at desc)
            from (
              select c.* from public.community_feed_posts c
              where c.user_id = a.user_id and c.hidden_at is null
              order by c.created_at desc limit 20
            ) c
          ), '[]'::jsonb),
          'recent_log', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id, 'status', l.status, 'caption', left(l.caption, 240),
              'score', l.score, 'post_id', l.post_id, 'error_message', l.error_message,
              'created_at', l.created_at
            ) order by l.created_at desc)
            from (
              select l.* from public.lounge_bot_publish_log l
              where l.bot_user_id = a.user_id order by l.created_at desc limit 15
            ) l
          ), '[]'::jsonb)
        ) as bot_row
        from public.lounge_bot_accounts a
        left join public.profiles p on p.user_id = a.user_id
      ) sub
    ), '[]'::jsonb)
  );
end;
$$;
