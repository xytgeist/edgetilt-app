-- Local Intel schema (auto-created "groups" via cities + casinos)
-- Paste into Supabase SQL editor.

-- 1) Cities and casinos (admin-seeded)
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  created_at timestamptz not null default now()
);

create unique index if not exists cities_name_region_unique
  on public.cities (lower(name), lower(coalesce(region, '')));

create table if not exists public.casinos (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists casinos_city_name_unique
  on public.casinos (city_id, lower(name));

-- 2) Follows (membership)
create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('city', 'casino')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- 3) Intel posts
create table if not exists public.intel_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('city', 'casino')),
  target_id uuid not null,
  post_type text not null check (post_type in ('new_install', 'paytable', 'reset', 'conditions', 'question', 'trip_report')),
  title text not null,
  body text not null,
  event_time timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists intel_posts_target_idx
  on public.intel_posts (target_type, target_id, created_at desc);

-- Enable RLS
alter table public.cities enable row level security;
alter table public.casinos enable row level security;
alter table public.follows enable row level security;
alter table public.intel_posts enable row level security;

-- Policies: start permissive for logged-in users; tighten later.
-- Cities / casinos: readable by authenticated users (admin seeding via service role / dashboard)
drop policy if exists "cities_select_authed" on public.cities;
create policy "cities_select_authed" on public.cities
  for select to authenticated
  using (true);

drop policy if exists "casinos_select_authed" on public.casinos;
create policy "casinos_select_authed" on public.casinos
  for select to authenticated
  using (true);

-- Follows: users manage their own
drop policy if exists "follows_select_own" on public.follows;
create policy "follows_select_own" on public.follows
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete to authenticated
  using (auth.uid() = user_id);

-- Posts: readable by authenticated; authors can insert and edit/delete their own
drop policy if exists "intel_posts_select_authed" on public.intel_posts;
create policy "intel_posts_select_authed" on public.intel_posts
  for select to authenticated
  using (true);

drop policy if exists "intel_posts_insert_own" on public.intel_posts;
create policy "intel_posts_insert_own" on public.intel_posts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "intel_posts_update_own" on public.intel_posts;
create policy "intel_posts_update_own" on public.intel_posts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "intel_posts_delete_own" on public.intel_posts;
create policy "intel_posts_delete_own" on public.intel_posts
  for delete to authenticated
  using (auth.uid() = user_id);

