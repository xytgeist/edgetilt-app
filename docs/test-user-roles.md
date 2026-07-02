# Test user tiers (roles + subscriber flag)

Use this to exercise **staff**, **paid subscriber** (hamburger locks off), and **free member** (locks on Calcs / Guides / Bankroll) in the app.

## 1. Apply SQL on Supabase (test first)

Run in the **Supabase SQL Editor** (same project as your `VITE_*` keys), **after** `feed_phase_a_profiles_public_read.sql`:

- **`supabase/profiles_tier_testing.sql`** — adds `profiles.has_active_subscription` and a trigger so normal users **cannot** flip that flag via the public API (only **staff** or **SQL / service role**).

## 2. Tiers at a glance

| What you want | `profiles.role` | `profiles.has_active_subscription` |
| --- | --- | --- |
| Free member (default) | `user` | `false` |
| Paid subscriber (no staff powers) | `user` | `true` |
| Moderator | `moderator` | `true` or `false` (locks hidden either way) |
| Admin | `admin` | your choice |

**Reload the app** after changing rows in SQL so `App.jsx` refetches profile (session `user_id` unchanged).

## 3. SQL snippets (replace emails)

Resolve `user_id` from email:

```sql
select id, email from auth.users where lower(email) = lower('you@example.com');
```

**Make yourself admin:**

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('you@example.com');
```

**Promote another member to moderator (in app):** sign in as **admin** → open their Lounge profile → **⋯** menu → **Promote to moderator**. Requires **`supabase/admin_set_profile_role.sql`** (or migration **`20260518120000_admin_set_profile_role.sql`**) on the Supabase project.

**Promote via SQL** (dashboard / bootstrap): `supabase/scripts/set_staff_roles_by_email.sql` or:

```sql
update public.profiles p
set role = 'moderator'
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('moderator-test@example.com');
```

**Mark a test account as subscriber:**

```sql
update public.profiles p
set has_active_subscription = true
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('subscriber-test@example.com');
```

**Back to free member:**

```sql
update public.profiles p
set role = 'user', has_active_subscription = false
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('subscriber-test@example.com');
```

## 4. Slots Edge via `user_subscriptions` (Stripe-shaped testing)

After migration **`20260526120000_edge_subscriptions.sql`**, prefer product rows over flipping the legacy boolean alone:

```sql
-- Grant slots-edge without Stripe (test only; use service role / SQL editor)
insert into public.user_subscriptions (
  user_id, product_slug, stripe_subscription_id, stripe_customer_id, status
)
select
  p.user_id,
  'slots-edge',
  'test_sub_' || p.user_id::text,
  coalesce(p.stripe_customer_id, 'test_cus_' || p.user_id::text),
  'active'
from public.profiles p
join auth.users u on u.id = p.user_id
where lower(u.email) = lower('subscriber-test@example.com')
on conflict (user_id, product_slug) do update set status = excluded.status;

select public.sync_profile_has_active_subscription(p.user_id)
from public.profiles p
join auth.users u on u.id = p.user_id
where lower(u.email) = lower('subscriber-test@example.com');
```

Client entitlements: **`get_my_entitlements()`** → `{ "slots-edge": { "active": true, … } }`.

**Grant Starter only** (2019-and-older guide pack; no full library / tool unlocks):

```sql
insert into public.subscription_products (slug, display_name, description, active, sort_order)
values (
  'slots-edge-starter',
  'Slots Edge Starter',
  'Starter guide pack (2019 and older) plus weekly premium guide drops.',
  true,
  5
)
on conflict (slug) do nothing;

insert into public.user_subscriptions (
  user_id, product_slug, stripe_subscription_id, stripe_customer_id, status
)
select
  p.user_id,
  'slots-edge-starter',
  'test_starter_sub_' || p.user_id::text,
  coalesce(p.stripe_customer_id, 'test_cus_' || p.user_id::text),
  'active'
