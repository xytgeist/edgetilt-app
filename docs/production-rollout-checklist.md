# Production rollout checklist (mirror from **test**)

**Post cutover (2026-06-30):** **Production** Supabase = **`jtjgtucumuoswnbauxry`** (`edgetilt.com`). **Test** = **`kcosfvmreeiosdjdzycb`** (`lvslotpro.com`). One-time cutover steps: **`docs/edgetilt-production-cutover.md`**.

**Workflow:** Ship the **full feature set on test first** (`kcosfvmreeiosdjdzycb` + `lvslotpro.com`), then **replay** on **production** (`jtjgtucumuoswnbauxry` + `edgetilt.com`) so prod never drifts behind what you validated on test.

**Doc routing for agents:** Root **`AGENTS.md`** explains when to edit this file vs `docs/test-buildout-backlog.md` vs roadmap after infra or smoke changes.

**Do not paste secrets into this file.** Rotate secrets independently via dashboards/Vercel.

---

## 1. Prerequisites before flipping prod traffic

- [ ] Confirm **`origin/main`** (or whichever Git/Vercel branch fronts **`edgetilt.com`**) carries exactly what should ship.
- [ ] Confirm **production** Supabase project ref **`jtjgtucumuoswnbauxry`** is intentional CLI/UI link (`supabase link --project-ref jtjgtucumuoswnbauxry`).
- [ ] Confirm **Vercel** production env has **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`** (and any other `VITE_*`) pointed at **production** (`jtjgtucumuoswnbauxry`).
- [ ] **AP Guide ingest API** (if prod hosts **`/api/slot-guide-ingest`** or editors use prod target): **`SUPABASE_URL_PRODUCTION`** + **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`** (or plain **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** when only one project). **Preview / test deploy** (e.g. **tx18**): **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** for **test** project — **service_role**, not anon. No repo **`.env.supabase.*`** on Vercel; **`scripts/lib/supabaseEnv.mjs`** reads dashboard vars @ **`24d0412`**.
- [ ] Prefer a **no-op or tagged deploy** after env changes if clients cache aggressively.

---

## 2. Database — SQL to run in production (order matters)

Apply in the **Supabase Dashboard → SQL Editor** for **production**, or via CLI from this repo after linking production:

```bash
supabase link --project-ref jtjgtucumuoswnbauxry --yes
npm run db:query:production -f supabase/community_feed_posts.sql
npm run db:query:production -f supabase/feed_phase_a_profiles_public_read.sql
```

