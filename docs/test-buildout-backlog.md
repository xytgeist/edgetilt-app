# Test buildout backlog (source of truth before production)

Use this file to track work that is implemented and validated on `test` first.
When a feature is ready to promote, replay steps on production using `docs/production-rollout-checklist.md`.
Roadmap and phase ordering live in `docs/social-feed-roadmap.md`.

**Doc maintenance for agents:** See root **`AGENTS.md`** for when to update this file vs roadmap vs checklist (sessions have no cross-chat memory).

Do not store secrets in this file.

### Build policy (phases)

Work proceeds **in roadmap phase order (A → B → C → …)** with each phase treated as **complete** before moving on. The “Suggested MVP sequencing” block in `social-feed-roadmap.md` is only a **priority hint**, not permission to skip phase scope.

**Hard dependencies:** an item may be completed in a **later** phase only if it truly requires tables or features that do not exist yet. Example: **`community_feed_posts.like_count` / `comment_count` maintenance triggers** (roadmap A2) require **`post_likes`** / **`feed_comments`** (Phases F / E); those triggers are tracked with **Phase F** (and E) until those tables ship.

---

## How to use this file

- Add each new test-side change as a checklist item under the right section.
- Include: what changed, where it lives, how it was validated on test.
- Add a production replay note for every item (or reference checklist section).
- Keep status current so go-live is just execution, not investigation.

### Status labels

- `[ ]` Planned or partially complete
- `[x]` Built and validated on test
- `[-]` Deferred / not in current scope

---

## Deferred / someday (not in phase order)

- [-] **Lounge — Stream inside the image carousel:** One **swipe row** mixing **Cloudflare Stream** clips and **still/GIF** slides in **strict upload order** (no “video wins” vs images — order is order). Today a post is either **`stream_video_uid`** → `LoungePostStreamVideo` **or** `image_urls` / legacy media → `LoungeImageCarousel` (`LoungePostFeedImagesAndGif` in `LoungePostFeedMedia.jsx`); combining them needs an **ordered media model** in DB, mixed strip + lightbox, composer + quote parity, delete/orphan paths, and autoplay rules — **multi-week** if revisited. **Not scheduled.**

---

## Planned (Lounge media — not started)

- [ ] **Multiple Stream clips per post (v1 cap: 2):** Move from a single **`stream_video_uid`** to an **ordered list** of Stream asset ids (max **two** for the first ship; can raise toward **4** later). Work: Supabase migration + backfill; `AppShell` / feed selects; **`loungeVideoUpload.js`** + composer + quote submit/cancel/draft; **`LoungePostFeedMedia.jsx`** / **`LoungePostStreamVideo.jsx`** (two tiles or horizontal strip); post delete / staff delete — call **`lounge-cf-stream-delete-video`** (or batch) **per** uid; orphan/purge alignment; **`LoungeFeedVideoAutoplayContext.jsx`** — **explicit rule** when one post row has two clips (e.g. only first clip eligible as inline winner, or neither). **Rough target:** ~1–2 weeks to test-ready slice once picked up.

---

## Planned (Lounge feed — not started)

- [x] **Following filter on Lounge home:** **All** / **Following** segmented control (`LoungeFeedScopeSwitch.jsx`); **`profile_follows`**-scoped feed queries in **`AppShell.jsx`** via **`loungeFeedScope.js`**; session-persisted scope; empty states. **Test on test** before prod sign-off.

---

## Planned (partner / server API — medium priority)

- [ ] **Lounge — trusted partner auto-post (HTTP API):** Let an external system (cron, Zapier, another product’s backend) publish **text-first** Lounge posts **without** a browser session. **Do not** share Supabase **service role** with the partner; they call **your** URL only (e.g. **Vercel serverless** or **Supabase Edge Function**). **Auth:** `Authorization: Bearer <integration secret>` (rotate in env); optional **IP allowlist**; **`Idempotency-Key`** header to dedupe retries; tight **rate limit** (e.g. a few posts per day per key). **Implementation sketch:** server validates secret, then uses **service-role** Supabase on **your** side to `insert` into **`community_feed_posts`** with fixed **`user_id`** = a **dedicated** `auth.users` row + **`profiles`** (clear handle for attribution). Align insert columns with **`communityFeedPostInsertPayload`** in `src/utils/communityFeedPost.js` (caption ≤280; optional `game_title` / `game_slug`; extend later for image URL if product allows). **Watch:** existing **`rate_limit_events`** / `BEFORE INSERT` guard on posts (`feed_phase_a_profiles_public_read.sql` §A4) may apply to that user — decide exempt vs. partner account tuned for low volume. **Test validation:** `curl` happy path + wrong secret + duplicate idempotency key; confirm feed row + author profile in app. **Production replay:** env var names in `production-rollout-checklist.md` §1; add Edge row + §4 if shipped as a function.

---

## Planned (messaging — phased: TLS / at rest → ciphertext)

**Product intent:** subscriber-capable **chat** (DMs + groups — scope TBD) with honest security language: **TLS in transit** + **provider encryption at rest** first; a **later phase** adds **app-level ciphertext storage** (message bodies as ciphertext in Postgres; keys **not** colocated with data in a naive dump — **not** E2EE unless clients alone hold keys).

- [ ] **Phase 1 — Transport + at rest (ship first):** Enforce **HTTPS-only** app/API surfaces (no mixed content; HTTP→HTTPS; consider **HSTS** on the app domain). Rely on **Supabase / host managed encryption at rest** for persisted data; document in privacy/architecture notes (names of controls only in repo). **Rough timeline:** aligns with initial messaging MVP build (order of **weeks** for barebones chat — see prior estimates — not a separate “TLS project”).

- [ ] **Phase 2 — App-level ciphertext storage (follow-on):** Encrypt message bodies (e.g. AES-GCM) before persist; decrypt on authorized read via a **trusted server path**; optional **per-room DEK** wrapped by a **KEK** in Vault/KMS. **Rough incremental time:** ~**1–2 weeks** (single master key + wiring) to **~2–4+ weeks** (per-room keys, rotation runbooks, re-encrypt jobs). Marketing: **“stored as ciphertext”** only if keys are handled separately; do **not** imply **end-to-end** unless clients hold keys.

**Smart prep from day one (so Phase 2 is not a rewrite):**

- **Single read/write seam** for messages (e.g. one **Edge Function** or **Vercel API** module), even if v1 passes **plaintext** through — avoids scattered `supabase.from('messages').insert` that is painful to retrofit.
- **Schema placeholders:** e.g. **`content_encoding`** (`plain` | future `aes_gcm_v1`), optional **`key_id` / wrapped DEK** columns (nullable in v1), body column type that can hold **binary ciphertext** later (**`bytea`** or a single chosen base64-in-text convention).
- **Avoid early coupling** to **plaintext-only** DB features on the message body (e.g. **full-text search indexes**, triggers that assume readable text) until the ciphertext strategy is decided — or plan **parallel** searchable metadata.

**Cross-link:** high-level sequencing note in **`docs/social-feed-roadmap.md`** (*Messaging / chat (future)*). Roadmap phases **A–L** unchanged; messaging is **out of band** until picked up.

**Chat MVP (DMs, ≤10 member groups, subscriber topic rooms — code in repo):**

- [x] **SQL on test:** `supabase/chat_phase1.sql` — tables, member read RLS (**`chat_room_members`**: own rows only — avoids recursion; DM peer labels use **`dm_key`** in the client), seeded topic slugs. If an older policy was applied, run **`supabase/chat_room_members_rls_recursion_fix.sql`**. Production replay: `docs/production-rollout-checklist.md` when promoted.
- [x] **Edge:** deploy `supabase/functions/lounge-chat` (`open_dm`, `join_channel`, `create_group`, `send_message`). `supabase/config.toml` sets **`verify_jwt = true`** for this function.
- [x] **Client:** `LoungeChatPanel.jsx` in **`LoungeDockSlidePanels.jsx`**; profile **Message** control in **`LoungeProfileFullScreen.jsx`**; **`SocialFeed.jsx`** + **`AppShell.jsx`** pass `hasActiveSubscription` / `isStaff` and wire dock close → clear pending DM peer.
- [x] **Realtime:** **`chat_messages`** live updates without refresh — **PASSED** on test (Ryan, smoke **§13**, 2026-05-18).

---

## Roadmap status snapshot

### Phase A - Foundation (DB + auth shaping)

- [x] A1 core `profiles` model in place on test (`handle`, `display_name`, `avatar_url`, `bio`, `role`, `banned_at`, timestamps, constraints/index).
- [x] **Handle change cadence (test):** `profiles.handle_changed_at` + `BEFORE UPDATE OF handle` cooldown trigger (one change per rolling 7 days; raises `PROFILE_HANDLE_CHANGE_COOLDOWN`). Restore migration: **`20260518150000_restore_profile_handle_change_cooldown.sql`** if cooldown was temporarily removed. Client: **`LoungeProfileFullScreen.jsx`** confirm/cooldown modals + **`ProfileHandleConflictDialog.jsx`**.
- [x] A2 feed model on test: `community_feed_posts` is **caption-only** (legacy `title` / `body` dropped after backfill); `edited_at`, pin/moderation columns, denormalized `like_count` / `comment_count` / `repost_count` (after `feed_interactions_phase_ef.sql`).
- [x] A3 baseline RLS/policy shape for public read + authed write + staff moderation is applied on test (includes author **30-minute** `UPDATE` window in SQL).
- [x] A4 **DB-first** posting rate limit on test: `rate_limit_events` + indexes + `BEFORE INSERT` guard on `community_feed_posts` in `feed_phase_a_profiles_public_read.sql` (optional later: Redis/edge limiter per roadmap).
- [x] A2 **counter maintenance:** `supabase/feed_interactions_phase_ef.sql` adds `post_likes`, `post_reposts`, `post_bookmarks`, `feed_comments`, `repost_count`, and triggers to keep `like_count` / `comment_count` / `repost_count` in sync (top-level comments only for post count). **`feed_comments.body`** cap is **280** (same as captions): canonical **`feed_comments_body_len`** in that file for greenfield; existing DBs run **`supabase/migrations/20260515180000_feed_comments_body_max_280.sql`**. **Apply on test** before Lounge persistence works.

### Phase B - Public read feed

- [x] Basic public read feed path works on test (anon-visible rows, signed-in posting path from Guides).
- [x] Cursor pagination on `(created_at, id)` is implemented with load-more pagination (infinite auto-load polish still optional).
- [x] Pinned row: head load fetches at most one pinned row plus first unpinned page; pinned prepended; load-more uses unpinned-only cursor (matches roadmap “prepend one pinned” shape). RLS hides `hidden_at` rows.
- [ ] **Staff pin/unpin (and broader Lounge moderation UI):** **Admin → profile ⋯ → Promote to moderator / Remove moderator role** shipped on **test** (requires **`admin_set_profile_role.sql`** on Supabase). Pin/unpin + staff delete exist in post detail for staff; no dedicated mod queue yet. **Database is ready:** `profiles.role in ('moderator','admin')` may `UPDATE` any feed row (`community_feed_posts_update_moderator` in `supabase/feed_phase_a_profiles_public_read.sql`), and `community_feed_posts_author_guard` lets staff change `pinned` / hide fields without hitting the author-only restriction. Until an in-app mod surface exists, **test pinned ordering** by rerunning the pin block at the end of `supabase/seed/lounge_fake_posts.sql` (clears pins, pins one visible row) or with a one-off `UPDATE` in the Supabase SQL editor (respect the partial unique index: at most one `pinned = true` among non-hidden rows).
- [x] Logged-out Lounge: composer hidden; like/comment/repost/bookmark are read-only (server counts only, no local mutation UI). **Lounge search** (dock) requires sign-in — **Phase G** server RPCs (`lounge_search_posts` / `lounge_search_profiles` / `lounge_search_comments`); anon tap → create-account modal. Guides search remains on Guides tab.

### Phases C-L

- [ ] Phases **D–L** not complete end-to-end; **E/F first slice** and **Phase G search stack** validated on **test** (Ryan smoke **§16** **PASSED** 2026-05-21). **Comment ranking (Relevant)** client sort shipped (score + decay in **`loungeFeedCommentSort.js`**) — Ryan smoke pending. **Notifications**, **freemium**, etc. still roadmap scope.
- [x] **Phase C (profiles + identity, test):** profile gate (Lounge + Guides); full-screen profile editor; 7-day handle change (DB + modals); **`/u/:handle`** permalink + OG + deep link; **handle conflict** dialog (taken/reserved + suggested `@handle_1`). Ryan sign-off **PASSED** on **test** @ **`7ce7b44`** (2026-05-18). *Deferred (not blocking):* dedicated server-side reserved-handle SQL beyond client `RESERVED_HANDLES` + unique index; standalone marketing profile page beyond in-app sheet.
- [x] **Phase G (search, test):** Auth-gated **`lounge_search()`** stack — posts, profiles, comments, highlight/recent/about, Top/Latest, rate limit, bundled pagination, hardening, **`@handle` keyword**, relevance ranking, volatile helpers. Migrations **`20260518160000`** through **`20260520190000`**. Client: **`loungeSearchApi.js`**, **`LoungeDockSlidePanels.jsx`**. Ryan sign-off **PASSED** on **test** (smoke **§16**, 2026-05-21).
- [ ] **Freemium / subscriptions:** anonymous read-only where required; free-account vs subscriber entitlements (DB + **RLS** + Stripe webhooks); extend shell gating beyond today’s **`browseMode`**. Product spec: fill **`docs/access-tiers.md`**; roadmap: **`docs/social-feed-roadmap.md`** → *Freemium & subscriptions*.

