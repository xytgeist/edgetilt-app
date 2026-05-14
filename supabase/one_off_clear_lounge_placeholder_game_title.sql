-- One-off: clear synthetic `game_title` placeholder "Lounge" (legacy client wrote `gameTitle: 'Lounge'`
-- in `loungePostSubmitJob.js`). Safe to re-run; only touches rows whose trimmed title is that word.
--
-- 1) Preview (uncomment):
-- select id, user_id, game_title, game_slug, left(caption, 60) as caption_preview
-- from public.community_feed_posts
-- where lower(trim(game_title)) = 'lounge';
--
-- 2) Run update:
update public.community_feed_posts
set
  game_title = '',
  game_slug = null
where lower(trim(game_title)) = 'lounge';

-- Optional: verify zero rows remain
-- select count(*) as remaining from public.community_feed_posts where lower(trim(game_title)) = 'lounge';
