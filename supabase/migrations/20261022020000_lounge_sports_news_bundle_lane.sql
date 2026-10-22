-- Jordan Pike roundup posts: near-miss items share one post; each item keeps its dedupe row under lane 'bundle'.
alter table public.lounge_sports_news_posts drop constraint if exists lounge_sports_news_posts_lane_check;
alter table public.lounge_sports_news_posts
  add constraint lounge_sports_news_posts_lane_check
  check (lane in ('status', 'qb', 'in_game', 'transaction', 'inactives', 'line_move', 'bundle'));
