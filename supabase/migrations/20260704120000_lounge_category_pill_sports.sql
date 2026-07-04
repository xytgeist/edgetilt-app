-- Add Sports interest tribe (posts, profiles, feed filter allowlist).

create or replace function public.lounge_allowed_category_slugs()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'ap_slots',
    'ap_tables',
    'poker',
    'gaming',
    'sports',
    'tabletop',
    'investing',
    'trading',
    'stocks',
    'crypto',
    'collectibles'
  ]::text[];
$$;

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
      'sports',
      'tabletop',
      'investing',
      'trading',
      'stocks',
      'crypto',
      'collectibles'
    ]::text[]
  );

alter table public.profiles
  drop constraint if exists profiles_category_pills_allowed;

alter table public.profiles
  add constraint profiles_category_pills_allowed
  check (
    category_pills <@ array[
      'ap_slots',
      'ap_tables',
      'poker',
      'gaming',
      'sports',
      'tabletop',
      'investing',
      'trading',
      'stocks',
      'crypto',
      'collectibles'
    ]::text[]
  );
