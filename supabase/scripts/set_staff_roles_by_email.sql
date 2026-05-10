-- Promote staff by email — run in Supabase **Dashboard → SQL Editor** (postgres role; bypasses RLS).
--
-- `profiles_enforce_role_change` normally requires the session user to already be an admin.
-- The SQL editor has no JWT, so we briefly disable that trigger, apply updates, then re-enable it.
--
-- Requires an existing `public.profiles` row for each auth user (same `user_id` as `auth.users.id`).
-- This repo does **not** auto-insert into `profiles` on signup; rows are created when that account
-- signs into the app (`ensureDefaultProfileRow` in App). If someone exists only in `auth.users`
-- and never got a profile row, the UPDATE below matches **zero rows** for them (no error).

begin;

alter table public.profiles disable trigger trg_profiles_enforce_role;

-- Admin
update public.profiles p
set
  role = 'admin',
  updated_at = now()
from auth.users u
where
  p.user_id = u.id
  and lower(u.email) = lower('investigence@gmail.com');

-- Moderators
update public.profiles p
set
  role = 'moderator',
  updated_at = now()
from auth.users u
where
  p.user_id = u.id
  and lower(u.email) in (
    'kennynorman@gmail.com',
    'reachselena@gmail.com',
    'xytgeist@gmail.com'
  );

alter table public.profiles enable trigger trg_profiles_enforce_role;

commit;

-- Verify (expect one admin row + three moderator rows among these emails)
select u.email, p.role, p.handle
from public.profiles p
join auth.users u on u.id = p.user_id
where
  lower(u.email) = any (
    array[
      'investigence@gmail.com',
      'kennynorman@gmail.com',
      'reachselena@gmail.com',
      'xytgeist@gmail.com'
    ]
  )
order by u.email;

-- If roles look correct here but Lounge shields are missing, clients may still be showing
-- a feed loaded before the update: pull-to-refresh or reload the app so posts re-hydrate from `profiles.role`.

-- ---------------------------------------------------------------------------
-- Diagnose: staff emails that have Auth but NO `public.profiles` row
-- (moderator/admin UPDATE above did nothing for them until a profile exists.)
-- ---------------------------------------------------------------------------
select
  u.id as auth_user_id,
  u.email,
  u.created_at as auth_created_at
from auth.users u
where
  lower(u.email) = any (
    array[
      'investigence@gmail.com',
      'kennynorman@gmail.com',
      'reachselena@gmail.com',
      'xytgeist@gmail.com'
    ]
  )
  and not exists (select 1 from public.profiles p where p.user_id = u.id)
order by u.email;
