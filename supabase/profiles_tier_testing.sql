-- Tier testing: subscription flag + guard (run on **test** first; safe to re-run).
-- Apply after `feed_phase_a_profiles_public_read.sql` (profiles table exists).
--
-- Client (`App.jsx`) reads `role` and `has_active_subscription` for hamburger locks and future paywalls.

-- ---------------------------------------------------------------------------
-- 1) Column: paid subscriber (Stripe webhook should set this in production)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists has_active_subscription boolean not null default false;

comment on column public.profiles.has_active_subscription is
  'UI: treat as active paid subscriber (hamburger unlocks). Prefer updating via Edge/service role + Stripe webhooks in production.';

-- ---------------------------------------------------------------------------
-- 2) Prevent normal users from flipping their own flag via the anon API key
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_subscription_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.has_active_subscription is not distinct from old.has_active_subscription then
    return new;
  end if;
  -- Dashboard SQL / superuser (no JWT)
  if auth.uid() is null then
    return new;
  end if;
  if public.current_user_has_staff_role() then
    return new;
  end if;
  raise exception 'has_active_subscription may only be changed by staff or service role / SQL editor';
end;
$$;

drop trigger if exists trg_profiles_guard_subscription_flag on public.profiles;
create trigger trg_profiles_guard_subscription_flag
  before update on public.profiles
  for each row
  execute function public.profiles_guard_subscription_flag();

-- ---------------------------------------------------------------------------
-- 3) Example updates (replace emails; run in Supabase SQL Editor as postgres)
-- ---------------------------------------------------------------------------
-- Promote your account to admin (full access + can change subscription flags for anyone via SQL):
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.user_id = u.id and lower(u.email) = lower('you@example.com');
--
-- Moderator (same pattern, role = 'moderator'):
-- update public.profiles p set role = 'moderator' ...
--
-- Reset to normal member:
-- update public.profiles p set role = 'user' ...
--
-- Mark one user as **paid subscriber** (read by app; self-serve API updates blocked unless staff):
-- update public.profiles p
-- set has_active_subscription = true
-- from auth.users u
-- where p.user_id = u.id and lower(u.email) = lower('subscriber-test@example.com');
--
-- Clear subscriber flag:
-- update public.profiles p
-- set has_active_subscription = false
-- from auth.users u
-- where p.user_id = u.id and lower(u.email) = lower('subscriber-test@example.com');
