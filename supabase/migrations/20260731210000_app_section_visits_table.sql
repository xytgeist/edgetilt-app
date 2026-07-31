-- App section visit analytics (Edge Monitor Product tab).
-- Chain: 10000 table → 10100/10200 indexes → 10300 RLS → 10400–10501 record RPC → 10600–10701 admin RPC.

create table if not exists public.app_section_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section_id text not null,
  visited_at timestamptz not null default now(),
  constraint app_section_visits_section_id_check check (
    section_id in (
      'lounge',
      'chat',
      'slots-hub',
      'poker-hub',
      'guides',
      'calculators',
      'bankroll',
      'play-logbook',
      'offers',
      'intel',
      'poker-bankroll',
      'poker-stable',
      'affiliates',
      'creator'
    )
  )
);
