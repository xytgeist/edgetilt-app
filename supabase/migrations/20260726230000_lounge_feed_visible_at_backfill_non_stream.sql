-- Backfill feed visibility for non-Stream posts stuck with feed_visible_at NULL.
-- Bot + news publishes missed feed_visible_at after staged-video migration.

begin;

update public.community_feed_posts
set feed_visible_at = created_at
where feed_visible_at is null
  and coalesce(nullif(trim(stream_video_uid), ''), '') = '';

commit;