from public.profiles p
join auth.users u on u.id = p.user_id
where lower(u.email) = lower('starter-test@example.com')
on conflict (user_id, product_slug) do update set status = excluded.status;
```

Client entitlements: **`get_my_entitlements()`** → `{ "slots-edge-starter": { "active": true, … } }`. Reload app after SQL.

**Grant Lifetime (test only):**

```sql
insert into public.user_subscriptions (
  user_id, product_slug, stripe_subscription_id, stripe_customer_id, status
)
select
  p.user_id,
  'slots-edge-lifetime',
  'test_lifetime_' || p.user_id::text,
  coalesce(p.stripe_customer_id, 'test_cus_' || p.user_id::text),
  'active'
from public.profiles p
where lower(p.handle) = lower('smokewagon')
on conflict (user_id, product_slug) do update set status = excluded.status;

select public.sync_profile_has_active_subscription(p.user_id)
from public.profiles p
where lower(p.handle) = lower('smokewagon');
```

**Revoke all Slots Edge access (quick free-tier reset for testing):**

By **handle** (e.g. `@smokewagon`) ... **deletes** `user_subscriptions` rows (cleanest retest):

```sql
delete from public.user_subscriptions us
using public.profiles p
where us.user_id = p.user_id
  and lower(p.handle) = lower('smokewagon');

select public.sync_profile_has_active_subscription(p.user_id)
from public.profiles p
where lower(p.handle) = lower('smokewagon');
```

Full script with verify query: **`supabase/scripts/revoke_slots_edge_subscription_by_handle.sql`**.

**Do not** flip **`has_active_subscription` alone** ... **`get_my_entitlements()`** still reads active rows from **`user_subscriptions`**. Reload the app after revoke.

Stripe may still show an active subscription until you cancel in **Stripe Dashboard** or via **Manage membership → Cancel in Stripe** (portal cancel flow: **`supabase/functions/stripe-create-portal-session/README.md`**).

Optional: delete **`starter_weekly_guide_unlocks`** for that user if you need a clean Starter weekly-drop retest (see script comment).

### Weekly premium drop (test)

Apply migrations **`20260701130000`** + **`20260702120000_starter_weekly_drop_reveal_cron.sql`**, redeploy **`lounge-send-activity-push`**, then either:

**A. Full job (all active Starter subs):**

```sql
select public.run_starter_weekly_guide_drop_job();
```

**B. Single-user grant + notification (simulates one cron row):**

```sql
select public.grant_starter_weekly_guide_drop(
  (select id from auth.users where lower(email) = lower('starter-test@example.com'))
);
-- Then insert activity row (requires @edgelord profile):
select public.starter_weekly_drop_create_activity_event(
  (select id from auth.users where lower(email) = lower('starter-test@example.com')),
  (select id from public.starter_weekly_guide_unlocks order by granted_at desc limit 1)
);
```

**C. Manual row (specific slug, no notification):**

```sql
insert into public.starter_weekly_guide_unlocks (user_id, guide_slug, drop_week)
select
  u.id,
  'stack-up-pays',  -- any published 2020+ slug not already granted
  date_trunc('week', timezone('UTC', now()))::date
from auth.users u
where lower(u.email) = lower('starter-test@example.com')
on conflict (user_id, guide_slug) do nothing;
```

Reload app. **`get_my_starter_weekly_guide_slugs()`** should include the slug; AP Guides + paired calculator should unlock for that title.

## 5. Local env override

`VITE_HAS_ACTIVE_SUBSCRIPTION=true` in **`.env.local`** still forces **subscriber UI for every logged-in user** (useful for a quick check). Remove it when testing **per-row** `has_active_subscription`.

## 6. No profile row yet

If `profiles` has no row for the user, the app treats them as non-staff / non-subscriber until a row exists (e.g. after profile completion in Lounge/Guides). Create or complete profile, then **reload** if you just added SQL flags.