Set **`SUPABASE_DB_PASSWORD`** in **`.env.supabase.production`** (copy **`.env.supabase.example`**) so CLI SQL avoids pooler **`cli_login_postgres`** auth failures.

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
- [ ] **`supabase/migrations/20260519120000_lounge_search_comments.sql`** — **`lounge_search_comments`** RPC + trgm index on **`feed_comments.body`** (comment search in unified post+comment feed).
- [ ] **`supabase/migrations/20260520120000_lounge_search_profiles_about_me.sql`** — **`lounge_search_profiles`** returns **`about_me`** for dock profile result rows.
- [ ] **`supabase/migrations/20260520150000_lounge_search_ranking_rate_limit.sql`** — **`pg_trgm` `similarity()` ranking**, **`@handle`** profile/post bias, **`p_sort`** (`engagement` / `recent`), shared **`lounge_search`** rate limit (~30 searches / 5 min).
- [ ] **`supabase/migrations/20260520160000_lounge_search_hardening.sql`** — 128-char query cap, **`strpos`/`starts_with`** (no LIKE wildcards), **5s `statement_timeout`** per search RPC.
- [ ] **`supabase/migrations/20260520170000_lounge_search_bundled.sql`** — **`lounge_search()`** bundled RPC (posts + profiles + comments + pagination meta), **`lounge_search_text_matches`** (escaped LIKE + trgm), profile **`about_me`** search, **`lounge_search_analytics`**, rate limit **30 / 5 min** per call; revoke split RPC **`authenticated`** execute.
- [ ] **`supabase/migrations/20260520180000_lounge_search_handle_keyword.sql`** — **`@handle keyword`** compound queries (e.g. **`@selena buffalo`**).
- [ ] Any earlier schema you rely on: **`offers`** / **`offer_events`**, **`push_subscriptions`**, notification SQL, etc. — mirror **test** `supabase/` files that are not yet on prod
- [ ] **Chat Phase 2** — apply **`supabase/migrations/20260601120000_chat_phase2.sql`** (adds read receipts, reactions, soft delete, reply columns, `chat_message_reactions` + trigger). Apply **after** `chat_phase1.sql` (base chat tables). Redeploy `lounge-chat` Edge (§4) after this migration.
- [ ] **Chat link previews** — **`20260604180000_link_previews_chat_and_lounge.sql`**, **`20260604180100_chat_messages_rpc_link_preview.sql`** (after Phase 2 + group migrations you ship). Deploy **`lounge-link-unfurl`** (§4). Do **not** re-run **`20260601160000_chat_messages_page_catchup.sql`** after `041801`.
- [ ] **Chat group delete** — **`20260605120000_chat_group_delete.sql`** (empty-group trigger + **`chat_delete_group`** RPC). No Edge redeploy required for trigger path; client uses RPC only.
- [ ] **`supabase/migrations/20260701130000_starter_weekly_guide_unlocks.sql`** — Starter weekly drop table + **`grant_starter_weekly_guide_drop`** (included in Stripe billing chain through **`20260701160000`** if that promote already ran).
- [ ] **`supabase/migrations/20260702120000_starter_weekly_drop_reveal_cron.sql`** — scratch reveal column, **`starter_weekly_guide_drop`** activity type, weekly pg_cron (**Mon 00:10 UTC**), reveal RPCs. **Prereqs:** **`pg_cron`** enabled; **`@edgelord`** profile exists (system actor for notifications). Redeploy **`lounge-send-activity-push`** (§4) after apply.
- [x] **Chat archive inbox** — apply in order: **`20260702150000_chat_room_member_archive.sql`** (`archived_at`, **`chat_archive_room`**, inbox/unread exclude archived), **`20260702160000_chat_archived_rooms_list.sql`** (**`chat_unarchive_room`**, archived list RPCs), **`20260702170000_chat_unarchive_notifications_comment.sql`** (comments only; safe re-run). Redeploy **`lounge-chat`** (§4) after apply.
- [x] **Lounge strict hashtag search** — **`20260702210000_lounge_search_strict_hashtag.sql`** (**`lounge_search_hashtag_posts`**; Ryan sign-off **2026-07-02**, client **`a496a97`**).
- [ ] **Lounge caption cap 500** — **`20260703130000_lounge_caption_500.sql`** (posts, comments, drafts, thread draft validator; client **`LOUNGE_CAPTION_MAX`** = 500, feed collapse **`LOUNGE_CAPTION_DISPLAY_MAX`** = 320).
- [ ] **Lounge bots (Scott Share / Market Edge / portal)** — apply in order (skip any already applied): **`20260703140000`** through **`20260703160000`** (bot accounts, portal snapshot, odds config), **`20260704120000`**–**`20260704220000`** (sports tribe through reply on any post), **`20260704230000`**–**`20260704240000`** (odds poll pg_cron + 6–8am Coffee / 15-min `poll_edges`), **`20260704250000`**–**`20260704330000`** (line movement through coverage scope), **`20260705020000`**–**`20260705050000`** (Market Edge / Crypto Edge), **`20260705060000`**–**`20260710160000`** (portal async queue, slug fix, pg_net result, invoke `force`, Yahoo/MW RSS, **`poll_live`**, bot Post as images, **per-alert `p_alert_kind` queue**). Vault per project: **`lounge_odds_poll_*`**, **`lounge_news_poll_*`** (see Edge READMEs). Redeploy **`lounge-odds-ingest`** + **`lounge-odds-poll`** + **`lounge-news-poll`** + **`lounge-x-ingest`** after relevant migrations; set **`THE_ODDS_API_KEY`** / **`FINNHUB_API_KEY`** / **`OPENAI_API_KEY`** on prod Edge. **Jul 2026 verified on prod:** cron **200**, **`poll_edges`** fixed **`1d5d8fca`**, **`poll_live`** **`20260706190000`**, Market Edge Yahoo/MW, X manual transform + bot images **`30fa305e`**. **`schema_migrations`** on test + prod through **`20260707000000`** (Jul 7 batch); earlier July rows may predate table entries — verify via source rows / function bodies.
- [ ] **Play Logbook (if prod ships Logbook):** apply test-validated chain through **`20260531540000_buffalo_calculator_slug_buffalo_link.sql`** — base **`20260529120000_play_logbook.sql`**, shared sessions **`20260531140000`**, manager/paid **`20260531190000`**, paid/unpaid notify repair order (**`20260531300000`** → **`20260531310000`**, repair **`20260531320000`** if needed), custom metrics **`20260531350000`**, admin primary templates **`20260531400000`**, MHB fields **`20260531500000`**, label migrations **`20260531330000`**–**`20260531360000`**, **`20260531510000`**–**`20260531530000`**, **`20260531540000`**. Redeploy **`lounge-send-activity-push`** after activity-event migrations.

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
supabase link --project-ref jtjgtucumuoswnbauxry --yes
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
# Chat Phase 2 — extended actions (delete_message, reactions, read receipts, mute):
supabase functions deploy lounge-chat
# Chat + Lounge link previews (OG unfurl + attach):
supabase functions deploy lounge-link-unfurl
# Starter weekly drop push deep links (after migration 20260702120000):
supabase functions deploy lounge-send-activity-push
# Stripe billing (after migrations through 20260701160000 — full checklist docs/stripe-billing-test-to-prod-handoff.md):
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
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