---

## Supabase schema SQL (test first)

- [x] Community feed base schema on test  
  - Change: Added feed table + baseline behavior.
  - Source: `supabase/community_feed_posts.sql`
  - Test validation: Feed insert/read path used by app flows.
  - Production replay: `production-rollout-checklist.md` §2

- [x] Feed Phase A profile/public-read policies on test  
  - Change: Profiles and moderation-related policy/grant alignment for public read.
  - Source: `supabase/feed_phase_a_profiles_public_read.sql`
  - Test validation: Logged-out feed readability + signed-in posting flow.
  - Production replay: `production-rollout-checklist.md` §2

- [x] Feed interactions Phase E/F (likes, reposts, bookmarks, comments) on test  
  - Change: Tables + RLS + triggers for Lounge engagement; `repost_count` on posts; client wiring in `SocialFeed.jsx` / `LoungePostArticle.jsx` / `AppShell.jsx`. Comment-row interactions via **`20260515190000_feed_comment_interactions.sql`** (§5b in canonical SQL).
  - Source: `supabase/feed_interactions_phase_ef.sql`
  - Test validation: Run SQL on test project; signed-in user can like/repost/bookmark and post top-level comments; counts update; anon still read-only on actions. Ryan sign-off **PASSED** on **test** @ **`b8d55d3`** (2026-05-18) — feed, post detail, profile tabs, quote repost; comment like/repost/bookmark on post detail.
  - Production replay: `production-rollout-checklist.md` §2

- [x] Lounge search Phase G (posts + profiles RPCs) on test  
  - Change: `pg_trgm` indexes + **`lounge_search_posts`** / **`lounge_search_profiles`** (auth-gated); dock search client in **`LoungeDockSlidePanels.jsx`**.
  - Source: `supabase/lounge_search_phase_g.sql`, migration **`20260518160000_lounge_search_phase_g.sql`**
  - Test validation: Smoke **§16** **PASSED** on **test** (2026-05-19, Ryan).
  - Production replay: `production-rollout-checklist.md` §2

- [x] Lounge search Phase G — **comment body** RPC on test  
  - Change: **`lounge_search_comments`** + trgm index on **`feed_comments.body`**; unified post + comment feed (engagement order); **`LoungeSearchCommentResultRow`** (comment-repost-style with *…in reply to*); hydration in **`loungeSearchApi.js`**.
  - Source: `supabase/lounge_search_phase_g.sql`, migration **`20260519120000_lounge_search_comments.sql`**
  - Test validation: Smoke **§16** comment bullets **PASSED** on **test** (Ryan, 2026-05-21).
  - Production replay: `production-rollout-checklist.md` §2

- [x] Lounge search Phase G — **ranking + rate limit + sort** on test  
  - Change: **`@handle`** query bias (profiles handle-only; posts by author + `@mention`); **`pg_trgm` `similarity()`** ranking; **`p_sort`** engagement/recent; **`lounge_search_enforce_rate_limit`** (~30 searches / 5 min, staff exempt); client **Top / Latest** toggle + **Trending in your feed** empty-query copy.
  - Source: `supabase/lounge_search_phase_g.sql`, migration **`20260520150000_lounge_search_ranking_rate_limit.sql`**, **`loungeSearchSortPref.js`**, **`LoungeDockSlidePanels.jsx`**
  - Test validation: Smoke **§16** **PASSED** on **test** (Ryan, 2026-05-21).
  - Production replay: `production-rollout-checklist.md` §2

- [x] Lounge search Phase G — **highlight + recent + profile about** on test  
  - Change: **`loungeSearchHighlight.jsx`** (query term `<mark>` in captions, comment bodies, profile **about_me**); **`loungeSearchRecentPref.js`** (local **Recent** chips when query &lt; 2 chars; clear **×** on input); **`lounge_search_profiles`** returns **`about_me`** (2-line clamp in profile rows); migration **`20260520120000_lounge_search_profiles_about_me.sql`**.
  - Source: `supabase/lounge_search_phase_g.sql`, **`LoungeDockSlidePanels.jsx`**, **`loungeCaption.jsx`**
  - Test validation: Smoke **§16** highlight/recent/about bullets **PASSED** on **test** (Ryan, 2026-05-21).
  - Production replay: `production-rollout-checklist.md` §2

- [x] Lounge search Phase G — **bundled RPC + hardening + handle keyword + relevance + volatile** on test  
  - Change: single **`lounge_search()`** + Load more (**`20260520170000`**); term normalize + **`statement_timeout`** (**`20260520160000`**); **`@selena buffalo`** handle+keyword (**`20260520180000`**); volatile helpers (**`20260520181000`**); **`lounge_search_match_relevance()`** + client **`search_relevance`** sort (**`20260520190000`**).
  - Source: `supabase/migrations/20260520160000_lounge_search_hardening.sql` through **`20260520190000_lounge_search_relevance_ranking.sql`**
  - Test validation: Apply on test Supabase; smoke **§16** **PASSED** (Ryan, 2026-05-21).
  - Production replay: `production-rollout-checklist.md` §2

- [ ] Additional SQL parity audit against test history  
  - Change: Reconcile all `supabase/*.sql` used on test that prod may still be missing.
  - Source: `supabase/`
  - Test validation: N/A (tracking task).
  - Production replay: Add each missing SQL file to checklist §2 before go-live.

---

## RLS / roles / bootstrap rules

- [x] `profiles` admin bootstrap path verified on test  
  - Change: Confirmed operational bootstrap pattern for first admin role update.
  - Source: SQL update on `public.profiles`
  - Test validation: Admin-capable account flow proven on test.
  - Production replay: `production-rollout-checklist.md` §3

- [ ] Staff bootstrap runbook hardening  
  - Change: Add exact operator sequence for moderator creation + audit note.
  - Source: This doc + prod checklist §3
  - Test validation: Pending explicit dry run and copy-paste-ready commands.
  - Production replay: Include final commands in §3.

---

## Edge Functions (test parity before production)

- [x] `process-offer-uploads` deployed and validated on test
- [x] `get-web-push-config` deployed and validated on test
- [x] `send-test-push` deployed and validated on test
- [x] `send-due-offer-reminders` deployed and validated on test
  - Source: `supabase/functions/*`
  - Production replay: `production-rollout-checklist.md` §4

- [x] `lounge-cf-stream-direct-upload` (Lounge **Cloudflare Stream** direct-upload mint) deployed with secrets on **test** (replay on production per checklist).
- [x] `lounge-cf-stream-delete-video` (delete Stream asset when a video post is deleted) on the **same** project (reuses `CLOUDFLARE_*` secrets).
- [x] `lounge-cf-stream-delete-orphan` (delete a Stream asset by **uid** when the client abandons a failed upload / no DB row) on **test**.
- [x] `lounge-cf-stream-purge-pending-uploads` (ops/cron: delete **pendingupload** assets older than **`maxAgeHours`**) on **test**, with **`LOUNGE_CF_STREAM_PURGE_SECRET`** and matching Vault **`lounge_cf_stream_purge_http_secret`**; **`pg_cron` + `pg_net`** daily job from migrations **`20260509180000`**, **`20260512120000`**, **`20260515120000`** (optional two-arg invoke for dry-run tests — see purge **`README.md`**).
- [x] **`lounge-cf-r2-direct-upload`** + **`lounge-cf-r2-delete-object`** + **`lounge-cf-r2-delete-orphan`** (Lounge feed images + Stream tile posters → **Cloudflare R2**; delivery via **`/cdn-cgi/image/`** when Image Resizing enabled on zone). Client: **`src/utils/loungeCfImageMedia.js`**, **`uploadLoungeFeedPostImage`** in **`communityFeedPost.js`** (R2 when Edge secrets set, else legacy **`lounge-feed`** Supabase Storage). Deployed + secrets on **test** (`jtjgtucumuoswnbauxry`); custom domain **`https://media-test.lvslotpro.com`**; Vercel **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** (Free zone — client-side WebP prep only until Pro).
  - **Secrets (names only):** `LOUNGE_CF_R2_ACCESS_KEY_ID`, `LOUNGE_CF_R2_SECRET_ACCESS_KEY`, `LOUNGE_CF_R2_BUCKET`, `LOUNGE_CF_R2_PUBLIC_BASE_URL` (+ shared **`CLOUDFLARE_ACCOUNT_ID`**). Client/Vercel: **`VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL`** (match public base).
  - **Source:** `supabase/functions/lounge-cf-r2-direct-upload/README.md`, `LoungePostFeedMedia.jsx`, `LoungeInlineMediaUrl.jsx`, `loungePostSubmitJob.js`, `SocialFeed.jsx` delete paths, `api/lounge-post-og.js`.
  - **Test validation:** Ryan **PASSED** on **test** (2026-05-19): image post + delete on **`media-test.lvslotpro.com`**; CORS includes **`Cache-Control`**. **Legacy migration PASSED:** **68** objects → R2 (**27** posts, **12** comments). **Cache-Control backfill PASSED:** **69** objects **`public, max-age=31536000, immutable`**. External Klipy **`gif_url`** unchanged. **Stream tile posters (new uploads):** WebP on R2 via **`prepareLoungeFeedImageForUpload`** — **PASSED** @ **`93dcc3f`**. **Open (deferred):** **`/cdn-cgi/image/`** after Pro on **`lvslotpro.com`**.
  - Production replay: `production-rollout-checklist.md` §2 + §4; add **`media.lvslotpro.com`** (or prod media subdomain) + prod secrets when promoting.

- [ ] Function-by-function smoke notes captured  
  - Change: Record minimal expected input/output for each function.
  - Source: function `README.md` files
  - Test validation: Pending consolidated notes.
  - Production replay: Run same checks post-deploy in prod.

---

## Environment and deploy config (test-side buildout)

- [x] Test Supabase project is canonical during buildout
  - Change: Team workflow set to "full build on test first."
  - Source: `production-rollout-checklist.md` workflow note
  - Test validation: Ongoing process agreement.
  - Production replay: N/A (process guardrail).

- [ ] Capture complete `VITE_*` parity matrix  
  - Change: Track every runtime variable used by app and expected test/prod values (names only, no secret values).
  - Source: Vercel env + `.env.*` files
  - Test validation: Pending inventory.
  - Production replay: Apply in checklist §1.

---

## Frontend feature buildout on test

- [x] A2 feed model v1 on test (`community_feed_posts` caption-only)
  - Change: Canonical **`caption`** (≤280); app uses `src/utils/communityFeedPost.js` for inserts and display; **`title` / `body`** removed from schema after phase-A SQL backfill + column drop; feed `.select` lists updated.
  - Source: `supabase/community_feed_posts.sql`, `supabase/feed_phase_a_profiles_public_read.sql`, `src/features/lounge/SocialFeed.jsx`, `src/features/shell/AppShell.jsx` (feed wiring / tab entry), `src/features/guides/GuidesScreen.jsx`, `supabase/seed/lounge_fake_posts.sql`.
  - Test validation: Lounge + Guides posting and feed read verified on test after re-applying phase A SQL.
  - Production replay: `production-rollout-checklist.md` §2 — run current `community_feed_posts.sql` then `feed_phase_a_profiles_public_read.sql` (or equivalent migration) before relying on caption-only clients.

- [x] A4 rate limiting foundation (DB path) on test
  - Change: `rate_limit_events` + rolling-window insert guard on new community posts; app surfaces rate-limit errors in Lounge/Guides.
  - Source: `supabase/feed_phase_a_profiles_public_read.sql` (section 4) + client error handling.
  - Test validation: repeated posts within the configured window return the limiter error; normal posting outside the window succeeds.
  - Production replay: checklist §2; optional §4 only if an edge path is added later.

- [x] A4 **UX:** rate-limit / spam messaging **above** the Lounge composer (`SocialFeed.jsx`) so long expanded drafts do not hide the banner.
  - Change: `postErr` strip placement + styling.
  - Test validation: trigger rate limit with a tall composer; message remains visible without scrolling the draft.
  - Production replay: N/A (client-only).

- [x] Lounge profile fullscreen + handle-save flows (test)
  - Change: Own-profile edit sheet: RLS-safe updates; staff role preserved; handle change **confirm** / **cooldown** modals with **Continue** submitting save; iOS **16px** min on handle/display + post-save **blur + scroll** reset.
  - Source: `src/features/lounge/LoungeProfileFullScreen.jsx`, `src/features/profiles/profileGate.js`, profile selects in `SocialFeed.jsx` as applicable.
  - Test validation: normal user save; mod/admin save; handle modal paths; iOS Safari spot-check after save.
  - Production replay: run **`profile_handle_changed_at.sql`** (or full **`profile_lounge_fullscreen.sql`**) on prod before relying on column/trigger.

- [x] Lounge profile permalink **`/u/:handle`** (test)
  - Change: Share URL **`/u/:handle`**; Vercel **`api/lounge-profile-og.js`** OG + redirect; **`SocialFeed.jsx`** deep link (`?u=`, path, legacy `?profile=`); anon **`fromPublicLink`** opens profile sheet.
  - Source: `src/utils/loungeSharePost.js`, `vercel.json`, `AppShell.jsx`, `SocialFeed.jsx`.
  - Test validation: share profile → `/u/<handle>`; fresh tab / iMessage preview → profile sheet; bad handle → flash + URL cleaned. Ryan sign-off **PASSED** on **test** @ **`7ce7b44`** (2026-05-18).

