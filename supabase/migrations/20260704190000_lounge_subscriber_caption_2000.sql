-- Lounge captions: hard ceiling 2000; free tier 500 enforced by trigger (subscriber / bot / staff → 2000).

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_caption_len_check;

alter table public.community_feed_posts
  add constraint community_feed_posts_caption_len_check
  check (char_length(caption) <= 2000);

comment on column public.community_feed_posts.caption is
  'Canonical feed caption (<= 2000 hard max; free tier 500 via trigger).';

alter table public.feed_comments
  drop constraint if exists feed_comments_body_len;

alter table public.feed_comments
  add constraint feed_comments_body_len check (
    char_length(body) <= 2000
    and (
      char_length(trim(body)) >= 1
      or (
        image_urls is not null
        and jsonb_typeof(image_urls) = 'array'
        and jsonb_array_length(image_urls) > 0
      )
      or length(trim(coalesce(media_url, ''))) > 0
      or length(trim(coalesce(gif_url, ''))) > 0
      or length(trim(coalesce(stream_video_uid, ''))) > 0
    )
  );

alter table public.lounge_post_drafts
  drop constraint if exists lounge_post_drafts_caption_len;

alter table public.lounge_post_drafts
  add constraint lounge_post_drafts_caption_len
  check (char_length(caption) <= 2000);

create or replace function public.lounge_post_draft_thread_captions_valid(p_parts text[])
returns boolean
language sql
immutable
as $$
  select cardinality(coalesce(p_parts, '{}'::text[])) <= 25
    and coalesce(
      (
        select bool_and(char_length(part) <= 2000)
        from unnest(coalesce(p_parts, '{}'::text[])) as part
      ),
      true
    );
$$;

-- ---------------------------------------------------------------------------
-- Tier cap helper
-- ---------------------------------------------------------------------------

create or replace function public.lounge_feed_caption_max_for_user(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.profiles p
      where p.user_id = p_user_id
        and (
          coalesce(p.is_bot, false)
          or coalesce(p.has_active_subscription, false)
          or p.role in ('admin', 'moderator')
        )
    ) then 2000
    else 500
  end;
$$;

revoke all on function public.lounge_feed_caption_max_for_user(uuid) from public;
grant execute on function public.lounge_feed_caption_max_for_user(uuid) to authenticated;

comment on function public.lounge_feed_caption_max_for_user(uuid) is
  'Lounge post/comment char cap: 2000 for subscriber, bot, or staff; else 500.';

-- ---------------------------------------------------------------------------
-- Enforce tier on posts + comments
-- ---------------------------------------------------------------------------

create or replace function public.community_feed_posts_enforce_caption_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  v_max := public.lounge_feed_caption_max_for_user(new.user_id);
  if char_length(coalesce(new.caption, '')) > v_max then
    raise exception 'caption exceeds % character limit for your account tier', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_caption_tier on public.community_feed_posts;
create trigger trg_community_feed_posts_caption_tier
  before insert or update of caption on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_enforce_caption_tier();

create or replace function public.feed_comments_enforce_body_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  v_max := public.lounge_feed_caption_max_for_user(new.user_id);
  if char_length(coalesce(new.body, '')) > v_max then
    raise exception 'comment exceeds % character limit for your account tier', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feed_comments_body_tier on public.feed_comments;
create trigger trg_feed_comments_body_tier
  before insert or update of body on public.feed_comments
  for each row
  execute function public.feed_comments_enforce_body_tier();

-- ---------------------------------------------------------------------------
-- Bot portal manual publish: allow bot-length captions
-- ---------------------------------------------------------------------------

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
