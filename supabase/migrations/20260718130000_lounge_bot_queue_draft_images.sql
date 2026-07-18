-- Editorial inbox: optional draft_image_urls (up to 6) on queue rows.

alter table public.lounge_bot_queue
  add column if not exists draft_image_urls jsonb not null default '[]'::jsonb;

comment on column public.lounge_bot_queue.draft_image_urls is
  'Admin-attached Lounge feed image URLs for editorial drafts (max 6 at publish).';

create or replace function public.admin_lounge_bot_editorial_inbox(
  p_status text default 'pending_review',
  p_bot_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;

  return coalesce((
    select jsonb_agg(row order by row->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', q.id,
        'bot_user_id', q.bot_user_id,
        'bot_slug', a.slug,
        'bot_display_name', a.display_name,
        'source_type', q.source_type,
        'source_text', q.source_text,
        'source_url', q.source_url,
        'source_posted_at', q.source_posted_at,
        'draft_caption', q.draft_caption,
        'draft_image_urls', coalesce(q.draft_image_urls, '[]'::jsonb),
        'category_pills', coalesce(q.category_pills, '{}'::text[]),
        'status', q.status,
        'scheduled_at', q.scheduled_at,
        'published_post_id', q.published_post_id,
        'created_at', q.created_at,
        'x_handle', xs.x_handle
      ) as row
      from public.lounge_bot_queue q
      join public.lounge_bot_accounts a on a.user_id = q.bot_user_id
      left join public.lounge_bot_x_sources xs on xs.id = q.source_id
      where q.status = coalesce(nullif(p_status, ''), 'pending_review')
        and (p_bot_user_id is null or q.bot_user_id = p_bot_user_id)
      order by q.created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) sub
  ), '[]'::jsonb);
end;
$$;

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
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.play_log_viewer_is_admin() then raise exception 'admin only'; end if;
  if p_queue_id is null then raise exception 'p_queue_id required'; end if;

  select * into v_row from public.lounge_bot_queue where id = p_queue_id;
  if not found then raise exception 'queue row not found'; end if;

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
      when p_patch ? 'draft_caption' then left(trim(p_patch->>'draft_caption'), 500)
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

notify pgrst, 'reload schema';
