-- Lounge game pill: null = caption-match, {"event_id":"..."} pins a slate game, {"suppress":true} hides.
alter table public.community_feed_posts
  add column if not exists sports_game jsonb;
