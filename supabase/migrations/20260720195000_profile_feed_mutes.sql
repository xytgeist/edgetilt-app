-- Hide a member's Lounge posts from the muter's home/following feed (client + future RPC filter).

create table if not exists public.profile_feed_mutes (
  muter_id uuid not null references auth.users (id) on delete cascade,
  muted_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_feed_mutes_pk primary key (muter_id, muted_user_id),
  constraint profile_feed_mutes_no_self check (muter_id <> muted_user_id)
);

create index if not exists profile_feed_mutes_muted_user_idx on public.profile_feed_mutes (muted_user_id);

alter table public.profile_feed_mutes enable row level security;

drop policy if exists profile_feed_mutes_select_own on public.profile_feed_mutes;
create policy profile_feed_mutes_select_own on public.profile_feed_mutes
  for select to authenticated
  using (auth.uid() = muter_id);

drop policy if exists profile_feed_mutes_insert_own on public.profile_feed_mutes;
create policy profile_feed_mutes_insert_own on public.profile_feed_mutes
  for insert to authenticated
  with check (auth.uid() = muter_id);

drop policy if exists profile_feed_mutes_delete_own on public.profile_feed_mutes;
create policy profile_feed_mutes_delete_own on public.profile_feed_mutes
  for delete to authenticated
  using (auth.uid() = muter_id);

comment on table public.profile_feed_mutes is
  'Viewer hides an author''s community_feed_posts from their Lounge timeline (app-side filter v1).';