**Stripe billing:** live **`STRIPE_*`** secrets + live webhook endpoint on prod; see **`docs/stripe-billing-test-to-prod-handoff.md`** (migrations, smoke, deploy order). **Ryan sign-off 2026-07-01:** prod migrations **`20260701120000`**–**`160000`**, Edge deploy, minimal live Checkout smoke **PASSED**; founding monthly coupon **`QnYlzKuK`**. **Ryan sign-off 2026-07-02:** prod migration **`20260702120000`**, **`lounge-send-activity-push`** redeploy, frontend **`main`** through **`66d6ed7`**. Broader prod billing matrix (upgrade, portal cancel, Lifetime) still optional follow-up smoke.

**Chat archive (2026-07-02):** **Ryan sign-off** — prod migrations **`20260702150000`**–**`170000`**, **`lounge-chat`** redeploy, frontend **`main`** **`f31d9a7`** on **`edgetilt.com`**; archive/restore/push-mute/reply-unarchive smoke **PASSED**.

**Lounge cashtag tap-to-search (2026-07-02):** **Ryan sign-off** — client-only **`efe255d`** on **`origin/main`** / **`edgetilt.com`**; tap **`$TICKER`** in feed caption → dock Search + cashtag post results smoke **PASSED**. No migration or Edge redeploy.

**Lounge strict hashtag search (2026-07-02):** **Ryan sign-off** — migration **`20260702210000`**, client **`a496a97`** on **`edgetilt.com`**; tap **`#tag`** → literal hashtag post results only (no fuzzy prose matches) smoke **PASSED**.

**Lightbox video scrubber (2026-07-03):** **Ryan sign-off** — client-only **`14372ac`** on **`origin/main`** / **`edgetilt.com`**; feed hero + chat lightbox seek/scrub controls (two-tone track, iOS pointer seek, Android MSE seeked-gated resume) smoke **PASSED** on test. No migration or Edge redeploy.

**Android chat video lightbox (2026-07-03):** **Ryan sign-off** — client-only **`ac9a948`** on **`origin/main`** / **`edgetilt.com`**; Android chat video → lounge-style lightbox (swipe dismiss, playback controls, audio stops on dismiss) smoke **PASSED**. No migration or Edge redeploy.

