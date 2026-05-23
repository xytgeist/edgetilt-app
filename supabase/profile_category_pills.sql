-- Profile interest tribes — same as migration `20260525160000_profiles_category_pills.sql`.

alter table public.profiles
  add column if not exists category_pills text[] not null default '{}'::text[];

comment on column public.profiles.category_pills is
  'Member interest tribes shown on the Lounge profile (same staff slug enum as community_feed_posts.category_pills).';

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
      'tabletop',
      'investing',
      'trading',
      'stocks',
      'crypto',
      'collectibles'
    ]::text[]
  );
