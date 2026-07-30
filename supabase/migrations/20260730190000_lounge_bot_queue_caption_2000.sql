-- Bot editorial queue + manual draft: use bot caption max (2000), not stale 500 hard cap.
-- Matches lounge_feed_caption_max_for_user() from 20260704190000.

create or replace function public.admin_lounge_bot_queue_update(
  p_queue_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lounge_bot_queue%rowtype;
  v_images jsonb;
  v_max integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_queue_id is null then raise exception 'p_queue_id required'; end if;

  select * into v_row from public.lounge_bot_queue where id = p_queue_id;
  if not found then raise exception 'queue row not found'; end if;

  v_max := public.lounge_feed_caption_max_for_user(v_row.bot_user_id);

  if p_patch ? 'draft_image_urls' then
    select coalesce(
      (
        select jsonb_agg(to_jsonb(u) order by ord)
        from (
          select trim(value) as u, row_number() over () as ord
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(p_patch->'draft_image_urls') = 'array' then p_patch->'draft_image_urls'
              else '[]'::jsonb
            end
          )
          where length(trim(value)) > 0
          limit 6
        ) t
      ),
      '[]'::jsonb
    )
    into v_images;
  end if;

  update public.lounge_bot_queue
  set
    draft_caption = case
      when p_patch ? 'draft_caption' then left(trim(p_patch->>'draft_caption'), v_max)
      else draft_caption
    end,
    draft_image_urls = case
      when p_patch ? 'draft_image_urls' then coalesce(v_images, '[]'::jsonb)
      else draft_image_urls
    end,
    category_pills = case
      when p_patch ? 'category_pills' and jsonb_typeof(p_patch->'category_pills') = 'array'
        then coalesce(
          (select array_agg(value)::text[] from jsonb_array_elements_text(p_patch->'category_pills')),
          category_pills
        )
      else category_pills
    end,
    status = coalesce(nullif(p_patch->>'status', ''), status),
    scheduled_at = case
      when p_patch ? 'scheduled_at' then (p_patch->>'scheduled_at')::timestamptz
      else scheduled_at
    end,
    skip_reason = coalesce(nullif(p_patch->>'skip_reason', ''), skip_reason),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_queue_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'status', v_row.status,
    'scheduled_at', v_row.scheduled_at,
    'draft_image_urls', coalesce(v_row.draft_image_urls, '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_lounge_bot_queue_manual_draft(
  p_bot_user_id uuid,
  p_source_text text,
  p_draft_caption text default null,
  p_source_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cap text;
  v_max integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;

  v_max := public.lounge_feed_caption_max_for_user(p_bot_user_id);
  v_cap := left(trim(coalesce(p_draft_caption, p_source_text, '')), v_max);
  if v_cap = '' then raise exception 'caption required'; end if;

  insert into public.lounge_bot_queue (
    source_type, bot_user_id, source_text, source_url, draft_caption, status
  ) values (
    'manual', p_bot_user_id, left(trim(coalesce(p_source_text, '')), 2000),
    nullif(trim(coalesce(p_source_url, '')), ''), v_cap, 'pending_review'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

notify pgrst, 'reload schema';