**Post detail reply composer iOS footer (2026-07-04):** client-only **`308ef6eb`** — **`SocialFeed.jsx`**; reply footer no longer floats mid-screen when opening long post detail without keyboard. No migration or Edge redeploy.

**Deploy update banner 20s (2026-07-04):** client-only **`843c5f32`** — **`appDeployVersion.js`**; refocus deploy detect auto-reloads after **20s** (was 3s). No migration or Edge redeploy.

**Deploy update banner close+reopen (2026-07-11):** client-only — banner copy asks full close + reopen (no Refresh / auto soft-reload). No migration or Edge redeploy.

**iOS PWA status bar translucent (2026-07-11):** restored **`apple-mobile-web-app-status-bar-style=black-translucent`** in **`index.html`**. Requires **delete + re-add** home screen icon on iOS. No migration or Edge redeploy.

**Advanced chart Add to post confirm (2026-07-04):** client-only **`014b3d4d`** — **`LoungeMarketChartModal`** confirm before inserting Advanced snapshot into composer. No migration or Edge redeploy.

**Bot portal reply on any post (2026-07-04):** client **`48d739db`** + SQL **`20260704220000`**. **Ryan sign-off:** prod RPC verified **2026-07-04** on **`jtjgtucumuoswnbauxry`** (manual SQL editor; function comment + no bot-owner guard). Not recorded in **`schema_migrations`**. Residual portal errors → wrong env / UUID / stale tab.

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
- [ ] **AP Guide editor (`/slot-guide-form`):** admin login → **+ New guide** → **Save draft** (optional) → **Ingest guide** with Vercel **§1** Supabase service vars set → **Fetch guides** → **Load** → edit section → **Save changes**. Spot-check **Buffalo Link** calculator slug **`buffalo-link`** in app after **`20260531540000`** on prod DB.
- [ ] **Starter weekly guide drop:** on a **Slots Edge Starter** prod account, SQL grant + activity event per **`docs/test-user-roles.md`** → scratch modal, real rub audio, tap-to-open guide, Pro CTA; notification tap deep-links with **`starterDrop=`**. Cron **`starter_weekly_guide_drop_weekly`** scheduled (Mon **00:10 UTC**). Do **not** run bulk **`run_starter_weekly_guide_drop_job()`** on prod without intent.
- [x] **Lounge strict hashtag search:** tap **`#edgeai`** (or any hashtag) → dock **Search** returns only posts with that literal hashtag (case variants OK; no bare **`edge`** / **`edgeai`** prose); migration **`20260702210000`**, client **`a496a97`**.
- [x] **Lounge cashtag tap-to-search:** tap **`$AAPL`** (or any cashtag) in a feed caption → dock **Search** opens with **`$TICKER`** query and cashtag post results (client-only; **`efe255d`**).
- [x] **Chat archive inbox:** swipe left → archive (green); **Archived** tab → swipe left restore (blue) or reply from thread → returns to Inbox; inbound while archived → **no push**; restore or reply → push resumes.

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

- [x] Public legal URLs on **`edgetilt.com`** — **`/terms`**, **`/privacy`**, **`/guidelines`** (in-app routes; no separate static legal site required). Counsel-reviewed; entity **Quantum Capital Ventures, LLC, Wyoming** (Ryan sign-off **2026-07-01**).
- [x] Signup acceptance + **`profiles`** legal timestamps (migration **`20260627200000_profiles_legal_acceptance.sql`**).

---

_Last updated: **2026-07-10** — Scott per-alert invoke (**`20260710160000`**), Best Bet same-game skip, **`lounge-odds-poll`** redeploy. Prior: bot Post as images (**`20260707000000`**), X manual transform (**`lounge-x-ingest`**), Scott **`poll_live`** (**`20260706190000`**). Frontend: `docs/frontend-architecture.md`; test tracking: `docs/test-buildout-backlog.md`._
