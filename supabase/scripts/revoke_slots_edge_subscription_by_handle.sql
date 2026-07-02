-- Revoke Slots Edge test access by Lounge handle — run in Supabase **Dashboard → SQL Editor** (test sandbox).
--
-- Use this to flip a real Stripe test subscriber back to free tier without waiting on Stripe cancel webhooks.
-- After running: have the user **hard-reload** the app (or sign out/in) so entitlements refetch.
--
-- Replace the handle below. Does NOT cancel the Stripe subscription (see note at bottom).

begin;

-- 1) Mark Edge subscription rows inactive (entitlements + legacy sync read this table)
update public.user_subscriptions us
set
  status = 'canceled',
  cancel_at_period_end = false,
  updated_at = now()
from public.profiles p
where
  us.user_id = p.user_id
  and lower(p.handle) = lower('smokewagon')
  and us.product_slug in ('slots-edge', 'slots-edge-starter', 'slots-edge-lifetime');

-- 2) Legacy boolean (Full Edge only) — kept in sync via RPC
select public.sync_profile_has_active_subscription(p.user_id)
from public.profiles p
where lower(p.handle) = lower('smokewagon');

commit;

-- Verify: expect zero active/trialing rows; has_active_subscription = false
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

-- Stripe note: this script does not call Stripe. The test subscription may still show "active"
-- in Stripe Dashboard until you cancel via Customer Portal or Stripe test mode.
-- For UI/freemium testing, SQL revoke is enough. For webhook cancel smoke, cancel in Stripe instead.