- [x] Lounge profile handle conflict UX (test)
  - Change: **`ProfileHandleConflictDialog.jsx`** + **`checkProfileHandleAvailability`** — taken/reserved handle popup with suggested alternative; **`strictHandle`** on explicit save (profile gate + profile editor).
  - Source: `src/features/profiles/profileGate.js`, `LoungeProfileFullScreen.jsx`, `SocialFeed.jsx`, `GuidesScreen.jsx`.
  - Test validation: pick taken handle → dialog + **Use @…_1**; reserved handle (e.g. `@admin`) → reserved copy + suggestion. Ryan sign-off **PASSED** on **test** @ **`7ce7b44`** (2026-05-18).

- [x] Lounge feed media + repost UX (test)
  - Change: Feed/detail carousels reset to **first slide** when post **re-enters viewport** (`LoungePostFeedMedia.jsx`); **repost** uses **anchored popover** above the control including reposted-state actions (`LoungePostArticle.jsx`, `SocialFeed.jsx`); quote composer textarea sizing aligned with main composer; image-cap modal from picker/quote flows.
  - Source: files above.
  - Test validation: scroll multi-image post off/on; repost menu position; quote sheet height + media below text; 7th image attempt shows cap modal.
  - Production replay: N/A (client-only).

- [x] Lounge **unified Stream + image/GIF lightbox** (test / branch `test`, commits **`966b138`** → **`4cba554`**, polish **`7591f8d`**)
  - Change: **`LoungeStreamLightboxContext.jsx`** + **`loungeStreamLightboxRenderers.jsx`** centralize chrome (top bar, author row, interaction bar, repost menus) for **`LoungePostStreamVideo.jsx`**, **`LoungeInlineMediaUrl.jsx`**, **`LoungePostFeedMedia.jsx`** across feed, post detail, comment embeds, and profile. Stream lightbox: pill controls, mute toggle, landscape safe-area insets, **Follow** by orientation (author row portrait / top bar landscape), tighter handle spacing + **2-line caption** truncation.
  - Source: `LoungeStreamLightboxContext.jsx`, `loungeStreamLightboxRenderers.jsx`, `loungeStreamLightboxRegistry.js`, `SocialFeed.jsx`, `LoungePostArticle.jsx`.
  - Test validation: smoke **§17** **PASSED** on **test** (2026-05-19, Ryan) — feed, post detail, profile; interaction bar + repost menus.
  - Production replay: N/A (client-only).

- [x] Lounge **image lightbox pinch-to-zoom** (test / branch `test`, commit **`9b0f9b5`**)
  - Change: **`loungeLightboxImageZoom.js`** — pinch scale (1×–4×) + one-finger pan on still/GIF lightbox; vertical **swipe dismiss** via **`loungeLightboxSwipeDismiss.js`** still works at 1× scale.
  - Source: `loungeLightboxImageZoom.js`, `LoungeInlineMediaUrl.jsx`, `LoungePostFeedMedia.jsx`.
  - Test validation: smoke **§17** **PASSED** on **test** (2026-05-19, Ryan).
  - Production replay: N/A (client-only).

- [x] Lounge **comment-repost detail + thread navigation** (test / branch `test`, commit **`b782e69`**)
  - Change: Fix plain repost entry from comment detail, comment-thread back navigation, and feed repost interaction hydration for embedded originals.
  - Source: `SocialFeed.jsx`, `LoungePostCommentThread.jsx`, `communityFeedPost.js`.
  - Test validation: **PASSED** on **test** (2026-05-19, Ryan) — repost from comment context; thread back-nav; plain repost hydration.
  - Production replay: N/A (client-only).

- [x] Lounge **FAB hidden during image/GIF lightbox** (test / branch `test`, commit **`f6a975e`**)
  - Change: **`LoungeImageLightbox`** registers open/close via **`loungeStreamLightboxRegistry.js`** so viewport FAB hides for still/GIF heroes (parity with Stream full-screen).
  - Source: `LoungeInlineMediaUrl.jsx`, `loungeStreamLightboxRegistry.js`.
  - Test validation: **PASSED** on **test** (2026-05-19, Ryan) — feed image lightbox: FAB not stacked above chrome.
  - Production replay: N/A (client-only).

- [x] Lounge **direct comment entry smooth scroll** (test / branch `test`, commit **`59a26bd`**)
  - Change: Profile Replies, comment-repost cards, and deep links prefetch drill path; post detail waits for sheet slide-in; title bar locked during smooth scroll to focused comment; in-feed drill stays instant; respects **`prefers-reduced-motion`**.
  - Source: `SocialFeed.jsx`.
  - Test validation: **PASSED** on **test** (2026-05-19, Ryan) — profile Replies + comment repost entry; in-feed drill unchanged.
  - Production replay: N/A (client-only).

- [x] Lounge **profile unfollow → feed session sync** (test / branch `test`, commit **`dd02294`**)
  - Change: Profile **Following** toggle and follow-list row toggles call **`syncLoungeViewerFollowState`** — updates follow pills, comment sort, and **Following** filter without reload.
  - Source: `SocialFeed.jsx`, `LoungeProfileFullScreen.jsx`, `LoungeProfileFollowList.jsx`.
  - Test validation: **PASSED** on **test** (2026-05-19, Ryan) — unfollow from profile; feed pills + Following filter update same session.
  - Production replay: N/A (client-only).

- [x] Lounge **FAB wheel nav** + chip-heart likes + interaction polish (test / branch `test`, commits through **`2231883`**)
  - Change: **`LoungeDockArcCarouselPrototype.jsx`** — draggable FAB + spin wheel (primary nav); long-press reposition; glow off, cyan **border tiers** (idle / following-on / active panel); compose opens keyboard via **`loungeDockComposeFocus.js`**; **1s** reposition click-through guard (document capture + overlay). **`LoungeDockFooterBar.jsx`** disabled in **`SocialFeed.jsx`** / profile (`LOUNGE_DOCK_FOOTER_BAR_DISABLED`). **`LoungeFlameIcon.jsx`** poker chip + heart (liked **`#fd262d`**); **`LoungeLikeStatContent`** fixed grid; **Share** in **`LoungePostRowMenu.jsx`** only. Bell optical centering `translate(-2, …)`.
  - Source: `src/components/loungeDockArcCarouselItems.jsx`, `src/utils/loungeDockFabGlow.js`, `src/utils/loungeDockFabPosition.js`, `LoungePostInteractionBar.jsx`, `LoungePostArticle.jsx`.
  - Test validation: manual on test — wheel open/close, panels, following toggle, compose from feed + from search/chat panel, FAB reposition without opening post under finger (spot-check iOS Safari if available).
  - Production replay: N/A (client-only).

- [x] Lounge **video submit queue + fast lane + parallel prep** (test / branch `test`, commits **`7f93eb8`** → **`57eaca2`**)
  - Change: **`SocialFeed.jsx`** — video posts enqueue **`loungeSubmitQueueRef`** (sequential DB insert + single upload bar, **Post X of Y** for video jobs only); text/image/GIF bypass via **`runFastLaneLoungeSubmit`**. Waiting queue jobs start encode + CF upload in parallel via **`loungeQueuedVideoPrep.js`** while the active job runs; deferred composer prep during queue drain; queued poster blob pin in **`loungeStreamSessionPoster.js`**. Profile **Likes** tab hydrates **`interactionByPost`** on open + duplicate-like PK recovery.
  - Source: `SocialFeed.jsx`, `loungeQueuedVideoPrep.js`, `loungePostSubmitJob.js`, `loungeCommentSubmitJob.js`, `loungeStreamSessionPoster.js`, `LoungeProfileFullScreen.jsx`; rate-limit fix **`supabase/migrations/20260518103000_fix_rate_limit_profiles_user_id.sql`** (apply on Supabase test).
  - Test validation: back-to-back two videos (**Post 1 of 2** → **Post 2 of 2**, both land); mixed stack video → text/image/GIF (fast lane immediate); DevTools — two **`lounge-cf-stream-tus-create`** + two tus lanes while job 1 active; profile Likes → open post → like without duplicate-key error.
  - Production replay: apply rate-limit migration if not on prod; N/A client-only otherwise.

- [x] Lounge **visibility-band feed video autoplay** (test — hero-first resource budget)
  - Change: **`loungeFeedVideoAutoplayStore.js`** — `{prev, active, next}` ring (max **3** HLS decoders), **centerline handoff** (challenger midpoint crosses scroll-column center) + clip fallbacks, flinger idle **200ms**, **`enterHeroLock`** / **`exitHeroLock`**, **`setCoordinatorSuspended`** when post detail open. **`LoungeFeedVideoAutoplayContext.jsx`** — feed-wide sound mode + visibility 60%/40% bands. **`LoungePostStreamVideo.jsx`** — ring attach/play FSM, hero opens with lock + sound on. **`SocialFeed.jsx`** — **`LoungeFeedCoordinatorSuspendBinder`**.
  - Test validation: scroll — first-pixel muted play; handoff pauses (holds time); sound only after Tap for sound + 60% visible; hero expand → only hero decoder, flyout smooth; close hero → feed resumes; open post detail → feed ring suspended. Ryan sign-off **good enough for now** on **test** @ **`dbd4fa1`** (2026-05-18).

- [x] Lounge **feed video perf diet** (test — after **`7dbbec7`** hero/staging work)
  - Change: **`loungeFeedVideoAutoplayStore.js`** — **winner-only** HLS (removed multi-tile staging band / play-pause prime on up to 24 neighbors). **`LoungePostStreamVideo.jsx`** — **`pinInlinePosterBehindFlyout`** on hero tap so poster stays **behind** flyout (not z-[2] above video). **`AppShell.jsx`** — **`COMMUNITY_FEED_PAGE_SIZE = 28`** (was 40).
  - Test validation: scroll feed 30s on phone — no stutter/heat vs prior deploy; one autoplay winner; tap playing tile → hero grow without poster-on-top flash; load-more adds **28** rows. Ryan sign-off **PASSED** on **test** @ **`dbd4fa1`** (2026-05-18).

- [x] Lounge **Stream hero expand + prefetch staging** (test / branch `test`, commits **`4cba1e5`** → **`7dbbec7`**)
  - Change: **`LoungePostStreamVideo.jsx`** — X-style **hero expand**: same `<video>` reparents to `body`, **GPU transform FLIP** from **`readHeroMediaViewportRect`**; tap snapshot freezes poster→video fade; **canvas frame shield** + **rVFC** before scrim arms; card-hole poster behind flyout; vertical **swipe dismiss** restored on flyout shell (`loungeLightboxSwipeDismiss.js` **`touch-none`** when **`allowSwipeOnVideo`**). **`loungeFeedVideoAutoplayStore.js`** — **prefetch-band staging** (winner plays; up to **24** neighbors attach HLS paused). **`AppShell.jsx`** — **`COMMUNITY_FEED_PAGE_SIZE = 40`**.
  - Source: `LoungePostStreamVideo.jsx`, `LoungeFeedVideoAutoplayContext.jsx`, `loungeFeedVideoAutoplayStore.js`, `loungeLightboxSwipeDismiss.js`, `AppShell.jsx`.
  - Test validation: feed scroll — neighbors feel ready when scrolled in; tap playing tile → smooth hero grow (minimal poster flash); swipe down on full-screen video dismisses; load-more fetches 40 rows. Ryan sign-off **pending** on latest deploy (`7dbbec7`).
  - Production replay: client-only.

- [x] Lounge **video** via **Cloudflare Stream** (test / branch `test`)
  - Change: **`stream_video_uid`** on posts; Edge **`lounge-cf-stream-direct-upload`**; client upload + HLS manifest poll (`loungeVideoUpload.js`); playback `LoungePostStreamVideo.jsx` (lazy `hls.js`); **`LoungeFeedVideoAutoplayContext.jsx`** + **`loungeFeedVideoAutoplayStore.js`** — scroll-root **winner** inline play + **prefetch-band staging** + IO prefetch; poster→video **crossfade** (`requestVideoFrameCallback` + staggered opacity) to reduce black flash; **shared feed inline sound** (Tap for sound / Tap to mute + **SoundOn** vs muted glyph); **hero expand** full-screen (see row above); composer preview + post path in **`SocialFeed.jsx`**; selects include **`stream_video_uid`** in **`AppShell.jsx`** (**40** posts/page). **Quote repost** overlays **`z-[100]`** above opened post detail **`z-[98]`** (above profile **`z-[97]`**). Upload bar button label **Cancel**. Caps: **60s** duration, **200 MB** upload (Cloudflare basic POST).
  - Source: files in bullet + `supabase/lounge_feed_post_stream_video.sql`.
  - Test validation: apply SQL + deploy function + secrets on the Supabase project; post a short clip; plays in feed; first visible autoplay; sound strip toggles all tiles; open post → quote repost sheet on top; uploading bar shows **Cancel**.
  - Production replay: `production-rollout-checklist.md` §2, §4, §5.

---

## Test smoke and release readiness

