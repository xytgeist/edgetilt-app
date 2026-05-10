-- Lounge full-screen profile: banner, about (140), follows, post notification subscriptions.
-- Run in Supabase SQL editor after feed_phase_a_profiles_public_read.sql.
-- Includes `profile-banners` storage bucket + RLS (same pattern as `profile-avatars` in feed_phase_a).

alter table public.profiles
  add column if not exists banner_url text;

alter table public.profiles
  add column if not exists about_me text;

alter table public.profiles
  drop constraint if exists profiles_about_me_len;

alter table public.profiles
  add constraint profiles_about_me_len check (about_me is null or char_length(about_me) <= 140);

comment on column public.profiles.banner_url is 'Optional wide banner shown on full-screen profile.';
comment on column public.profiles.about_me is 'Short public bio on profile (max 140 chars). Distinct from gate bio.';

-- Who follows whom (viewer is follower_id when they tap Follow on publisher following_id).
create table if not exists public.profile_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_follows_pk primary key (follower_id, following_id),
  constraint profile_follows_no_self check (follower_id <> following_id)
);

create index if not exists profile_follows_following_idx on public.profile_follows (following_id);
create index if not exists profile_follows_follower_idx on public.profile_follows (follower_id);

alter table public.profile_follows enable row level security;

drop policy if exists profile_follows_select_all on public.profile_follows;
create policy profile_follows_select_all on public.profile_follows
  for select to anon, authenticated
  using (true);

drop policy if exists profile_follows_insert_own on public.profile_follows;
create policy profile_follows_insert_own on public.profile_follows
  for insert to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists profile_follows_delete_own on public.profile_follows;
create policy profile_follows_delete_own on public.profile_follows
  for delete to authenticated
  using (auth.uid() = follower_id);

-- Subscriber wants push-style notifications for a publisher's posts (app wiring later).
create table if not exists public.profile_post_subscriptions (
  subscriber_id uuid not null references auth.users (id) on delete cascade,
  publisher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_post_subscriptions_pk primary key (subscriber_id, publisher_id),
  constraint profile_post_subscriptions_no_self check (subscriber_id <> publisher_id)
);

create index if not exists profile_post_subscriptions_publisher_idx on public.profile_post_subscriptions (publisher_id);

alter table public.profile_post_subscriptions enable row level security;

drop policy if exists profile_post_subscriptions_select_own on public.profile_post_subscriptions;
create policy profile_post_subscriptions_select_own on public.profile_post_subscriptions
  for select to authenticated
  using (auth.uid() = subscriber_id);

drop policy if exists profile_post_subscriptions_insert_own on public.profile_post_subscriptions;
create policy profile_post_subscriptions_insert_own on public.profile_post_subscriptions
  for insert to authenticated
  with check (auth.uid() = subscriber_id);

drop policy if exists profile_post_subscriptions_delete_own on public.profile_post_subscriptions;
create policy profile_post_subscriptions_delete_own on public.profile_post_subscriptions
  for delete to authenticated
  using (auth.uid() = subscriber_id);

-- ---------------------------------------------------------------------------
-- Profile banners storage (upload path: {user_id}/... — same as profile-avatars)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-banners', 'profile-banners', true)
on conflict (id) do nothing;

drop policy if exists "profile_banners_insert_own" on storage.objects;
create policy "profile_banners_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_banners_update_own" on storage.objects;
create policy "profile_banners_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_banners_delete_own" on storage.objects;
create policy "profile_banners_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);
