-- Per-part thread draft media + root Stream fields for single-post / thread root.

alter table public.lounge_post_drafts
  add column if not exists stream_video_uid text not null default '',
  add column if not exists stream_poster_url text not null default '',
  add column if not exists stream_video_width integer,
  add column if not exists stream_video_height integer,
  add column if not exists thread_part_media jsonb not null default '[]'::jsonb;

comment on column public.lounge_post_drafts.stream_video_uid is
  'Cloudflare Stream uid for root / single-post draft video (orphan until published).';

comment on column public.lounge_post_drafts.thread_part_media is
  'JSON array aligned with thread_captions indices 1..n-1: gif_url, image_urls, stream_* per part.';
