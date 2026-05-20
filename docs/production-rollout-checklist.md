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
- [ ] **`profiles_is_og.sql`** — **`profiles.is_og`** boolean + one-time backfill (first 1000 profiles by **`created_at`**, tie-break **`user_id`**); Lounge **`LoungeOgBadge`** reads it (run after phase A **`profiles`** exists)
- [ ] **`profiles_is_og_assign_on_insert.sql`** — trigger: new **`profiles`** rows get **`is_og = true`** while total profile count < 1000 (re-run **`profiles_is_og.sql`** backfill after deploy to fix existing accounts in the cohort)
- [ ] **`profile_follow_edgelord_on_insert.sql`** — AFTER INSERT on **`profiles`**: mutual **`profile_follows`** with handle **`edgelord`** (requires that account to exist; optional backfill block at file bottom for pre-trigger accounts)
- [ ] **`lounge_feed_post_stream_video.sql`** — **`community_feed_posts.stream_video_uid`** plus optional **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`** (stored tile poster on **R2** when configured, else legacy **`lounge-feed`**) for Lounge **Cloudflare Stream** video posts (required before current client inserts video)
- [ ] **`supabase/migrations/20260515180000_feed_comments_body_max_280.sql`** — `feed_comments.body` max **280** (matches captions); truncates existing long rows then replaces **`feed_comments_body_len`** check (**run test before prod**; optional no-op if table empty).
- [ ] **`supabase/migrations/20260515183000_feed_comments_author_update.sql`** — **`feed_comments_update_own`** RLS + **`grant update`** + **`feed_comments_guard_identity_fields`** trigger so authors can **edit** replies from Lounge post detail ⋯ menu (**run after `feed_comments` exists**).
- [ ] **`supabase/migrations/20260515190000_feed_comment_interactions.sql`** — per-comment **`like_count` / `repost_count` / `bookmark_count`** + **`feed_comment_likes` / `feed_comment_reposts` / `feed_comment_bookmarks`** (RLS + triggers). Required for post-detail comment interaction bar counts and toggles (**run after `feed_comments` exists**).
- [ ] **`supabase/migrations/20260518103000_fix_rate_limit_profiles_user_id.sql`** — rate-limit guard uses **`profiles.user_id`** (not stale column name); required for Lounge post rate limiting on current schema.
- [ ] **`supabase/migrations/20260518150000_restore_profile_handle_change_cooldown.sql`** — restore **7-day** handle change cooldown trigger + **`handle_changed_at`** guard after any interim removal migration.
- [ ] **`supabase/migrations/20260518160000_lounge_search_phase_g.sql`** — Phase G **`pg_trgm`** indexes + auth-gated **`lounge_search_posts`** / **`lounge_search_profiles`** (requires **`pg_trgm`** extension; run before dock search smoke).
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

## 3.5 Cloudflare R2 — Lounge feed images (mirror **test**)

Before Edge deploy (§4), set up **production** media on a Cloudflare zone you control (e.g. **`lvslotpro.com`** or future prod domain):

- [ ] **R2 bucket** (e.g. `lounge-media`) in the same CF account as Stream.
- [ ] **Custom domain** on the bucket (e.g. **`media.lvslotpro.com`** for prod; test uses **`media-test.lvslotpro.com`**).
- [ ] **CORS** on bucket: **`AllowedHeaders`** includes **`Content-Type`** and **`Cache-Control`**; **`AllowedOrigins`** include prod app URL(s) + localhost dev.
- [ ] **R2 API token** (Object Read & Write, scoped to bucket) → Supabase Edge secrets (§4).
- [ ] Optional: **Image Resizing** on zone (Pro+) for **`/cdn-cgi/image/`**; else set **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** on Vercel (client-side WebP prep is sufficient for launch).

**One-time legacy migration** (if prod still has **`lounge-feed`** URLs in DB):

1. Deploy **`lounge-cf-r2-migrate-lounge-feed`** (§4).
2. `node scripts/migrate-lounge-feed-to-r2.mjs --target=production --dry-run` then without `--dry-run`.
3. Deploy **`lounge-cf-r2-backfill-cache-control`**; run `node scripts/backfill-r2-cache-control.mjs --target=production`.

Uploads set object metadata **`Cache-Control: public, max-age=31536000, immutable`** (content-addressed keys).

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
supabase functions deploy lounge-cf-r2-direct-upload
supabase functions deploy lounge-cf-r2-delete-object
supabase functions deploy lounge-cf-r2-delete-orphan
# Ops-only (service role bearer); deploy before one-off migrate/backfill, optional to leave deployed:
supabase functions deploy lounge-cf-r2-migrate-lounge-feed
supabase functions deploy lounge-cf-r2-backfill-cache-control
```

Deploy **`lounge-cf-stream-purge-pending-uploads`** from a repo copy that includes **`supabase/config.toml`** (`verify_jwt = false` for that function) so **`sb_*`** gateway keys work when used from Vault.

Set **production** Edge secrets for Stream (same **names** as test; rotate values independently):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `LOUNGE_CF_STREAM_PURGE_SECRET` (required for **`lounge-cf-stream-purge-pending-uploads`** only; must match Vault **`lounge_cf_stream_purge_http_secret`** if you use the pg_cron job). **`lounge-cf-stream-delete-orphan`** uses the **caller's Supabase JWT** (same pattern as **`lounge-cf-stream-direct-upload`**), not this secret.

**R2 image secrets** (feed images + Stream tile posters — see **`supabase/functions/lounge-cf-r2-direct-upload/README.md`**):

- `LOUNGE_CF_R2_ACCESS_KEY_ID`
- `LOUNGE_CF_R2_SECRET_ACCESS_KEY`
- `LOUNGE_CF_R2_BUCKET`
- `LOUNGE_CF_R2_PUBLIC_BASE_URL`

**Vercel / Vite client env:** `VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL` (same origin as **`LOUNGE_CF_R2_PUBLIC_BASE_URL`**); **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** unless zone Image Resizing is enabled; optional **`LOUNGE_CF_R2_PUBLIC_BASE_URL`** on Vercel for **`api/lounge-post-og.js`** resize.

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
- [ ] **Lounge images (Cloudflare R2):** post a photo; URL should be on prod media subdomain (e.g. **`media.lvslotpro.com`**). Response headers include **`Cache-Control: public, max-age=31536000, immutable`**. Delete post removes R2 object. Legacy rows should already point at R2 if **§3.5** migrate ran.
- [ ] **Lounge search (Phase G):** signed-in dock **Search** — **2+ chars** returns posts/profiles; logged-out tap → account gate. Requires **`20260518160000_lounge_search_phase_g.sql`** on prod DB.
- [ ] **Lounge media lightbox:** image full-screen pinch-zoom + pan; Stream hero expand with interaction bar — spot-check feed + post detail (client-only; no extra deploy beyond app bundle).

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

_Last updated: Lounge **Cloudflare R2** feed images (`lounge-cf-r2-*`, custom domain, migrate/backfill ops, immutable cache headers) + **unified Stream/image lightbox** (`LoungeStreamLightboxContext`, pinch-zoom) + **Phase G search** migration + **Cloudflare Stream** (`stream_video_uid`, direct-upload, delete-video, delete-orphan, purge + pg_cron migrations / Vault). Frontend layout map: `docs/frontend-architecture.md`._
