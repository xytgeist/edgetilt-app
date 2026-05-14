-- Cloudflare Stream video id (HLS playback via `videodelivery.net/{uid}/...`).
-- Apply after `lounge_feed_post_image_urls.sql`. Videos are exclusive of `image_urls` / GIF in app logic.
--
-- Edge Function `lounge-cf-stream-direct-upload` (deploy + secrets; test project ref jtjgtucumuoswnbauxry):
--   supabase secrets set CLOUDFLARE_ACCOUNT_ID=... --project-ref jtjgtucumuoswnbauxry
--   supabase secrets set CLOUDFLARE_STREAM_API_TOKEN=... --project-ref jtjgtucumuoswnbauxry   # Stream:Edit
--   supabase functions deploy lounge-cf-stream-direct-upload --project-ref jtjgtucumuoswnbauxry
-- Edge `lounge-cf-stream-delete-video` (same secrets):
--   supabase functions deploy lounge-cf-stream-delete-video --project-ref jtjgtucumuoswnbauxry
-- Edge `lounge-cf-stream-delete-orphan` (failed direct-upload cleanup):
--   supabase functions deploy lounge-cf-stream-delete-orphan --project-ref jtjgtucumuoswnbauxry
-- Edge `lounge-cf-stream-purge-pending-uploads` (cron; Edge secret LOUNGE_CF_STREAM_PURGE_SECRET + Vault + pg_cron):
--   supabase secrets set LOUNGE_CF_STREAM_PURGE_SECRET="$(openssl rand -hex 32)" --project-ref jtjgtucumuoswnbauxry   # once per project
--   supabase functions deploy lounge-cf-stream-purge-pending-uploads --project-ref jtjgtucumuoswnbauxry
--   supabase/migrations/20260509180000_lounge_cf_stream_purge_pg_cron.sql + Vault (see purge function README)

alter table public.community_feed_posts
  add column if not exists stream_video_uid text;

comment on column public.community_feed_posts.stream_video_uid is
  'Cloudflare Stream asset uid when the post has a processed video (direct upload from Lounge). Empty for image/GIF-only posts.';

create index if not exists community_feed_posts_stream_video_uid_idx
  on public.community_feed_posts (stream_video_uid)
  where stream_video_uid is not null and trim(stream_video_uid) <> '';

-- Stored JPEG in `lounge-feed` (public URL) so feed tiles have a stable poster before CF `thumbnail.jpg` is ready on every device.
alter table public.community_feed_posts
  add column if not exists stream_poster_url text;

alter table public.community_feed_posts
  add column if not exists stream_video_width integer;

alter table public.community_feed_posts
  add column if not exists stream_video_height integer;

comment on column public.community_feed_posts.stream_poster_url is
  'Public Supabase Storage URL for a feed-tile JPEG poster (lounge-feed). Optional; complements Cloudflare Stream uid.';

comment on column public.community_feed_posts.stream_video_width is
  'Display width in pixels from the source file at post time (CSS aspect-ratio / layout). Optional.';

comment on column public.community_feed_posts.stream_video_height is
  'Display height in pixels from the source file at post time (CSS aspect-ratio / layout). Optional.';
