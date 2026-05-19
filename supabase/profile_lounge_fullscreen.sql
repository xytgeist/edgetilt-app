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

alter table public.profiles
  add column if not exists location text;

alter table public.profiles
  drop constraint if exists profiles_location_len;

alter table public.profiles
  add constraint profiles_location_len check (location is null or char_length(location) <= 80);

comment on column public.profiles.location is 'Optional city or custom location shown on Lounge profile (max 80 chars).';

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

-- Handle change cooldown (7 days). Standalone patch: supabase/profile_handle_changed_at.sql
alter table public.profiles
  add column if not exists handle_changed_at timestamptz;

comment on column public.profiles.handle_changed_at is
  'When the user last changed handle; at most one handle change per 7 days (trigger).';

create or replace function public.profiles_enforce_handle_change_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if lower(trim(coalesce(old.handle, ''))) is not distinct from lower(trim(coalesce(new.handle, ''))) then
    return new;
  end if;
  if old.handle_changed_at is not null
     and old.handle_changed_at > (timezone('utc', now()) - interval '7 days') then
    raise exception 'PROFILE_HANDLE_CHANGE_COOLDOWN'
      using message = 'You can only change your handle once every 7 days. Try again later.';
  end if;
  new.handle_changed_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_handle_change_cooldown on public.profiles;
create trigger trg_profiles_handle_change_cooldown
  before update of handle on public.profiles
  for each row
  execute function public.profiles_enforce_handle_change_cooldown();
