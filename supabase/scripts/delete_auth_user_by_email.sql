-- Remove an Auth user (and cascaded app rows) by email — run in Supabase **Dashboard → SQL Editor**
-- on the **test** project only. Uses the built-in postgres role (bypasses RLS).
--
-- Cascades (when FKs use ON DELETE CASCADE) typically include at least:
--   public.profiles, public.community_feed_posts, offers/push tables that reference auth.users(id).
--
-- After this, the email is free to sign up again for a clean E2E run.

-- 1) Preview (optional — comment out step 2 until you are satisfied)
select id, email, created_at, last_sign_in_at
from auth.users
where lower(email) = lower('bryanfranzen16@gmail.com');

-- 2) Delete Auth user (removes the row that stores this email in auth.users)
delete from auth.users
where lower(email) = lower('bryanfranzen16@gmail.com');

-- 3) Verify gone
select id, email from auth.users where lower(email) = lower('bryanfranzen16@gmail.com');