- [x] Maintain a "known-good on test" smoke pass list
  - **Local automation (2026-05-09):** `npm run lint` and `npm run build` pass; production build shows expected lazy chunks (`SocialFeed`, `OffersCalendar`, `GuidesScreen`, `LocalIntel`, `BankrollTracker`, `CalculatorsTab`, per-game calculator bundles).
  - **Manual on test** (required before prod; mirrors `production-rollout-checklist.md` §5 where applicable):
    1. **Logged out:** Lounge feed loads; composer hidden; like/comment/repost/bookmark read-only; no feed-related console errors.
    2. **Logged in:** Post and reactions; **load-more** cursor pagination for unpinned rows. **Pinned at top:** only applies when a `pinned = true` row exists (no in-app staff pin yet — use `supabase/seed/lounge_fake_posts.sql` tail or SQL editor; see Phase B “Staff pin/unpin” item).
    3. **Heavy tabs once:** Offers, Intel, Bankroll, Calculators (open each game once), Guides — no stuck `Suspense`; calculators work after first open.
    4. **Guides → Ask community:** insert succeeds where RLS allows (profile gate if applicable).
    5. **Offers / calendars / push:** offers save; calendar surfaces; edge paths per §4 / §5 in production checklist (align with Edge Functions rows above).
    6. **Profile (Lounge):** own profile → edit → save; change handle → **Confirm** → **Continue**; within 7 days → **Cooldown** → **Continue** keeps handle, saves rest; taken handle → conflict dialog; **mod/admin** save retains `role`. **Replies** tab + **Share profile** (`/u/<handle>`).
    7. **Feed carousels (incl. newly posted):** multi-image post — swipe to slide 2+; scroll the **feed** until that post’s media strip leaves the scroll area, then scroll back — carousel shows the **first** slide (scroll-root geometry + IO).
    8. **Repost:** menu opens **above** the Repost control on feed + post detail (portaled / `bottom-full`); already-reposted row shows manage actions in the same anchored popover (no bottom sheet).
    9. **Rate limit:** when posting is blocked, error strip is **above** the composer even with a tall draft.
    10. **Quote repost:** same vertical rhythm as main composer — **toolbar** (image / GIF / counter / Post) one line below the last caption line; optional media carousel under text with `mt-1.5`; cap modal if >6 images.
    11. **Lounge video:** after SQL **`lounge_feed_post_stream_video.sql`** + Edge **`lounge-cf-stream-direct-upload`** + secrets on test — pick a clip **under 60 seconds** and **under 200 MB** in the composer → **Post** → video plays in feed and post detail (HLS); **feed** first visible Stream tile autoplays; **Tap for sound** enables audio on the autoplaying clip and strip shows **Tap to mute** with **speaker-on** glyph; mute again silences; **tap video** → **hero expand** full-screen (same clip, swipe down on video to dismiss); scroll feels smooth (one HLS winner, no multi-tile staging); **load-more** adds **28** rows per fetch; **open post** (detail sheet) → **Quote repost** sheet appears **on top** (not behind); **Uploading post…** bar shows **Cancel** (capital C).
    12. **Composer + quote (media) regression** — tick on **test** after Lounge composer / quote / stacking / lightbox churn:
        - [x] **Main composer (baseline):** short Stream video post; long video → **trim/crop** modal → confirm → post; **image-only** post; **GIF-only** post — behavior matches expectations (no regressions). *(Ryan, 2026-05-18, **PASSED** on test.)*
        - [x] **Quote + short video:** Add media → short video → prep → **Post** → quote child appears in feed; **original** post row shows updated interactions where applicable (repost count / your repost state). *(2026-05-18 **PASSED**.)*
        - [x] **Quote + long video:** long clip → **crop** modal → confirm → prep → **Post**. *(2026-05-18 **PASSED**.)*
        - [x] **Quote + video variants:** video-only (no caption); caption + video; **remove** video from preview then post (or confirm Post disabled until valid per design). *(2026-05-18 **PASSED**.)*
        - [x] **Quote + media rules:** attach **GIF** then video (expect GIF cleared / rules as designed); attach **images** then video (expect images cleared). *(2026-05-18 **PASSED**.)* — **Why not mix?** One **visual** attachment model per row today: **`stream_video_uid`** (Cloudflare Stream) **or** still/GIF/carousel URLs (`image_urls` / `media_url` / `gif_url`), not both — see `supabase/lounge_feed_post_stream_video.sql` (“exclusive of `image_urls` / GIF in app logic”), feed tile (`LoungePostStreamVideo` vs images), upload/delete (Stream Edge vs Storage), and composer validation (`Remove the GIF before posting a video`). Image **+** external GIF in one post remains supported; **Stream video +** GIF/images would need product + schema + playback work to do safely.
        - [x] **Quote + upload bar Cancel** while video is **preparing** (quote prep cancels; quote UI still usable; no stuck modal). *(2026-05-18 **PASSED**.)*
        - [x] *(Optional)* **Staff crown / badge tip:** hover or tap **`LoungeBadgeHoverTip`** — reads/positions OK; dismiss on outside tap / **Escape** (`LoungeBadgeHoverTip.jsx`, 2026-05-18).
    13. **Lounge chat:** after **`chat_phase1.sql`** + Edge **`lounge-chat`** on test — dock **Chat** → Inbox / Topics; subscriber (or staff) can **Join** a topic; two completed profiles exchange a **DM** (profile **Message** beside Follow opens dock); send message; Realtime (messages appear without refresh). *(Ryan, 2026-05-18, **PASSED** on test @ **`aa222ec`**.)*
    14. **Lounge FAB wheel:** tap **+** → wheel; open **Search** / **Chat** / **Settings**; toggle **Following** (cyan fill, no extra glow); **Compose** from feed and from an open panel (keyboard); long-press **+**, drag, release over a post — post must **not** open (brief ~1s dead zone OK); liked chip-heart + count alignment when toggling like. **Upload bar:** while **Uploading post…** / prep bar is visible, FAB **nudges up** so **Cancel** is not covered. **Stream + image lightbox:** open feed **video hero** or **image/GIF** full-screen → dock **FAB hidden**; Stream **swipe down on the video** dismisses; backdrop **solid black** when landed (not translucent during expand). *(Ryan, 2026-05-19, **PASSED** on test @ **`f6a975e`** for image/GIF FAB hide.)*
    15. **Video submit queue + parallel prep** (after **`57eaca2`** on test):
        - [x] **Back-to-back videos:** post video 1, immediately post video 2 → bar **Post 1 of 2** / **Post 2 of 2**; both appear in feed with playable video + poster. *(Ryan, 2026-05-18, **PASSED**.)*
        - [x] **Fast lane:** while video 1 uploading, post text-only, image-only, and GIF-only — each lands **without** waiting for the video queue to drain. *(2026-05-18 **PASSED**.)*
        - [x] **Parallel prep:** DevTools **Network** while **Post 1 of 2** active — **two** **`lounge-cf-stream-tus-create`** (201) and **two** tus upload ids (`?tusv2=true`) before job 2's bar turn; red **`video.m3u8`** poll noise OK if posts succeed. *(2026-05-18 **PASSED**.)*
        - [x] **Profile Likes hydration:** Likes tab → open liked post → like toggle does not **`post_likes_pk`** duplicate error. *(2026-05-18 **PASSED**.)*
    16. **Lounge search (Phase G):** migrations **`20260518160000`** through **`20260520190000`** on test — **logged out:** dock **Search** or **#hashtag** tap → create-account modal (no panel). **Logged in:** search **2+ chars** finds posts **not** in loaded feed (caption / game / hashtag) and matching **comment bodies** in one mixed feed; **Profiles** when handle/display/about match — **highlight**, **Recent** chips, **Top / Latest**, **`@handle` keyword**, relevance ordering; tap comment/post → detail over search; **←** back preserves query. *(Ryan, 2026-05-21, **PASSED** on test — full **§16** stack.)*
    17. **Lounge media lightbox (unified chrome + pinch):** feed image → full-screen lightbox — pinch zoom + pan; swipe down at 1× dismisses. Stream video → hero expand — author row / caption layout OK in portrait; interaction bar (like/repost/bookmark) works; repost submenu above controls. Repeat from post detail and profile Posts tab. *(Ryan, 2026-05-19, **PASSED** on test.)*
    18. **Direct comment entry + profile unfollow sync** (after **`59a26bd`** + **`dd02294`** on test): **Profile Replies** or **comment-repost** card → post detail opens, sheet lands, **smooth scroll** to focused comment (title bar stays put); in-feed comment drill still **instant**. **Unfollow** from profile or follow list → close sheet → feed **Follow** pill returns; **Following** filter drops them without refresh. *(Ryan, 2026-05-19, **PASSED** on test.)*
    19. **Comment sort — Relevant (Phase E):** open a busy post detail → default **Relevant** puts freshly posted comment at top (viewer pin); older low-engagement roots sink below higher-engagement / recent activity; switch **Popular** / **Most liked** / **Oldest first** and back — order changes predictably. Drill into a thread → sibling replies read **oldest-first** in Relevant mode. *(Ryan smoke pending.)*
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - **Sign-off (Phase G search full stack, 2026-05-21, Ryan):** Migrations **`20260518160000`**–**`20260520190000`** applied on test; smoke **§16** **PASSED** (comments, highlight/recent/about, Top/Latest, **`@handle` keyword**, relevance ranking).
  - **Sign-off (Stream lightbox author badges + feed sound platform split, 2026-05-21, Ryan):** Lightbox admin/mod/OG badges match feed meta row @ **`07676a0`**; Android feed-wide sound + iOS per-tile unmute @ **`f42f20a`** — **PASSED** on fresh test deploy.
  - **Sign-off (Phase G search + lightbox + posters + comment repost, 2026-05-19, Ryan):** Smoke **§16** + **§17**; Stream poster **WebP on R2** (new upload + delete @ **`93dcc3f`**); comment-repost / thread nav (**`b782e69`**) — **PASSED** on **test**.
  - **Sign-off (comment entry scroll + FAB image lightbox + unfollow sync, 2026-05-19, Ryan):** **`f6a975e`** image/GIF FAB hide; **`59a26bd`** direct comment smooth entry; **`dd02294`** profile unfollow → feed session — **PASSED** on **test** (smoke **§14** / **§18**).
  - **Sign-off (Lounge R2 images, 2026-05-19, Ryan):** Upload + delete on **`media-test.lvslotpro.com`**; legacy migration (**68** objects); cache headers — **PASSED** on **test** @ **`0978782`**.
  - **Sign-off (composer + quote media + badge tips, 2026-05-18, Ryan):** Smoke **§12** items **PASSED** on **test**; badge tip stickiness addressed with document **pointerdown** + **Escape** dismiss on open tip.
  - **Sign-off (video submit queue + parallel prep, 2026-05-18, Ryan):** Smoke **§15** **PASSED** on **test** (`57eaca2`); async two-video test + DevTools two-mint/two-tus lanes; fast-lane mixed stack; profile likes re-like.
  - **Sign-off (Stream poster + dims, 2026-05-17, Ryan):** Extended checklist (session items **2–13**): all **PASSED** on **test**; SQL **`lounge_feed_post_stream_video.sql`** (including **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`**) applied on the test Supabase project.
  - **Sign-off (Lounge Stream autoplay + detail overlay, 2026-05-18, Ryan):** Feed handoff pause frame, profile Posts autoplay, comment/detail HLS + lightbox, background audio stop on post/comment detail open — **good enough for now** on **test** @ **`dbd4fa1`** (iPhone PWA).
  - **Sign-off (feed video perf diet, 2026-05-18, Ryan):** 30s feed scroll (smooth, one winner), hero tap without poster-on-top flash, load-more **28** rows — **PASSED** on **test** @ **`dbd4fa1`**.
  - **Sign-off (feed interactions Phase E/F, 2026-05-18, Ryan):** Likes, reposts, bookmarks, post + comment threads on feed/post detail/profile — counts and toggles **PASSED** on **test** @ **`b8d55d3`** (SQL applied on test project).
  - **Sign-off (Lounge chat MVP, 2026-05-18, Ryan):** Smoke **§13** **PASSED** on **test** @ **`aa222ec`** — Chat panel, topic join (subscriber/staff), profile **Message** → DM, send/receive, Realtime without refresh.
  - **Sign-off (Phase C profiles + identity, 2026-05-18, Ryan):** **`/u/:handle`** share/deep link + handle conflict dialog (taken/reserved) — **PASSED** on **test** @ **`7ce7b44`**; smoke **§6** profile bullets.
  - Production replay: same ordered pass on production after deploy.

- [ ] Final pre-prod gate
  - Change: Mark all required sections here as complete before running production rollout checklist.
  - Production replay: Execute checklist top-to-bottom with no skipped items.

---

## Update log

- 2026-05-21: **Phase E Relevant comment ranking (client build):** **`loungeFeedCommentSort.js`** — weighted engagement + gravity/time decay for post-detail **Relevant** roots; viewer just-posted pins stay first; modest OP-root and following boosts; nested drill-down replies **oldest-first** in Relevant mode. Smoke **§19** pending Ryan sign-off on **test**.

- 2026-05-21: **Phase G search stack sign-off (test):** Ryan — migrations **`20260518160000`** through **`20260520190000`** (comments, about/highlight/recent, ranking/rate limit, bundled RPC, hardening, **`@handle` keyword**, volatile, relevance) applied on test Supabase; smoke **§16** **PASSED**.

- 2026-05-21: **Stream lightbox author badges + feed sound platform split (test):** Ryan smoke **PASSED** on fresh deploy — lightbox badges match feed meta row @ **`07676a0`**; Android feed-wide + iOS per-tile sound @ **`f42f20a`**.

- 2026-05-21: **Feed-wide sound platform split (test):** @ **`f42f20a`** — iOS per-tile Tap for sound; Android/desktop feed-wide + 60%/40% bands. Ryan sign-off **PASSED** (smoke 2026-05-21).

- 2026-05-21: **Feed-wide sound iOS shared player reverted (test):** @ **`e74479a`** Ryan — **Tap for sound kills the app** (WebKit crash). Root cause: shared mode **`mountStreamVideo:false`** unmounts local `<video>` while Tap-for-sound still runs **muted `play()` + unmute** on tile **and** **`unmuteIosSharedStreamInGesture`** on shared host → stacked play/unmute on cold attach (same class as **`4bc9660`**). Fix: **disable `LoungeFeedIosSharedStreamHost`** integration; restore per-tile video + **`cf50c94`** gesture path (direct DOM unmute when already playing). Autoplay stable; feed-wide sound across scroll **still iOS-limited** (gesture / finger-down). Shared-player files kept for future rework. Ryan sign-off **pending**.

- 2026-05-21: **Feed-wide sound iOS shared inline player (test):** @ **`cf50c94`** Ryan — debug shows active tile **`muted:false`**, **`paused:false`**, ratio **1.0** but **no audio** after finger lift (WebKit silences non-gesture output on per-tile `<video>` handoffs). Fix: **`LoungeFeedIosSharedStreamHost`** — one persistent `<video>` reparents to active tile flyout when **`iosSharedFeedSoundMode`** (Apple + feed-wide Tap for sound); Tap-for-sound unmutes **that** element; handoffs swap HLS src on same node. **Reverted** — Tap for sound crashed WebKit @ **`e74479a`**. Ryan sign-off **pending**.

- 2026-05-21: **Feed-wide sound iOS swipe-only audio (test):** @ **`0a1ef08`** Ryan — sound only while finger down swiping; debug shows handoffs at **ratio 0.06** (gesture unmute skipped) + **`playing`** sync re-muting on **≤40% OFF band** after finger up / momentum. Fix: **`iosFeedSoundGestureUnlockedRef`** — once gesture-unmuted, skip OFF-band auto-mute until handoff away; allow unmute during active touch even below OFF band; **touchend** unmute before clearing touch flag. Superseded by shared player above for persistent audio. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound iOS gesture play-storm (test):** @ **`566dee6`** Ryan — better than prior but audio sketchy ~video 3, gone ~video 6. Root cause: gesture path always **`muted play()` then unmute** on already-playing clips → MSE segment restarts stack over handoffs; async handoff retries outside gesture window. Fix: **DOM unmute only** when already playing in gesture; **`notifySoundGesture`** on sync **scroll ticks** + active handoff while finger down; remove async handoff **`play()`** retries and iOS **`playing`** programmatic unmute. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound iOS gesture chain (test):** @ **`95aa15e`** Ryan — autoplay smooth, sound still video 1 only. Root cause: iOS **blocks programmatic DOM unmute** on handoff tiles (no user gesture); prior fixes ran outside gesture stack. Fix: scroll-root **`touchstart`/`touchend`** → **`notifySoundGesture`** on active tile; **`tryCoordinatedGestureUnmute`** (muted `play()` then unmute, same as Tap for sound); mid-scroll handoff while finger down inherits gesture. Superseded by play-storm fix above. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound iOS handoff silent (test):** @ **`964e3f7`** Ryan — autoplay smooth but no audio after video 1. Root cause: iOS blocked all post-`play()` unmutes; 60% band cross often fires while tile still paused so one-shot never retried. Fix: **`tryCoordinatedDomUnmute`** after muted `play()` resolves + on first **`playing`** in ON band (still one DOM unmute per handoff, no `play()` loop). Superseded by gesture chain above. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound iOS MSE handoff storm (test):** @ **`ccf47d4`** Ryan — sound OK ~4 clips; video 5 glitches/restarts; video 6+ no sound + autoplay trouble; debug shows `play ok ct=0.0` storm + coordinator collapse. Root cause: continuous **`tryCoordinatedDomUnmute`** on every `tileRatio` tick + **`playing`** re-unmute on Apple MSE restarts the segment. Fix: **one DOM unmute per active handoff** (`iosFeedSoundHandoffDomUnmuteUsedRef`); **edge-trigger** unmute only when tile **crosses 60% ON band**; iOS **`playing`** listener **mute-only**; warm handoff already ≥60% gets delayed one-shot unmute. Superseded by handoff silent fix above for **`playing`** path. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound band retry (test):** handoffs often fire below 60% visible — one-shot unmute never ran when tile centered (video 5+ stayed `muted:true`). Fix: inherit feed-wide sound on handoff, **`tryCoordinatedDomUnmute`** retries on ratio settle (350ms throttle, no `play()`). Superseded by iOS MSE handoff storm fix above. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound iOS crash (test):** `4bc9660` rAF `play()` after unmute + `playing` listener re-entry caused infinite loop (feed cards vanish / WebKit crash). Fix: **one DOM unmute per handoff**, **never `play()` from sound sync**, playing listener **mute-only**. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide sound + iOS autoplay handoff (test):** feed-wide unmute on scroll was DOM-unmuting during band sync on Apple MSE, stalling playback after ~4 handoffs. Fix: **`applyCoordinatedAudibleAfterPlay`** — always **muted `play()`** first; unmute once after play; if iOS stalls, **resume muted** (autoplay keeps going). Tap-for-sound uses muted-then-unmute within gesture. Ryan sign-off **pending**.

- 2026-05-20: **Feed-wide inline sound restored (test):** re-enabled **`feedInlineSoundUnmuted`** in **`LoungeFeedVideoAutoplayContext.jsx`** — Tap for sound on any feed tile unmutes the scroll column; 60%/40% visibility bands on active clip; **`LoungeFeedInlineSoundResetBinder`** resets on post detail open. Reverts 2026-05-19 per-tile-only experiment.

- 2026-05-20: **Ryan sign-off (test):** **Lounge Stream ~frame-5 freeze on Apple WebKit — FIXED** @ **`8302abb`**. Root cause: **native HLS** (`video.src` manifest) compositor stall (~frames 5–6, audio continues, same frame every time). Fix: **`preferMseHls`** in **`LoungePostStreamVideo.jsx`** — iPhone/iPad use **hls.js MSE** when supported (debug attach **`mse`**); falls back to native if MSE unavailable. Ryan: cold open, scroll handoff, scroll-back — **behaves as expected** on iOS 18.7 Safari. Experiments #1–#5 (decoder limits, poster crossfade, in-flow layout, splash gating) did not fix; reverted before MSE. **Deferred:** ring prefetch polish / handoff nice-to-haves to reintroduce carefully on Apple.

- 2026-05-20: **Lounge cold-boot splash timing:** member splash **2s min / 3s max** (feed-ready dismiss between those bounds).

- 2026-05-20: **Lounge cold-boot splash (client, unverified on test):** CSS **`LoungeAppSplash`** + **`useLoungeColdBootSplash`** — Home tab only; cold open + **>10 min** background resume (skip when composer draft / upload bar / in-flight submit); anonymous short flash; feed loads under overlay. Smoke: fresh tab → logo animation → feed; background **>10 min** without pending work → splash again; **`?tab=offers`** → no splash.

- 2026-05-20: **Phase G search relevance ranking (test build):** **`lounge_search_match_relevance()`** (phrase > word-boundary > substring > fuzzy); **`lounge_search()`** returns **`search_relevance`** on posts/comments and ranks by it before Top/Latest tie-break; client merged feed sort uses **`search_relevance`** — migration **`20260520190000_lounge_search_relevance_ranking.sql`**.

- 2026-05-20: **Phase G @handle + keyword (test build):** **`@selena buffalo`** parses handle **`selena`** + keyword filter on posts/comments — migration **`20260520180000_lounge_search_handle_keyword.sql`**.

- 2026-05-20: **Phase G search bundled RPC (test build):** **`lounge_search()`** single call (pagination meta, **`about_me`** profile match, index-aware **`lounge_search_text_matches`**, **`lounge_search_analytics`**, rate limit **30/5min**); client **`loungeSearch()`** + **Load more** — migration **`20260520170000_lounge_search_bundled.sql`**.

- 2026-05-20: **Phase G search hardening (test build):** **`lounge_normalize_search_term`** caps at **128** chars; substring match via **`strpos`/`starts_with`** (no LIKE `%`/`_` wildcard abuse); **5s `statement_timeout`** per RPC — migration **`20260520160000_lounge_search_hardening.sql`**; client **`maxLength`** on dock search input.

- 2026-05-20: **Phase G search ranking + limits (test build):** **`@handle`** bias, **`pg_trgm` similarity**, **`p_sort`** engagement/recent, **`lounge_search_enforce_rate_limit`**, client Top/Latest + **Trending in your feed** copy — migration **`20260520150000_lounge_search_ranking_rate_limit.sql`**.

- 2026-05-20: **Phase G search UX (test build):** Query **highlight** in post captions, comment bodies, and profile **about_me** (**`loungeSearchHighlight.jsx`**); **Recent** searches (**`loungeSearchRecentPref.js`**, max 8, **`loungeSearchRecent:v1`**); profile rows **2-line about_me**; **`lounge_search_profiles`** migration **`20260520120000_lounge_search_profiles_about_me.sql`**. Apply on test before smoke **§16** highlight/recent/about bullets.

- 2026-05-19: **Phase G comment search (test build):** **`lounge_search_comments`** RPC + trgm index on **`feed_comments.body`**; migration **`20260519120000_lounge_search_comments.sql`**; client **`loungeSearchApi.js`** + dock **Comments** section in **`LoungeDockSlidePanels.jsx`** (**`ProfileReplyRow`**). Apply on test before smoke **§16** comment bullets.

- 2026-05-19: **Ryan sign-off (test):** **`f6a975e`** FAB hide on image/GIF lightbox; **`59a26bd`** direct comment entry smooth scroll; **`dd02294`** profile unfollow → feed session sync — **PASSED** (smoke **§14** / **§18**).

- 2026-05-19: **Ryan sign-off (test):** Smoke **§16** Phase G search, **§17** unified lightbox + pinch, Stream poster **WebP on R2** @ **`93dcc3f`**, comment-repost **`b782e69`** — **PASSED**.

- 2026-05-19: **Stream tile posters → WebP on R2:** **`loungePostSubmitJob.js`** + **`loungeCommentSubmitJob.js`** run captured JPEG frames through **`prepareLoungeFeedImageForUpload`** before **`uploadLoungeFeedPostImage`** (parity with feed stills). Legacy **`.jpg`** poster URLs unchanged.

- 2026-05-19: **Continuity docs (full May 18–19):** backlog FE rows for unified **`LoungeStreamLightboxContext`** lightbox, **`loungeLightboxImageZoom.js`** pinch/pan, comment-repost fix (**`b782e69`**); smoke **§17**; R2 sign-off line; **`WAKEUP`** + prod checklist §2 search/cooldown/rate-limit migrations; **`AGENTS.md`** / **`frontend-architecture.md`** lightbox anchors.

- 2026-05-19: **Lounge unified media lightbox (test):** Stream + image/GIF share **`LoungeStreamLightboxContext`** + renderers (**`966b138`** → **`4cba554`**); Stream author row polish (**`7591f8d`**); image pinch-to-zoom (**`9b0f9b5`**). Ryan sign-off **PASSED** smoke **§17** (2026-05-19).

- 2026-05-19: **R2 continuity docs:** **`1472e31`** — canonical doc pass for test sign-off + prod §3.5 (follows code commits **`35ca49a`** → **`0978782`**).

- 2026-05-18: **Phase G — Lounge server search (test build):** **`supabase/lounge_search_phase_g.sql`** + migration **`20260518160000_lounge_search_phase_g.sql`** (`lounge_search_posts`, `lounge_search_profiles`, `pg_trgm` indexes; auth-only). Client: **`loungeSearchApi.js`**, **`LoungeDockSlidePanels.jsx`** (debounced RPC + profile rows + local trending when query &lt; 2 chars), **`SocialFeed.jsx`** auth-gates dock search + hashtag tap. Smoke **§16**; apply SQL on test before validation.

- 2026-05-18: **Phase C sign-off (Ryan):** **`/u/:handle`** permalink + OG + deep link; handle conflict dialog (taken/reserved). Phase C backlog row + FE rows checked; smoke **§6**. **PASSED** on **test** @ **`7ce7b44`**.

- 2026-05-18: **Lounge chat MVP (test sign-off, Ryan):** Smoke **§13** **PASSED** on **test** @ **`aa222ec`** — dock Chat, topic join, profile Message → DM, send/receive, Realtime live updates. Backlog chat SQL/Edge/client/Realtime rows checked.

- 2026-05-18: **Feed interactions Phase E/F (test sign-off, Ryan):** `feed_interactions_phase_ef.sql` + comment interaction migration on test; Lounge like/repost/bookmark + post/comment threads **PASSED** on **test** @ **`b8d55d3`**.

- 2026-05-18: **Lounge Stream autoplay hardening (test sign-off, Ryan — good enough for now @ `dbd4fa1`):** Comment/detail black lightbox + iOS HLS decoder budget (`hlsAttachEnabled`); feed handoff pause-frame regression fix; profile Posts/Likes/Bookmarks **`LoungeFeedVideoAutoplayProvider`**; **`pauseAllLoungeStreamInlineVideos`** + **`coordinatorSuspended`** pause/mute on post/comment detail open; Settings **Video debug HUD** toggle. Commits **`718d014`** → **`dbd4fa1`**.

- 2026-05-18: **Centerline handoff (test):** primary active swap when next/prev Stream tile **midpoint crosses scroll-column center**; clip thresholds remain fallback. **`loungeFeedVideoAutoplayStore.js`**.

- 2026-05-18: **Restore 7-day handle change cooldown (test):** migration **`20260518150000_restore_profile_handle_change_cooldown.sql`**; client confirm/cooldown modals back in **`LoungeProfileFullScreen.jsx`**. **Apply migration on Supabase test.**

- 2026-05-18: **Handle conflict dialog (test):** **`ProfileHandleConflictDialog.jsx`** + **`checkProfileHandleAvailability`**. Ryan sign-off **PASSED** @ **`7ce7b44`** (Phase C sign-off).

- 2026-05-18: **Profile permalink `/u/:handle` (test):** **`loungeSharePost.js`**, **`api/lounge-profile-og.js`**, **`SocialFeed.jsx`** deep link. Ryan sign-off **PASSED** @ **`7ce7b44`** (Phase C sign-off).

- 2026-05-18: **Title bar build badge (test):** **`TitleBarStatusLine.jsx`** — git SHA when **`import.meta.env.DEV`** or **`VITE_SHOW_BUILD_BADGE=true`**.

- 2026-05-19: **Per-tile inline sound (test):** removed feed-wide `feedInlineSoundUnmuted` from **`LoungeFeedVideoAutoplayContext.jsx`**; **`LoungePostStreamVideo.jsx`** Tap for sound unmutes **this clip only** (autoplay handoffs stay muted; sound resets when tile loses active). Removed **`LoungeFeedInlineSoundResetBinder`** from **`SocialFeed.jsx`**. Ryan sign-off **pending**. **`loungeFeedVideoAutoplayStore.js`** — `{prev, active, next}` ring (max 3 decoders), visibility handoff thresholds, flinger idle 200ms, **hero lock** (ring → hero tile only), coordinator suspend when post detail open. **`LoungePostStreamVideo.jsx`** + **`LoungeFeedVideoAutoplayContext.jsx`** — feed-wide Tap for sound + 60%/40% audio bands; hero-first resource budget on expand.

- 2026-05-18: **Plain repost interaction hydration (test, Ryan sign-off):** Feed/profile interaction refresh now includes **embedded original post IDs** for plain repost cards — fixes “You reposted” header with **inactive repost glyph** and duplicate plain-repost error. **`collectLoungePostInteractionHydrateIds`** in **`communityFeedPost.js`**; **`SocialFeed.jsx`** + **`LoungeProfileFullScreen.jsx`** (Likes/Bookmarks tab refresh).

- 2026-05-18: **Feed video perf diet (test):** **`loungeFeedVideoAutoplayStore.js`** — drop multi-tile HLS **staging** (was cap 24 paused decoders); **winner-only** attach + IO prefetch margin. **`LoungePostStreamVideo.jsx`** — **`pinInlinePosterBehindFlyout`** on hero tap (poster behind flyout, not above). **`AppShell.jsx`** **`COMMUNITY_FEED_PAGE_SIZE = 28`**. Backlog open row + smoke **§11** updated; Ryan sign-off **pending**.

- 2026-05-18: **Stream hero expand + prefetch staging + feed page 40 (test, `4cba1e5` → `7dbbec7`):** **`LoungePostStreamVideo.jsx`** — X-style hero FLIP (same `<video>`, GPU transform, tap snapshot, canvas frame shield, deferred scrim, swipe dismiss on flyout); **`loungeFeedVideoAutoplayStore.js`** — prefetch-band **staging** (winner plays, neighbors attach HLS paused, cap 24); **`AppShell.jsx`** **`COMMUNITY_FEED_PAGE_SIZE = 40`**. Continuity: **`AGENTS.md`**, **`docs/social-feed-roadmap.md`** (D2), **`docs/frontend-architecture.md`**, smoke **§11** / **§14**, this backlog (new checked row + video row refresh). Ryan sign-off on hero/staging smoke **pending**.

- 2026-05-18: **Video submit queue + fast lane + parallel prep (test sign-off, Ryan):** **`SocialFeed.jsx`** — video-only **`loungeSubmitQueueRef`** drain (**Post X of Y**); text/image/GIF **`runFastLaneLoungeSubmit`**; waiting jobs parallel encode/upload via **`loungeQueuedVideoPrep.js`** while active job owns bar; queued poster pin + deferred composer prep; profile Likes interaction hydration + duplicate-like recovery. Commits **`7f93eb8`**, **`57eaca2`**. Smoke **§15** **PASSED**; backlog checked item + sign-off. Rate-limit SQL **`20260518103000_fix_rate_limit_profiles_user_id.sql`** — apply on test/prod Supabase if not already.

- 2026-05-16: **Profile Replies tab + dock upload overlap + Stream lightbox UX (restored on `test`, `24690aa`):** **`LoungeProfileFullScreen.jsx`** — Replies tab loads profile user's **`feed_comments`** (hidden filtered), hydrates parent posts, **`ProfileReplyRow`** with parent embed. **`SocialFeed.jsx`** — `onOpenProfileReply` → `openLoungePostDetail(post, { focusCommentId })` → `openLoungeCommentDetail` once comments load. **Upload bar vs FAB:** `loungeUploadBarRef` + `ResizeObserver` → **`bottomObstacleInsetPx`** on **`LoungeDockArcCarouselPrototype`**; **`loungeDockFabPosition.js`** `bottomObstaclePx` on move bounds / corner snap. **Stream lightbox:** **`loungeStreamLightboxRegistry.js`** + `useSyncExternalStore` in **`SocialFeed.jsx`** hide viewport dock while any Stream fullscreen is open; **`LoungePostStreamVideo.jsx`** opaque **`bg-black`** shell + footer (was `bg-black/75` + blur). Smoke **§6** / **§14** wording updated; Ryan sign-off pending on test deploy.

- 2026-05-16: **Lounge post detail — comment media:** `feed_comments` post-parity columns (`supabase/migrations/20260516140000_feed_comments_media.sql`); reply composer supports images/GIF/Stream (`loungeCommentSubmitJob.js`, `SocialFeed.jsx`); thread display via `LoungePostFeedImagesAndGif` — `commentInline` (~⅔ detail height) on main list, full `detail` on focused Reply drill-down; media-only replies allowed; edit/delete reuse post media rules + Stream orphan cleanup on delete.

- 2026-05-15: **Post detail — OP-only inline nest:** Main list still **root** comments first; replies authored by the **post owner** with `parent_id` pointing at a **root** render **below** that parent in **`LoungePostCommentThread.jsx`** (`postAuthorUserId` from **`SocialFeed.jsx`**): **same horizontal layout** as other comments; **vertical connector** at parent avatar column only. OP replies whose parent is not a visible root still appear as **extra root rows** (no silent drops). Comment drill-down (`variant="commentDetail"`) unchanged.
- 2026-05-15: **`feed_comments.body` max 280** (matches post captions): client **`LOUNGE_COMMENT_BODY_MAX`** in **`SocialFeed.jsx`**; **`supabase/feed_interactions_phase_ef.sql`** + migration **`supabase/migrations/20260515180000_feed_comments_body_max_280.sql`** (truncates existing rows over 280, then constraint).
- 2026-05-15: **Lounge post detail — sticky comment composer:** Bottom-sheet footer with **feed-parity UX** — collapsed **“Post your reply”** pill (no toolbar); tap expands to **autosizing** textarea + media/GIF icons (text-only hints until schema supports attachments), **char counter** (**280**, same as posts), cyan **Reply**; **`visualViewport`** overlap lifts footer with keyboard; **`expandAndFocus`** + **`scrollLoungePostDetailToTopInstant`** on open / reply interaction; **`composerSlot` removed from `LoungePostCommentThread.jsx`**.
- 2026-05-15: **Lounge comments — interaction row per card:** each comment uses **`LoungePostInteractionBar`** (`variant="sheet"`) with the **opened post** as `post` (same handlers as post detail / lightbox: like, repost menu, bookmark). **`comment_count`** on that merged object is overridden per row with **direct child reply count** for the bubble. **`onCommentClick`** → reply composer for that comment. **`LoungePostCommentThread.jsx`** + **`SocialFeed.jsx`** props mirror **`renderDetailMediaLightboxFooter`**.
- 2026-05-15: **Brand palette (Tailwind + CSS):** **`src/index.css`** defines **`lv-red/orange/yellow/blue/green/purple`** + **`--lv-*`** on **`:root`**; **`cyan-*`** + **`violet-*`** scales retuned to electric blue **`#06cefc`** and purple **`#9d00ff`**. Wired through **`loungeDockFabGlow.js`**, **`loungeDockArcCarouselItems.jsx`**, dock slide panels, coach SVG accents, Offers datepicker, Lounge likes (**`#fd262d`**) / bookmarks (**`#ffea00`**). **`docs/frontend-architecture.md`** § Brand palette.
- 2026-05-15: **Lounge FAB reposition while menu open:** Long-press + drag on the **+** works when the dock menu is **expanded** (same timing as when closed); short tap still **closes** the menu. (`LoungeDockArcCarouselPrototype.jsx` — reposition timer no longer gated on `!open`.)
- 2026-05-15: **Lounge FAB reposition coach (one-time):** On first successful **tap** that **opens** the dock menu from the **+** FAB, a **`localStorage`**-dismissed overlay explains **long-press → drag** to move the button; backdrop tap, **Got it**, or **Escape** dismiss (`loungeDockFabRepositionCoach:v1` in **`loungeDockFabPosition.js`**, **`LoungeDockArcCarouselPrototype.jsx`**). Copy includes **Wheel (O)** vs **Edge (L)** schematics and **Settings** pointer for Edge. **`readLoungeDockMenuLayout()`** persists **`wheel`** on first read when **`loungeDockMenuLayout:v1`** is missing so new users default to Wheel (O).
- 2026-05-15: **Lounge dock menu backdrop — tap vs pan:** Dimmer uses **pointer capture** + **`BACKDROP_PAN_THRESHOLD_PX`**. **Pan** (movement ≥ threshold): release capture, **`requestAnimationFrame` → `setOpen(false)`** so the gesture can continue on the feed. **Tap** (no threshold): **`pointerUp`** → **`preventDefault`**, **one-shot `window` `click` trap** (capture), **`flushSync` close** — avoids opening post detail / media from a “through” activation. (Supersedes “close on dimmer **`pointerDown`** only” experiments.)
- 2026-05-15: **Lounge FAB reposition snap:** **`snapFabToBottomCornerForDropSide`** after long-press drag runs only in **Edge (L) / `cornerL`** — **Wheel (O)** keeps the dropped position (persist still).
- 2026-05-15: **Lounge dock interaction polish:** After **FAB long-press reposition**, snap to **bottom-left/right corner** by screen half. **Wheel spin:** `preventDefault` on spin **`pointermove`** + **document `touchmove` capture** while **`spinning`** to reduce iOS edge/reachability stealing the gesture. **Menu item selection:** **`flushSync` close** then **`onSelect`** then **pointer guard** (feed was `pointer-events: none` if guard ran before compose focus). Removed **double `requestAnimationFrame`** around **`onSelect`** (broke iOS keyboard user activation). (**Menu dimmer** tap vs scroll doc’d in the bullet above.)
- 2026-05-15: **Lounge compose → keyboard:** Dock **New post** / collapsed caption row use **`flushSync`** + synchronous **`focusLoungeComposerCaption`** (caret at end) + retries in **`loungeDockComposeFocus.js`**; post detail / profile closed via **`finalizeLoungePostDetailClose`** / **`finalizeProfileModalClose`** (no 400ms overlay wait) so focus isn’t under **`z-[98]`** / panel chrome. **`scrollLoungeFeedToTopInstant`** when opening from dock.
- 2026-05-15: **Lounge dock Wheel (O):** **Right-half FAB** uses **negated ring step** in **`loungeDockWheelLayout`** so index order (compose→…→notifications) tracks the **same screen-relative arc** as on the left. **Open menu:** menu **`z-index` 55**, FAB lowered to **20**, wheel items rendered **after** FAB; **56px** min touch targets on wheel. **`LoungeDockArcCarouselPrototype`** dock layer **`createPortal` → `document.body`** ( **`z-[115]`** ) so wheel chips at the **viewport edge** are not clipped / lose hits under **`SocialFeed`** **`overflow-hidden`**.
- 2026-05-15: **Lounge dock wheel spin — tap any chip:** In **`spinEnabled`** mode, **`onItemPointerEnd`** no longer gates **`selectItem`** on **`offset.onScreen`** (padded viewport center check). Direct tap selects that item if the pointer didn’t move (spin slop). Picker / “focus” chip still drives snap highlight; dimmed chips remain a visual hint only. 
- 2026-05-15: **Wheel compact home = Edge (L) gap:** With dock **panel chrome** and menu **collapsed**, Wheel (O) pins the **home** chip at **`loungeDockWheelCompactHomeOffset`** (same ±**`loungeDockLShapeStepPx()`** as L’s first slot), not the ring radius; **open menu** uses normal wheel layout — **300ms** `left`/`top` transition for that home icon on panel screens.
- 2026-05-15: **Lounge dock item order:** **`buildLoungeDockArcCarouselItems`** returns **`wheelItems`** + **`cornerLItems`**. **Wheel (O):** **home**, then **compose → following → settings → search → chat → notifications**. **Edge (L):** bottom leg **home → notifications → chat → search**, vertical leg **compose → following → settings**. **`LoungeDockArcCarouselPrototype`** uses **`cornerLItems`** when **`menuLayout === 'cornerL'`**, else **`items` / wheel** order.
- 2026-05-15: **Fix: Lounge dock panels black screen —** `SocialFeed.jsx` passed **`blockUnderlyingPointer`** to **`LoungeDockSlidePanels`** but the panel component did not destructure it; **`ReferenceError`** on open (e.g. Settings). Added **`blockUnderlyingPointer = false`** to props in **`LoungeDockSlidePanels.jsx`**.
- 2026-05-14: **Lounge FAB wheel + likes (continuity):** Primary dock nav = **`LoungeDockArcCarouselPrototype`**; footer bar disabled; reposition click guard **1s** + document capture (**`2231883`**); chip-heart **`LoungeFlameIcon`**, share in **⋯** menu, compose focus helper. Documented in **`AGENTS.md`**, **`docs/social-feed-roadmap.md`** (Phase B FAB table), **`docs/frontend-architecture.md`**, smoke **§14**.
- 2026-05-14: **Lounge menu layout (Wheel O vs Edge L):** **`loungeDockMenuLayout:v1`** in **`loungeDockFabPosition.js`**; Settings dock panel toggles; **`LoungeDockArcCarouselPrototype`** `menuLayout` — L mode = bottom-corner snap + **`loungeDockLShapeOffsets`** (straight segments); wheel mode unchanged.
- 2026-05-14: **Lounge Following feed filter:** **All** / **Following** switch on home (`LoungeFeedScopeSwitch`, `loungeFeedScope.js`, `AppShell` load/more queries). Backlog item checked; smoke on test pending.
- 2026-05-14: **Planned (Lounge feed):** **Following** tab on Lounge home — backlog checkbox + Phase B roadmap note (`profile_follows`–scoped feed).
- 2026-05-14: **Lounge feed Stream sound:** opening **post detail** resets **inline “Tap for sound”** to muted on the feed (`LoungeFeedVideoAutoplayContext` `resetFeedInlineSound` + `LoungeFeedInlineSoundResetBinder` in **`SocialFeed.jsx`**).
- 2026-05-14: **Lounge nested comments (post detail):** `feed_comments.parent_id` threaded UI — **`LoungePostCommentThread.jsx`** + **`loungeFeedComments.js`** (removed 2026-05-15); **`SocialFeed.jsx`** loads full comment tree. *(Originally: Reply target + Show replies / OP preview — replaced by tap-through drill-down.)* `comment_count` still top-level only (existing SQL).
- 2026-05-15: **Lounge comment drill-down:** Post detail lists **root** comments only; tap opens full-panel **Reply** view (`loungeCommentDetailPathIds`) with direct replies **newest-first** + composer `parent_id` = focused comment; ← pops stack / exits to post. Removed inline **Reply** / **Show N replies** / ruler above stats row. Historical OP-collapse helpers dropped from client (`loungeFeedComments.js` removed).
- 2026-05-13: **Chat RLS:** `chat_room_members` SELECT policy no longer uses `EXISTS` on the same table (Postgres **infinite recursion**). Policy is **own membership rows only**; **`LoungeChatPanel`** resolves DM peer display from **`chat_rooms.dm_key`**. Patch file **`supabase/chat_room_members_rls_recursion_fix.sql`** for DBs that already ran the old policy.
- 2026-05-13: **Lounge chat MVP (wiring):** `LoungeChatPanel.jsx` + `loungeChatApi.js` / `loungeChatConstants.js`; **`LoungeDockSlidePanels.jsx`** embeds chat (flex scroll host for `h-full` panel); **`SocialFeed.jsx`** dock props + `chatDockInitialPeerUserId` / **`openChatWithUserFromProfile`**; **`AppShell.jsx`** passes **`hasActiveSubscription`** / **`isStaff`**; **`LoungeProfileFullScreen.jsx`** Message beside Follow. SQL **`supabase/chat_phase1.sql`** + Edge **`lounge-chat`** + test smoke **§13** documented in **`docs/test-buildout-backlog.md`** (apply SQL + deploy before validation).
- 2026-05-13: **Lounge posts:** removed hardcoded **`game_title: 'Lounge'`** from **`loungePostSubmitJob.js`** (new posts use empty title/slug until AP Guides picker is wired). Existing DB rows unchanged.
- 2026-05-13: **Shell column width (edge-to-edge with Lounge):** `AppShell` dashboard + team placeholders **`max-w-2xl`** + **`px-3`**; **`OffersCalendar`**, **`BankrollTracker`**, **`LocalIntel`**, **`CalculatorsTab`** home + calculator game roots align to the same column; **`SocialFeed`** quote sheet + upload bar **`max-w-2xl`**. See **`docs/frontend-architecture.md`** (`shell/` row).
- 2026-05-13: **EDGE title bar + scroll-hide on more tabs:** **`ScrollLinkedEdgeTitleBarShell`** + **`titleBarNavSlot`** on **`BankrollTracker`**, **`LocalIntel`** (all screens), **`AppShell`** dashboard + team, and **`OffersCalendar`** (replaces in-flow logo row; **`fullWidth`** for week landscape). Nested event-list / week-lane **`overflow-y-auto`** removed so the shell scroller drives title reveal. Shell: optional **`fullWidth`**. **`docs/frontend-architecture.md`** (`shell/`, `offers/` rows).
- 2026-05-13: **iPhone bottom safe area (shell + Lounge):** Removed outer **`pb-[max(0.5rem,env(safe-area-inset-bottom))]`** under **`ScrollLinkedEdgeTitleBarShell`** (was a non-scrolling “dead” strip); default content padding is **`pb-[calc(6rem+env(safe-area-inset-bottom,0px))]`** inside the scroller. **`SocialFeed`** root uses **`pb-0`** + **`bg-zinc-950`**; feed list bottom padding includes safe area. **`#root`** **`min-height: 100dvh`** + background in **`index.css`**.
- 2026-05-13: **Lounge dock search:** full **`LoungePostArticle`** rows (same handlers as `profilePostCardProps`), **`loungePostInteractionScore`** sort (likes+comments+reposts, then recency), **`LoungeFeedVideoAutoplayProvider`** on panel scroll; `onOpenPostFromSearch(post)` opens detail with embedded originals. **`communityFeedPost.js`** exports **`loungePostInteractionScore`**.
- 2026-05-13: **Lounge dock slide panels → full-screen shell:** **`LoungeDockSlidePanels.jsx`** — column-wide overlay (`max-w-2xl`), **feed title bar** (logo, updating, nav, ×) with **scroll-linked hide** on the panel scroller; **dock footer `reveal={1}`** (static on panel; feed dock stays scroll-linked when panel closed). Bidirectional swipe dismiss + **`touch-pan-y`** lists + shared **`src/utils/loungeTitleRevealScroll.js`** with **`SocialFeed.jsx`** (main title/dock hidden while panel open; `viewportTitleTopPx` + nav slot passed in).
- 2026-05-13: **Planned (messaging):** Phased timeline — **Phase 1:** TLS + **provider at rest** (document; HTTPS-only discipline). **Phase 2:** **app-level ciphertext storage** (keys separate from naive DB dump; not E2EE). **Smart prep:** single message read/write API seam + nullable `content_encoding` / key metadata + avoid plaintext-only FTS on body until strategy set — see *Planned (messaging)* in this file; roadmap *Messaging / chat (future)*.
- 2026-05-13: **Backlog (medium priority):** *Planned (partner / server API)* — trusted partner **Lounge auto-post** via HTTPS + integration secret; server-side insert as a **dedicated** feed user; idempotency + rate limits (see section for sketch).
- 2026-05-13: **Lounge OG preview text:** **`compoundOgTitle`** = **`byline · caption · stats`** in **`og:title`**. **WhatsApp** showed duplicate blocks when **`og:description`** repeated the title — description is now a short CTA (**`Open this post in Edge.`**). iMessage still reads mainly **`og:title`**.
- 2026-05-17: **`profiles.is_og` on signup:** **`supabase/profiles_is_og_assign_on_insert.sql`** — BEFORE INSERT trigger sets **`is_og = true`** while profile count < 1000 (fixes new accounts missing OG after one-time backfill only). **Test:** apply trigger + re-run **`profiles_is_og.sql`** UPDATE block for existing cohort.
- 2026-05-17: **Auto-follow @edgelord on signup:** **`supabase/profile_follow_edgelord_on_insert.sql`** — AFTER INSERT on **`profiles`**, mutual **`profile_follows`** with handle **`edgelord`** (security definer; does not block insert if edgelord missing). **Test:** apply SQL on test; create a new account → Following tab shows edgelord posts; edgelord profile shows +1 follower. Optional backfill in file for older accounts.
- 2026-05-19: **R2 Cache-Control:** uploads + migration PUT **`public, max-age=31536000, immutable`**; **`lounge-cf-r2-backfill-cache-control`** backfilled **69** objects on test. CORS must allow **`Cache-Control`** header on bucket. Ryan **PASSED** post-upload smoke after CORS fix.
- 2026-05-19: **Legacy `lounge-feed` → R2 migration (test):** **`lounge-cf-r2-migrate-lounge-feed`** + **`scripts/migrate-lounge-feed-to-r2.mjs`** — **68** objects, **27** posts, **12** comments → **`media-test.lvslotpro.com`**; Supabase Storage copies removed.
- 2026-05-19: **Lounge R2 infra on test:** **`lvslotpro.com`** zone on Cloudflare; bucket **`lounge-media`** + **`media-test.lvslotpro.com`**; Edge **`lounge-cf-r2-*`** deployed; Supabase + Vercel env; commits through **`0978782`**. **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** until Pro.
- 2026-05-18: **Lounge images → Cloudflare R2 (code on `test`):** Edge **`lounge-cf-r2-direct-upload`**, **`lounge-cf-r2-delete-object`**, **`lounge-cf-r2-delete-orphan`**; client **`loungeCfImageMedia.js`** + **`uploadLoungeFeedPostImage`** (R2 when secrets set, else legacy **`lounge-feed`**); optional Image Resizing delivery in feed/lightbox/poster/OG; post delete removes **`image_urls`** + **`stream_poster_url`** on R2 or Supabase. See Edge row + **`supabase/functions/lounge-cf-r2-direct-upload/README.md`**.
- 2026-05-18: **Deferred:** **Stream inside image carousel** (upload-order mixed strip + lightbox + composer/quote + lifecycle) — `[-]` row under *Deferred / someday* in this file; short **Phase D** note in **`docs/social-feed-roadmap.md`** (not scheduled).
- 2026-05-18: **Lounge badge tips:** `LoungeBadgeHoverTip.jsx` — dismiss open tip on **document `pointerdown` (capture)** outside anchor/tip and on **Escape** (avoids stuck tooltips when `mouseleave` does not run). **Smoke §12:** Ryan **PASSED** main composer, quote video/media matrix, Cancel-while-prep on **test**; backlog §12 checkboxes + sign-off; note on **why Stream video is exclusive of GIF/images** (schema + feed tile + upload/delete paths).
- 2026-05-13: **Post detail vs profile z-index:** `SocialFeed.jsx` post detail overlay **`z-[98]`** (was **`z-[96]`**) so opening post detail from a post inside **`LoungeProfileFullScreen`** (`z-[97]`) or after dismissing media fullscreen shows the detail **above** the profile; quote/media layers remain **`z-[100]`+**.
- 2026-05-13: **Lounge repost menu + quote / comment from media fullscreen:** Portaled feed repost submenus anchor **above** the repost control (`LoungePostInteractionBar.jsx`: `top` at button top + `-translate-y-full`; sheet/detail dropdowns use `bottom-full mb-1`); post-detail repost menu in `SocialFeed.jsx` matches. **Quote** and **Comment** from a media lightbox dismiss fullscreen first (`loungeLightboxFooterDismissQuote.js` merges `onQuoteRepost` + comment path into `onCommentClick` after dismiss; used in `LoungePostFeedMedia.jsx`, `LoungeInlineMediaUrl.jsx`, `LoungePostStreamVideo.jsx`).
- 2026-05-13: **Lounge media fullscreen — post actions:** Image and Stream video lightboxes show the same **comment / repost / like / share / bookmark** row as the underlying post (`LoungePostInteractionBar.jsx`); feed/profile use feed-style + portaled repost menus (`z-[101]` above `z-[100]` lightbox); post detail + quoted-original embed use sheet-style (comment scrolls to `#lounge-detail-comments`); quote-repost composer preview uses feed bar with `z-[110]`. Files: `LoungeInlineMediaUrl.jsx`, `LoungePostFeedMedia.jsx`, `LoungePostStreamVideo.jsx`, `LoungePostArticle.jsx`, `SocialFeed.jsx`.
- 2026-05-13: **Quote repost compose — attach video:** `SocialFeed.jsx` quote sheet media picker matches the main Lounge composer (`accept` image+video; video clears images/GIF and uses `queueLoungeVideoOrCrop(..., 'quote')`); video preview tile + remove; Post button accounts for video-only quotes and blocks on failed prep, upload-failure sheet, or open video crop modal (`loungeQuoteRepostVideoPostBlocked`). **Quote + video posts** now enqueue **`runBackgroundLoungePostSubmission`** (same bottom upload / media-prep bar as main composer): modal dismisses immediately while prep/upload continues; `clearQuoteRepostForPostAttempt` preserves quote prep when awaiting handoff; cancel / failure / save-draft restore quote composer via **`restoreQuoteFromSnapshot`** when `quoteRepostOfPostId` is on the snapshot.
- 2026-05-13: **Lounge:** Post detail sheet no longer jumps to top when liking/unliking (scroll reset runs only when the opened post **id** changes). Own profile **Likes** / **Bookmarks** tabs (newest `post_likes` / `post_bookmarks` first; same card layout as Posts). **`profiles.is_og`** + one-time backfill **`supabase/profiles_is_og.sql`** (first 1000 by `created_at`, tie `user_id`); **`LoungeOgBadge`** on feed rows, detail header, comments, quote preview, profile header; `hydrateCommunityPosts` / profile fetches include **`is_og`**. **Apply the SQL on test (and prod when ready)** before the new profile column is guaranteed.
- 2026-05-17: **Stream poster + dims (test sign-off):** Ryan confirmed extended manual pass **PASSED**: prerequisite **`lounge_feed_post_stream_video.sql`** on test Supabase **COMPLETE**; composer prep + immediate-upload Stream posts; cross-device / incognito stable poster; same-tab vs **`stream_poster_url`**; portrait vs landscape tile aspect; full-screen + **Tap for sound** / mute; autoplay winner changes; caption-only edit (poster retained); author + staff delete (Stream + optional **`lounge-feed`** poster object); image-only + GIF-only regression; quote repost with video original (no feed console errors). Logged under **Test smoke and release readiness** sign-off line.
- 2026-05-15: **Per-comment likes / reposts / bookmarks:** `supabase/migrations/20260515190000_feed_comment_interactions.sql` — `feed_comments.like_count` / `repost_count` / `bookmark_count` + junction tables + RLS + triggers; canonical **`supabase/feed_interactions_phase_ef.sql`** §5b. Client: **`SocialFeed.jsx`** hydrates viewer rows, **`LoungePostCommentThread.jsx`** + **`LoungePostInteractionBar.jsx`** (optional like/bookmark overrides + plain-only repost tap). **Apply migration on test (then prod)** before counts/toggles work end-to-end.
- 2026-05-15: **feed_comments author UPDATE:** `supabase/migrations/20260515183000_feed_comments_author_update.sql` — `feed_comments_update_own` RLS + `grant update` + **`feed_comments_guard_identity_fields`** trigger (cannot change `post_id`, `user_id`, `parent_id`, `created_at`). Canonical **`supabase/feed_interactions_phase_ef.sql`** updated for greenfield. **Apply migration on test/prod** before relying on lounge reply **Edit** in post detail (`SocialFeed.jsx` + **`LoungePostCommentThread.jsx`** ⋯ menu). **`src/utils/loungeCommentLimits.js`** exports **`LOUNGE_COMMENT_BODY_MAX`** (280).
- 2026-05-09: **Lounge Stream feed UX + quote modal stacking + polish (test / branch `test`):** `LoungeFeedVideoAutoplayContext.jsx` (scroll-root single **winner** inline Stream + **`feedInlineSoundUnmuted`** shared across feed/embed); `LoungePostStreamVideo.jsx` — winner/IO attach-play race, poster→HLS **crossfade** (incl. `requestVideoFrameCallback` + delay), **Tap for sound** / **Tap to mute** + **SoundOnGlyph**; `SocialFeed.jsx` — quote repost overlays **`z-[100]`** above post detail **`z-[98]`**; upload bar **Cancel** label. Continuity: **`AGENTS.md`**, **`docs/social-feed-roadmap.md`** (D2), **`docs/frontend-architecture.md`**, this backlog (Lounge video row + smoke 11 + Update log).
- 2026-05-09: **Stream orphan delete + pending-upload purge (test):** Edge **`lounge-cf-stream-delete-orphan`** (authenticated user JWT) and **`lounge-cf-stream-purge-pending-uploads`** (shared secret **`LOUNGE_CF_STREAM_PURGE_SECRET`** / Vault); repo **`supabase/config.toml`** (`verify_jwt` false for purge only); migrations **`20260509180000_lounge_cf_stream_purge_pg_cron.sql`**, **`20260512120000_lounge_cf_stream_purge_normalize_vault_secrets.sql`**, **`20260515120000_lounge_cf_stream_purge_invoke_options.sql`** (`pg_cron` / **`pg_net`** / Vault-aware **`apikey`** + optional **`Authorization`**); purge response field **`pendingUploadRowCount`** (replaces misleading **`pendingUploadPageCount`**). Docs: **`AGENTS.md`**, this backlog (Edge list), **`docs/production-rollout-checklist.md`** §2/§4; runbooks in each function **`README.md`** (notably purge Vault + **`net._http_response`** checks). Branch **`test`** (commit **`622822f`** area).
- 2026-05-09: **Stream delete when video post removed:** Edge **`lounge-cf-stream-delete-video`** (auth + `stream_video_uid` lookup + Cloudflare DELETE); **`deleteCfStreamForCommunityFeedPost`** in **`loungeVideoUpload.js`**; **`SocialFeed.jsx`** calls it before every **`community_feed_posts`** delete when the row has a Stream uid. **`supabase/lounge_feed_posts_delete_moderator_align.sql`** + **`feed_phase_a_profiles_public_read.sql`** moderator delete policy aligned with staff UI. Docs: **`AGENTS.md`**, **`README.md`**, **`docs/production-rollout-checklist.md`**, **`docs/frontend-architecture.md`**, this backlog Edge row + source line.
- 2026-05-09: **Lounge video (Cloudflare Stream):** `community_feed_posts.stream_video_uid` + Edge **`lounge-cf-stream-direct-upload`** + `loungeVideoUpload.js` / **`LoungePostStreamVideo.jsx`** / **`SocialFeed.jsx`** composer + post flow; **`hls.js`** lazy-loaded for HLS on non-Safari; feed **`stream_video_uid`** in **`AppShell.jsx`**. Continuity: **`AGENTS.md`**, **`WAKEUP`**, **`docs/social-feed-roadmap.md`** (D2), **`docs/frontend-architecture.md`**, **`docs/production-rollout-checklist.md`** (§2/§4/§5), **`docs/test-buildout-backlog.md`** (Edge list, FE row, smoke 11), **`supabase/functions/lounge-cf-stream-direct-upload/README.md`**. Branch **`test`** (commit `c8187dd`).
- 2026-05-12: **Profile avatar crop modal** (`ProfileAvatarCropModal.jsx`): after picking a photo in **own profile edit**, circular preview with **drag pan**, **wheel / pinch zoom**, **±90° rotate**, **Reset**, **Apply** → WebP crop then existing `prepareAvatarImageForUpload` + upload path in `LoungeProfileFullScreen.jsx`.
- 2026-05-13: **Session Stream poster (composer → feed):** `loungeStreamSessionPoster.js` pins `blob:` JPEG by `stream_video_uid` on post; `SocialFeed` snapshot `sessionStreamPosterBlobUrl`, skip-revoke on clear, pin after deferred prep; release on cancel / post failure / draft save; `LoungePostFeedMedia` passes `sessionPosterUrl`; `LoungePostStreamVideo` shows session poster until off-DOM CF `Image` load then swaps (CF `<img>` retry kept). Continuity: `loungePostSubmitJob` typedef.
- 2026-05-13: **Feed Stream tile poster + frame:** `LoungePostStreamVideo.jsx` — retry Cloudflare `thumbnail.jpg` with cache-bust (`_pv`) until decode (CF often 404s briefly after upload); drop `min-h-*` floor after poster `onLoad` so layout hugs the thumbnail; if poster never loads, replace forced `aspect-video` fallback with flex + intrinsic-sized `<video>` (portrait clips no longer sit in a giant 16:9 black box).
- 2026-05-13: **Persisted Stream tile poster + display dimensions (cross-device):** `supabase/lounge_feed_post_stream_video.sql` adds **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`**; `loungePostSubmitJob.js` uploads composer/session JPEG to **`lounge-feed`** after manifest ready; `communityFeedPost.js` helpers + Storage cleanup on delete; feed selects in **`AppShell.jsx`** / **`SocialFeed.jsx`**; **`LoungePostStreamVideo.jsx`** prefers DB poster URL then session blob then CF thumb, **`aspect-ratio`** when dims present; **`loungeVideoUpload.js`** **`probeVideoFileDisplaySize`**. Apply SQL on test before posting with new client.
- 2026-05-12: **Lounge carousel + quote UI:** feed/detail carousels reset to slide 1 via **`visibilityResetRootRef`** + `IntersectionObserver`, plus **scroll/resize** geometry on the feed (and detail) root so **newly loaded posts** reliably detect leave/re-enter; quote repost compose mirrors **main composer** (`min-h-[6.5rem]` stack, textarea `min-h-[2.75rem]`, toolbar `mt-1` under caption); remove-quote bottom sheet **more bottom padding**. Files: `LoungePostFeedMedia.jsx`, `SocialFeed.jsx`. Prior `3578e6c` note + smoke steps 7/10 updated in this doc.
- 2026-05-11: **Doc sync (Lounge continuity):** profile **`handle_changed_at`** + 7-day cooldown SQL and client modals; iOS profile-save mitigations; rate-limit banner above composer; feed carousel first-slide on re-entry; anchored repost menus; quote composer height — reflected in **`AGENTS.md`**, **`docs/social-feed-roadmap.md`** (Phases A4, C, D deliverable, F), **`docs/frontend-architecture.md`** (`lounge/` table), and this backlog (A1 bullet, A4 UX, FE rows, smoke 6–10). Code on branch **`test`** (commit `d7c3ffd` area).
- 2026-05-10: **`profiles.has_active_subscription`** + guard trigger (**`supabase/profiles_tier_testing.sql`**); app reads role + flag for hamburger locks; **`docs/test-user-roles.md`** for SQL recipes.
- 2026-05-09: **Lounge interactions (Phase E/F slice):** added `supabase/feed_interactions_phase_ef.sql` (`post_likes`, `post_reposts`, `post_bookmarks`, `feed_comments`, `repost_count`, count triggers, RLS); client persistence + comments UI in **`SocialFeed.jsx`** / **`LoungePostArticle.jsx`**; feed selects include **`repost_count`** in **`AppShell.jsx`**. **Requires applying the new SQL on test.** Profile **follows** unchanged (`profile_follows` in `profile_lounge_fullscreen.sql`).
- 2026-05-10: **Removed `allowed_emails` / whitelist** from **`App.jsx`**; authenticated users always get member shell (documented in README + **`docs/frontend-architecture.md`**). Optional: drop unused **`public.allowed_emails`** table/policies in Supabase when ops are ready.
- 2026-05-10: Hamburger menu: **lock icons** on Calcs / AP Guides / Bankroll for free members without active subscription; **`VITE_HAS_ACTIVE_SUBSCRIPTION`** stub + **`profiles.role`** staff bypass; Offers row unlocked (per access spec).
- 2026-05-10: **`docs/access-tiers.md`**: removed anon **50-post/day** cap; read-only Lounge = full loaded feed + same create-account gates elsewhere.
- 2026-05-10: **`docs/access-tiers.md`** filled with full freemium spec (anon + modals; free verified + subscribe gates; paid + add-on paywalls; staff badges); roadmap Freemium bullets aligned to that file.
- 2026-05-10: Added **`docs/access-tiers.md`** fill-in template (three tiers × per-surface R/W matrix); linked from roadmap, **`AGENTS.md`**, architecture, backlog freemium item.
- 2026-05-10: Documented **freemium / subscription** direction in **`docs/social-feed-roadmap.md`** (anonymous read → free account → subscriber gates; RLS + billing webhooks as source of truth); linked from **`docs/frontend-architecture.md`** and **`AGENTS.md`**.
- 2026-05-10: **Public browse access:** app shell loads without login (Supabase anon); full-screen auth panel + sticky shell CTA for sign-in; removed dev-only guest button / `VITE_ALLOW_GUEST_MODE`. See **`docs/frontend-architecture.md`** (Access model).
- 2026-05-10: **`session-chat-export.md`** removed from Git tracking (`.gitignore`); local export path unchanged for scripts — see **`AGENTS.md`** for backup note on first pull after this change.
- 2026-05-10: Added root **`AGENTS.md`** (canonical doc map, when-to-update table, chat-export vs repo rules); linked from `README.md`, `docs/frontend-architecture.md`, roadmap, backlog, production checklist.
- 2026-05-10: Recorded operator **manual smoke pass on test** (items 1–5 as applicable) under **Test smoke and release readiness**.
- 2026-05-10: Adopted strict phase-order build policy; marked Phase B pinned + logged-out Lounge items complete; noted A2 counter triggers dependency on E/F tables.
- 2026-05-09: Clarified **pinned** testing: feed query/UI treat pinned rows correctly, but **staff pin/unpin is DB-only** until moderation UI ships; documented seed/SQL path and adjusted smoke list wording.
- 2026-05-09: Recorded smoke pass list under **Test smoke and release readiness**; marked local lint/build + chunk-split check complete; enumerated manual on-test replay steps (feed anon/auth, pinned/load-more, lazy tabs/calculators, Guides insert, offers/calendars/push).
- 2026-05-08: Initialized test-first backlog and seeded with current feed/policy/edge-function parity work.
- 2026-05-08: Added explicit roadmap phase status snapshot; set active implementation target to A2 feed model finalization.
- 2026-05-08: Started A2 implementation: added `caption` migration/backfill path and app read/write compatibility for `caption` with legacy `title/body` fallback.
- 2026-05-08: Added pinned-first feed query + cursor-based pagination (`created_at`, `id`) with load-more behavior in Home feed UI.
- 2026-05-09: Started A4 foundation with DB-backed post rate limiting (`rate_limit_events` + insert trigger guard) and user-facing rate-limit error copy.
- 2026-05-09: Added rate-limit cooldown feedback (`retry_in_seconds`) and surfaced user-facing countdown in Lounge/Guides post errors.
- 2026-05-09: Started Phase C gating with profile completion modal (handle/display name) before posting from Lounge or Guides.
- 2026-05-09: Documented modular frontend: `App.jsx` (auth) + `features/shell/AppShell.jsx` (logged-in shell); Lounge, Offers, Intel, Bankroll, Calculators under `src/features/`; calculator games under `features/calculators/games/` (see `docs/frontend-architecture.md`).
- 2026-05-09: Doc sync — marked **A2** (caption-only, legacy columns dropped) and **A4** (DB rate limit in phase A SQL) complete on test; clarified A3 includes 30-minute author update policy in SQL.
