-- feed_comments: post-parity media columns + optional empty body when media is present.
-- Apply on test (then prod) after feed_comments exists.

alter table public.feed_comments
  add column if not exists media_url text,
  add column if not exists gif_url text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists stream_video_uid text,
  add column if not exists stream_poster_url text,
  add column if not exists stream_video_width integer,
  add column if not exists stream_video_height integer;

comment on column public.feed_comments.media_url is
  'Optional public URL for an image (lounge-feed) or sole GIF when no image_urls.';
comment on column public.feed_comments.gif_url is
  'External GIF URL alongside uploaded images; null when GIF-only in media_url.';
comment on column public.feed_comments.image_urls is
  'Ordered uploaded image URLs (lounge-feed). Empty for legacy single media_url / video-only.';
comment on column public.feed_comments.stream_video_uid is
  'Cloudflare Stream uid when the reply has video; exclusive of images/GIF in app logic.';
comment on column public.feed_comments.stream_poster_url is
  'Public lounge-feed JPEG poster URL for Stream tile.';
comment on column public.feed_comments.stream_video_width is
  'Display width in pixels at post time (Stream replies).';
comment on column public.feed_comments.stream_video_height is
  'Display height in pixels at post time (Stream replies).';

create index if not exists feed_comments_stream_video_uid_idx
  on public.feed_comments (stream_video_uid)
  where stream_video_uid is not null and trim(stream_video_uid) <> '';

alter table public.feed_comments drop constraint if exists feed_comments_body_len;

alter table public.feed_comments add constraint feed_comments_body_len check (
  char_length(body) <= 280
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
