-- Cloudflare Stream video id (HLS playback via `videodelivery.net/{uid}/...`).
-- Apply after `lounge_feed_post_image_urls.sql`. Videos are exclusive of `image_urls` / GIF in app logic.
--
-- Edge Function `lounge-cf-stream-direct-upload` (deploy + secrets):
--   supabase secrets set CLOUDFLARE_ACCOUNT_ID=...
--   supabase secrets set CLOUDFLARE_STREAM_API_TOKEN=...   # Stream:Edit
--   supabase functions deploy lounge-cf-stream-direct-upload --project-ref jtjgtucumuoswnbauxry
-- Edge `lounge-cf-stream-delete-video` (same secrets; test ref):
--   supabase functions deploy lounge-cf-stream-delete-video --project-ref jtjgtucumuoswnbauxry

alter table public.community_feed_posts
  add column if not exists stream_video_uid text;

comment on column public.community_feed_posts.stream_video_uid is
  'Cloudflare Stream asset uid when the post has a processed video (direct upload from Lounge). Empty for image/GIF-only posts.';

create index if not exists community_feed_posts_stream_video_uid_idx
  on public.community_feed_posts (stream_video_uid)
  where stream_video_uid is not null and trim(stream_video_uid) <> '';
