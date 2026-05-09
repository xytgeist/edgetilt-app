# Production rollout checklist (mirror from **test**)

Use this when merging **`test` → production** so parity gaps aren’t missed.  
Treat **`jtjgtucumuoswnbauxry`** as reference (**test**) unless documented elsewhere — **`wedrhwtsxifbnnbgxdkm`** is the (**production**) Supabase project ref inferred from `.env.supabase.production`.

**Do not paste secrets into this file.** Rotate secrets independently via dashboards/Vercel.

---

## 1. Prerequisites before flipping prod traffic

- [ ] Confirm **`origin/main`** (or whichever Git/Vercel branch fronts **`lvslotpro.com`)**) carries exactly what should ship.
- [ ] Confirm **`production`** Supabase project ref **`wedrhwtsxifbnnbgxdkm`** is intentional CLI/UI link (`supabase link --project-ref wedrhwtsxifbnnbgxdkm`).
- [ ] Confirm **Vercel** production env has **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`** (and any other `VITE_*`) pointed at **production**.
- [ ] Prefer a **no-op or tagged deploy** after env changes if clients cache aggressively.

---

## 2. Database — SQL to run in production (order matters)

Apply in the **Supabase Dashboard → SQL Editor** for **production**, or via CLI from this repo after linking production:

```bash
supabase link --project-ref wedrhwtsxifbnnbgxdkm --yes
supabase db query --linked -f supabase/community_feed_posts.sql
supabase db query --linked -f supabase/feed_phase_a_profiles_public_read.sql
```

Track **everything else** already used on test that production must also have applied (reconcile against test SQL history / migrations folder). Common project shapes include (verify test actually has these before copying blindly):

- [ ] `community_feed_posts.sql` — base home feed table + baseline trigger
- [ ] `feed_phase_a_profiles_public_read.sql` — **`profiles`**, moderation columns, **public anon read** RLS, staff policies, guards
- [ ] Any earlier schema you rely on: **`offers`** / **`offer_events`**, **`push_subscriptions`**, notification SQL, etc. — mirror **test** `supabase/` files that are not yet on prod

**After deploy — quick smoke SQL (production):**

```sql
select to_regclass('public.profiles')       as profiles_tbl,
       to_regclass('public.community_feed_posts') as feed_posts_tbl;
```

Expect both non-null.

---

## 3. First admin & staff bootstrap (production)

`profiles.role` changes are **admin-only** via trigger. No row → no admin bypass from the app.

After your **production** user creates their first `profiles` row (from the future Account / gate flow, or a one-off authenticated insert from a trusted path):

```sql
-- Replace <YOUR_USER_UUID> with auth.users.id (production).
update public.profiles
set role = 'admin'
where user_id = '<YOUR_USER_UUID>';
```

Prefer running as **postgres / service role** in SQL editor if RLS interferes during bootstrap.

Moderators → `role = 'moderator'` same way, logged in as existing **admin**.

---

## 4. Supabase Edge Functions (parity with **test**)

After DB + env are correct, redeploy edge functions whose **logical code lives in repo** (`supabase/functions/…`) against **production** so versions don’t drift:

```bash
supabase link --project-ref wedrhwtsxifbnnbgxdkm --yes
supabase functions deploy process-offer-uploads
supabase functions deploy get-web-push-config
supabase functions deploy send-test-push
supabase functions deploy send-due-offer-reminders
```

Cross-check dashboards: **Production** function list versus **test** (names active, versions reasonable).

Secrets (secrets / env vault in Supabase) for push + web-push must exist on production — mirror **test** configuration.

---

## 5. Post-deploy smoke (application)

- [ ] Logged-out: **Home feed** renders (requires **anon** SELECT on visible posts — Phase A migration).
- [ ] Signed-in: **Guides → Ask community** still inserts (`community_feed_posts`) when RLS permits.
- [ ] Profiles: until onboarding ships, authors may appear as **`Member`** with no profiles row — expected until Account/gate UX exists.
- [ ] **`get-web-push-config`**: authenticated `GET` → `200` with `publicKey` (mirror prior smoke checklist).
- [ ] Regression: Offers save, calendars, calculators as before.

---

## 6. Ongoing parity rule

Whenever you merge a feature touching **Supabase** on **`test`**, append a bullet under **§2 or §4** in this checklist (migration path + Edge deploy list) until you adopt formal versioned migrations (e.g. `supabase/migrations/*.sql`) for both environments.

Suggested future tightening:

- [ ] Migrate ad-hoc `supabase/*.sql` into **numbered `supabase/migrations/`** and run `supabase db push`/CI on both environments.
- [ ] Store **project ref** alignment in README or Ops doc (still no secrets).

---

## 7. Legal / storefront (parallel track — not infra)

Already planned for Slot Pro backlog; prod cutover reminders:

- [ ] Hosted **Terms**, **Privacy**, **Community guidelines** URLs (counsel-reviewed; entity **Quantum Capital Ventures, LLC, Wyoming** per your backlog).
- [ ] In-app links + signup acceptance flows when those ship.

---

_Last updated alongside social feed Phase A profiles + public read (`feed_phase_a_profiles_public_read`)._
