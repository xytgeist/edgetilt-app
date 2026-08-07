-- Bot portal "Post as": accept market_embeds (ticker charts) on manual publish.
-- Edge attach cannot be used here … post author is the bot, not the admin session.

begin;

drop function if exists public.admin_lounge_bot_publish_post(uuid, text, text[], jsonb);

create or replace function public.admin_lounge_bot_publish_post(
  p_bot_user_id uuid,
  p_caption text,
  p_category_pills text[] default null,
  p_image_urls jsonb default '[]'::jsonb,
  p_market_embeds jsonb default '[]'::jsonb
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
  v_images jsonb;
  v_embeds jsonb;
  v_media text;
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

  select coalesce(
    (
      select jsonb_agg(to_jsonb(u) order by ord)
      from (
        select trim(value) as u, row_number() over () as ord
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(coalesce(p_image_urls, '[]'::jsonb)) = 'array' then coalesce(p_image_urls, '[]'::jsonb)
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

  select coalesce(
    (
      select jsonb_agg(elem order by ord)
      from (
        select elem, row_number() over () as ord
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(p_market_embeds, '[]'::jsonb)) = 'array'
              then coalesce(p_market_embeds, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as elem
        where jsonb_typeof(elem) = 'object'
          and length(trim(coalesce(elem->>'symbol', ''))) > 0
        limit 12
      ) t
    ),
    '[]'::jsonb
  )
  into v_embeds;

  v_max := public.lounge_feed_caption_max_for_user(p_bot_user_id);
  v_cap := left(trim(coalesce(p_caption, '')), v_max);

  if char_length(v_cap) < 1
     and jsonb_array_length(v_images) < 1
     and jsonb_array_length(v_embeds) < 1 then
    raise exception 'caption, image, or ticker required';
  end if;

  select coalesce(array(
    select distinct slug
    from unnest(
      case
        when p_category_pills is not null and cardinality(p_category_pills) > 0 then
          p_category_pills
        else coalesce(v_bot.category_pills_default, '{}'::text[])
      end
    ) as slug
    where slug = any(v_allowed)
    limit 3
  ), '{}'::text[])
  into v_pills;

  v_media := case
    when jsonb_array_length(v_images) > 0 then v_images->>0
    else null
  end;

  insert into public.community_feed_posts (
    user_id,
    caption,
    game_title,
    game_slug,
    category_pills,
    image_urls,
    media_url,
    market_embeds,
    feed_visible_at
  ) values (
    p_bot_user_id,
    v_cap,
    '',
    null,
    v_pills,
    v_images,
    v_media,
    v_embeds,
    now()
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
    'category_pills', v_pills,
    'image_urls', v_images,
    'market_embeds', v_embeds
  );
end;
$$;

revoke all on function public.admin_lounge_bot_publish_post(uuid, text, text[], jsonb, jsonb) from public;
grant execute on function public.admin_lounge_bot_publish_post(uuid, text, text[], jsonb, jsonb) to authenticated;

comment on function public.admin_lounge_bot_publish_post(uuid, text, text[], jsonb, jsonb) is
  'Admin bot portal: publish a Lounge feed post as a bot (caption and/or images and/or up to 12 market_embeds). Sets feed_visible_at so the post is live immediately.';

commit;
