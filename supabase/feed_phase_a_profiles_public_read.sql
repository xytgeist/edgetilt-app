-- Phase A — Social feed foundation: profiles + post moderation columns + public read for anon.
-- Apply in Supabase SQL editor AFTER `community_feed_posts.sql` (or merge into a fresh env).
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS where appropriate.

-- ---------------------------------------------------------------------------
-- 1) Profiles (handles, avatar, moderation role, bans)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text not null,
  display_name text not null default '',
  avatar_url text,
  bio text,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_chars check (
    handle ~ '^[a-z0-9_]{2,30}$'
  ),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 160)
);

create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle));

alter table public.profiles enable row level security;

-- Helper used by policies/triggers to avoid self-referential policy recursion on
-- `public.profiles` while checking current user role.
create or replace function public.current_user_has_staff_role()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('moderator', 'admin')
  );
$$;

grant execute on function public.current_user_has_staff_role() to anon, authenticated;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (banned_at is null);

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.current_user_has_staff_role());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = user_id and role = 'user');

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.profiles is
  'Public identity for Slot Pro feed; handle unique case-insensitive (stored lowercase).';

-- Only admins may change role (e.g. promote moderator) — set your first admin via SQL.
create or replace function public.profiles_enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff cannot be demoted to `user` by their own profile save (partial upserts / omitted role).
  -- Demote via SQL editor (postgres) or an admin JWT path; client upserts must not clear `role`.
  if tg_op = 'UPDATE'
     and old.role in ('moderator', 'admin')
     and new.role = 'user'
     and auth.uid() is not null
     and auth.uid() = new.user_id then
    new.role := old.role;
  end if;

  if new.role is distinct from old.role then
    if not exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    ) then
      raise exception 'Role change requires admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_role on public.profiles;
create trigger trg_profiles_enforce_role
  before update on public.profiles
  for each row
  execute function public.profiles_enforce_role_change();

-- Authors may only edit content-ish columns; staff may edit moderation / pin / counts.
create or replace function public.community_feed_posts_author_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff boolean;
begin
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('moderator', 'admin')
  )
  into staff;

  if staff then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() = old.user_id then
    if new.hidden_at is distinct from old.hidden_at
      or new.hidden_reason is distinct from old.hidden_reason
      or new.needs_mod_review is distinct from old.needs_mod_review
      or new.pinned is distinct from old.pinned
      or new.like_count is distinct from old.like_count
      or new.comment_count is distinct from old.comment_count
      or new.user_id is distinct from old.user_id
    then
      raise exception 'Not allowed to change moderation or engagement fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_author_guard on public.community_feed_posts;
create trigger trg_community_feed_posts_author_guard
  before update on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_author_guard();

-- ---------------------------------------------------------------------------
-- 2) Extend community_feed_posts
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts
  add column if not exists edited_at timestamptz;

alter table public.community_feed_posts
  add column if not exists hidden_at timestamptz;

alter table public.community_feed_posts
  add column if not exists hidden_reason text;

alter table public.community_feed_posts
  add column if not exists needs_mod_review boolean not null default false;

alter table public.community_feed_posts
  add column if not exists pinned boolean not null default false;

alter table public.community_feed_posts
  add column if not exists like_count integer not null default 0;

alter table public.community_feed_posts
  add column if not exists comment_count integer not null default 0;

-- Canonical v1 text field (280 chars). Legacy `title`/`body` removed after backfill.
alter table public.community_feed_posts
  add column if not exists caption text;

-- One-time backfill when upgrading from pre-A2 schema (columns dropped afterward).
do $migration$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'community_feed_posts'
      and c.column_name = 'body'
  ) then
    update public.community_feed_posts
    set caption = left(
      coalesce(
        nullif(trim(caption), ''),
        nullif(trim(body), ''),
        nullif(trim(title), ''),
        ''
      ),
      280
    )
    where caption is null;
  else
    update public.community_feed_posts
    set caption = coalesce(nullif(trim(caption), ''), '')
    where caption is null;
  end if;
end;
$migration$;

alter table public.community_feed_posts
  alter column caption set not null;

alter table public.community_feed_posts
  alter column caption set default '';

alter table public.community_feed_posts
  drop constraint if exists community_feed_posts_caption_len_check;

alter table public.community_feed_posts
  add constraint community_feed_posts_caption_len_check
  check (char_length(caption) <= 280);

alter table public.community_feed_posts drop column if exists body;
alter table public.community_feed_posts drop column if exists title;

comment on column public.community_feed_posts.hidden_at is 'When set, post is withheld from public feed (moderation).';
comment on column public.community_feed_posts.pinned is 'Staff: at most two visible pinned posts (trigger trg_community_feed_posts_max_two_pins).';
comment on column public.community_feed_posts.caption is 'Canonical feed caption (<= 280 chars).';

-- Touch edited_at when caption changes.
create or replace function public.community_feed_posts_touch_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.caption is distinct from old.caption then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_touch_edited_at on public.community_feed_posts;
create trigger trg_community_feed_posts_touch_edited_at
  before update on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_touch_edited_at();

