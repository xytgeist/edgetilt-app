# Production rollout checklist (mirror from **test**)

**Workflow:** Ship the **full feature set on `test` first** (app + Supabase schema, RLS, Edge Functions, Vercel preview against test). Use this checklist only when you are ready to **replay** everything on **production** so prod never drifts behind what you validated on test.

Use this when merging **`test` → production** so parity gaps aren’t missed.  
Treat **`jtjgtucumuoswnbauxry`** as reference (**test**) unless documented elsewhere — **`wedrhwtsxifbnnbgxdkm`** is the (**production**) Supabase project ref inferred from `.env.supabase.production`.

**Doc routing for agents:** Root **`AGENTS.md`** explains when to edit this file vs `docs/test-buildout-backlog.md` vs roadmap after infra or smoke changes.

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
- [ ] `profiles_tier_testing.sql` — **`has_active_subscription`** + guard trigger (subscriber UI + testing; run after phase A file)
- [ ] **`lounge_feed_post_stream_video.sql`** — **`community_feed_posts.stream_video_uid`** plus optional **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`** (stored tile poster in `lounge-feed` + layout dims) for Lounge **Cloudflare Stream** video posts (required before current client inserts video)
- [ ] **Lounge Stream purge (cron):** run migrations **`20260509180000_lounge_cf_stream_purge_pg_cron.sql`**, **`20260512120000_lounge_cf_stream_purge_normalize_vault_secrets.sql`**, **`20260515120000_lounge_cf_stream_purge_invoke_options.sql`** (or `supabase db push --linked`) on **production** after enabling extensions **`pg_cron`** and **`pg_net`**. Create Vault secrets **`lounge_cf_stream_purge_http_secret`** (same value as Edge **`LOUNGE_CF_STREAM_PURGE_SECRET`**) and **`lounge_cf_stream_purge_supabase_anon_key`** (project anon / publishable per purge **`README.md`**). Optional: `select public.invoke_lounge_cf_stream_purge_pending();` then inspect **`net._http_response`**.
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
supabase functions deploy lounge-cf-stream-direct-upload
supabase functions deploy lounge-cf-stream-delete-video
supabase functions deploy lounge-cf-stream-delete-orphan
supabase functions deploy lounge-cf-stream-purge-pending-uploads
```

Deploy **`lounge-cf-stream-purge-pending-uploads`** from a repo copy that includes **`supabase/config.toml`** (`verify_jwt = false` for that function) so **`sb_*`** gateway keys work when used from Vault.

Set **production** Edge secrets for Stream (same **names** as test; rotate values independently):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `LOUNGE_CF_STREAM_PURGE_SECRET` (required for **`lounge-cf-stream-purge-pending-uploads`** only; must match Vault **`lounge_cf_stream_purge_http_secret`** if you use the pg_cron job). **`lounge-cf-stream-delete-orphan`** uses the **caller's Supabase JWT** (same pattern as **`lounge-cf-stream-direct-upload`**), not this secret.

Cross-check dashboards: **Production** function list versus **test** (names active, versions reasonable).

Secrets (secrets / env vault in Supabase) for push + web-push must exist on production — mirror **test** configuration.

---

## 5. Post-deploy smoke (application)

- [ ] Logged-out: **Home feed** renders (requires **anon** SELECT on visible posts — Phase A migration).
- [ ] Optional — **pinned announcement:** if you use one in prod, confirm it appears first (ordering only; there is still **no in-app staff pin UI** — parity with test seed/SQL or a future mod tool per `docs/test-buildout-backlog.md` Phase B).
- [ ] Signed-in: **Guides → Ask community** still inserts (`community_feed_posts`) when RLS permits.
- [ ] Profiles: until onboarding ships, authors may appear as **`Member`** with no profiles row — expected until Account/gate UX exists.
- [ ] **`get-web-push-config`**: authenticated `GET` → `200` with `publicKey` (mirror prior smoke checklist).
- [ ] **Lounge video (Cloudflare Stream):** post a short clip (composer, under **60 seconds**) from Lounge; it plays in feed/detail via HLS. Requires **`lounge_feed_post_stream_video.sql`** on the DB, **`lounge-cf-stream-direct-upload`** and **`lounge-cf-stream-delete-video`** deployed, and Edge secrets **`CLOUDFLARE_ACCOUNT_ID`** / **`CLOUDFLARE_STREAM_API_TOKEN`** on that Supabase project. Delete the post and confirm the asset disappears from Cloudflare Stream (or returns 404 if re-deleted). If you use **purge cron** on prod, mirror **§2** migrations + **§4** **`LOUNGE_CF_STREAM_PURGE_SECRET`** / Vault parity and spot-check **`cron.job`** + **`net._http_response`** after a manual invoke.

---

## 6. Ongoing parity rule

Whenever you merge a feature touching **Supabase** on **`test`**, append a bullet under **§2 or §4** in this checklist (migration path + Edge deploy list) until you adopt formal versioned migrations (e.g. `supabase/migrations/*.sql`) for both environments.

Working file for day-to-day buildout tracking: `docs/test-buildout-backlog.md`. Keep that file current during test development, then execute this checklist at promotion time.

Suggested future tightening:

- [ ] Migrate ad-hoc `supabase/*.sql` into **numbered `supabase/migrations/`** and run `supabase db push`/CI on both environments.
- [ ] Store **project ref** alignment in README or Ops doc (still no secrets).

---

## 7. Legal / storefront (parallel track — not infra)

Already planned for Slot Pro backlog; prod cutover reminders:

- [ ] Hosted **Terms**, **Privacy**, **Community guidelines** URLs (counsel-reviewed; entity **Quantum Capital Ventures, LLC, Wyoming** per your backlog).
- [ ] In-app links + signup acceptance flows when those ship.

---

_Last updated: Lounge **Cloudflare Stream** (`stream_video_uid`, direct-upload, delete-video, delete-orphan, purge + pg_cron migrations / Vault). Frontend layout map: `docs/frontend-architecture.md`._
