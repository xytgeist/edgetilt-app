-- Delete Slots Edge test access by Lounge handle — run in Supabase **Dashboard → SQL Editor** (test sandbox).
--
-- Use this to reset a test account (e.g. @smokewagon) so checkout / upgrade / cancel flows can be retried.
-- After running: have the user **hard-reload** the app (or sign out/in) so entitlements refetch.
--
-- Replace the handle below. Does NOT cancel Stripe subscriptions (see note at bottom).

begin;

-- 1) Remove all Edge entitlement rows for this user (cleanest retest; avoids unique-key leftovers)
delete from public.user_subscriptions us
using public.profiles p
where
  us.user_id = p.user_id
  and lower(p.handle) = lower('smokewagon');

-- 2) Legacy boolean (Full Edge only) — kept in sync via RPC
select public.sync_profile_has_active_subscription(p.user_id)
from public.profiles p
where lower(p.handle) = lower('smokewagon');

commit;

-- Verify: no user_subscriptions rows; has_active_subscription = false
select
  p.handle,
  p.has_active_subscription,
  p.stripe_customer_id,
  us.product_slug,
  us.status,
  us.stripe_subscription_id
from public.profiles p
left join public.user_subscriptions us on us.user_id = p.user_id
where lower(p.handle) = lower('smokewagon')
order by us.product_slug nulls last;

-- Optional: wipe Starter weekly drops so guide unlocks match a fresh Starter test
-- delete from public.starter_weekly_guide_unlocks sw
-- using public.profiles p
-- where sw.user_id = p.user_id and lower(p.handle) = lower('smokewagon');

-- Stripe note: this script does not call Stripe. Active subs may still show in Stripe Dashboard
-- until you cancel them there (Customers → select customer → cancel subscription) or use
-- Settings → Manage membership → Cancel in Stripe after redeploying stripe-create-portal-session.
-- For app/freemium retest, SQL delete is enough. For webhook cancel smoke, cancel in Stripe too.