-- At most two globally pinned posts among non-hidden rows (enforced by trigger).
drop index if exists public.community_feed_single_pinned_idx;
drop trigger if exists trg_community_feed_posts_single_pin on public.community_feed_posts;
drop function if exists public.community_feed_posts_single_pin_enforcer();

create or replace function public.community_feed_posts_enforce_max_two_pins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pinned_other int;
  becoming_pinned boolean;
begin
  becoming_pinned := coalesce(new.pinned, false) is true
    and new.hidden_at is null
    and (
      tg_op = 'INSERT'
      or (tg_op = 'UPDATE' and coalesce(old.pinned, false) is not true)
    );

  if not becoming_pinned then
    return new;
  end if;

  select count(*)::int
  into pinned_other
  from public.community_feed_posts c
  where coalesce(c.pinned, false) is true
    and c.hidden_at is null
    and c.id is distinct from new.id;

  if pinned_other >= 2 then
    raise exception 'MAX_PINNED_POSTS';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_max_two_pins on public.community_feed_posts;
create trigger trg_community_feed_posts_max_two_pins
  before insert or update on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_enforce_max_two_pins();

-- ---------------------------------------------------------------------------
-- 3) RLS — community_feed_posts (public read, authed write)
-- ---------------------------------------------------------------------------
alter table public.community_feed_posts enable row level security;

drop policy if exists community_feed_posts_select_authed on public.community_feed_posts;
drop policy if exists community_feed_posts_insert_own on public.community_feed_posts;
drop policy if exists community_feed_posts_update_own on public.community_feed_posts;
drop policy if exists community_feed_posts_delete_own on public.community_feed_posts;

drop policy if exists community_feed_posts_select_public on public.community_feed_posts;
create policy community_feed_posts_select_public on public.community_feed_posts
  for select to anon, authenticated
  using (hidden_at is null);

drop policy if exists community_feed_posts_insert_authed on public.community_feed_posts;
create policy community_feed_posts_insert_authed on public.community_feed_posts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.banned_at is not null
    )
  );

drop policy if exists community_feed_posts_update_author on public.community_feed_posts;
create policy community_feed_posts_update_author on public.community_feed_posts
  for update to authenticated
  using (
    auth.uid() = user_id
    and created_at >= (now() - interval '30 minutes')
  )
  with check (auth.uid() = user_id);

drop policy if exists community_feed_posts_update_moderator on public.community_feed_posts;
create policy community_feed_posts_update_moderator on public.community_feed_posts
  for update to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('moderator', 'admin')
    )
  )
  with check (true);

drop policy if exists community_feed_posts_delete_author on public.community_feed_posts;
create policy community_feed_posts_delete_author on public.community_feed_posts
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists community_feed_posts_delete_moderator on public.community_feed_posts;
create policy community_feed_posts_delete_moderator on public.community_feed_posts
  for delete to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Rate limiting (A4 foundation) — DB-first posting guard
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  window_start timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_user_kind_window_idx
  on public.rate_limit_events (user_id, kind, window_start desc);

create index if not exists rate_limit_events_created_idx
  on public.rate_limit_events (created_at desc);

comment on table public.rate_limit_events is
  'Append-only rate limit events for DB-backed rolling window enforcement.';

create or replace function public.community_feed_posts_enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_kind text := 'community_post_create';
  v_window interval := interval '10 minutes';
  v_limit integer := 5;
  v_window_start timestamptz;
  v_count integer;
  v_oldest_in_window timestamptz;
  v_retry_seconds integer;
begin
  -- Service-role / SQL-editor writes may not carry auth context; skip limiter there.
  v_uid := auth.uid();
  if v_uid is null then
    return new;
  end if;

  v_window_start := now() - v_window;

  select count(*)
  into v_count
  from public.rate_limit_events e
  where e.user_id = v_uid
    and e.kind = v_kind
    and e.created_at >= v_window_start;

  if v_count >= v_limit then
    select min(e.created_at)
    into v_oldest_in_window
    from public.rate_limit_events e
    where e.user_id = v_uid
      and e.kind = v_kind
      and e.created_at >= v_window_start;

    v_retry_seconds := greatest(
      1,
      ceil(extract(epoch from ((coalesce(v_oldest_in_window, now()) + v_window) - now())))::int
    );

    raise exception 'Rate limit exceeded: retry_in_seconds=% (max % posts per % minutes)', v_retry_seconds, v_limit, extract(epoch from v_window) / 60
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, kind, window_start)
  values (v_uid, v_kind, date_trunc('minute', now()));

  return new;
end;
$$;

drop trigger if exists trg_community_feed_posts_rate_limit on public.community_feed_posts;
create trigger trg_community_feed_posts_rate_limit
  before insert on public.community_feed_posts
  for each row
  execute function public.community_feed_posts_enforce_rate_limit();

-- ---------------------------------------------------------------------------
-- 5) Profile avatars storage bucket (Phase C profile gate)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
