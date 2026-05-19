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

## 4. Local env override

`VITE_HAS_ACTIVE_SUBSCRIPTION=true` in **`.env.local`** still forces **subscriber UI for every logged-in user** (useful for a quick check). Remove it when testing **per-row** `has_active_subscription`.

## 5. No profile row yet

If `profiles` has no row for the user, the app treats them as non-staff / non-subscriber until a row exists (e.g. after profile completion in Lounge/Guides). Create or complete profile, then **reload** if you just added SQL flags.
