-- Rename category pill slugs (v1 → current labels).
-- Run if `20260525120000_community_feed_posts_category_pills.sql` was already applied with old slugs.

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_category_pills_allowed;

update public.community_feed_posts p
set category_pills = coalesce(
  (
    select array_agg(
      case v.slug
        when 'slots' then 'ap_slots'
        when 'tables' then 'ap_tables'
        when 'games' then 'gaming'
        when 'video_games' then 'tabletop'
        else v.slug
      end
      order by v.ord
    )
    from unnest(p.category_pills) with ordinality as v(slug, ord)
  ),
  '{}'::text[]
)
where category_pills && array['slots', 'tables', 'games', 'video_games']::text[];

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
