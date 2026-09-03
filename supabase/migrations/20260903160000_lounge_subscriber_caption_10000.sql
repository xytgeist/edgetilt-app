-- Lounge captions: hard ceiling 10000 for Edge Pro / bot / staff (free stays 500 via trigger).

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_caption_len_check;

alter table public.community_feed_posts
  add constraint community_feed_posts_caption_len_check
  check (char_length(caption) <= 10000);

comment on column public.community_feed_posts.caption is
  'Canonical feed caption (<= 10000 hard max, free tier 500 via trigger).';

alter table public.feed_comments
  drop constraint if exists feed_comments_body_len;

alter table public.feed_comments
  add constraint feed_comments_body_len check (
    char_length(body) <= 10000
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
  check (char_length(caption) <= 10000);

create or replace function public.lounge_post_draft_thread_captions_valid(p_parts text[])
returns boolean
language sql
immutable
as $$
  select cardinality(coalesce(p_parts, '{}'::text[])) <= 25
    and coalesce(
      (
        select bool_and(char_length(part) <= 10000)
        from unnest(coalesce(p_parts, '{}'::text[])) as part
      ),
      true
    );
$$;

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
    ) then 10000
    else 500
  end;
$$;

revoke all on function public.lounge_feed_caption_max_for_user(uuid) from public;
grant execute on function public.lounge_feed_caption_max_for_user(uuid) to authenticated;

comment on function public.lounge_feed_caption_max_for_user(uuid) is
  'Lounge post/comment char cap: 10000 for subscriber, bot, or staff, else 500.';
