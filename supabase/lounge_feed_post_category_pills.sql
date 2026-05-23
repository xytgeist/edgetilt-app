-- Optional audience category pills on community feed posts (0–3 per post).
-- Same as migration `20260525120000_community_feed_posts_category_pills.sql`.

alter table public.community_feed_posts
  add column if not exists category_pills text[] not null default '{}'::text[];

comment on column public.community_feed_posts.category_pills is
  'Up to 3 staff-seeded category slugs chosen by the author for targeted viewership (optional).';

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_category_pills_cardinality;

alter table public.community_feed_posts
  add constraint community_feed_posts_category_pills_cardinality
  check (cardinality(category_pills) <= 3);

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_category_pills_allowed;

alter table public.community_feed_posts
  add constraint community_feed_posts_category_pills_allowed
  check (
    category_pills <@ array[
      'ap_slots',
      'ap_tables',
      'poker',
      'gaming',
      'tabletop',
      'investing',
      'trading',
      'stocks',
      'crypto',
      'collectibles'
    ]::text[]
  );
