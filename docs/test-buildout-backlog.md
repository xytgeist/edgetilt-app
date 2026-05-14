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

## Roadmap status snapshot

### Phase A - Foundation (DB + auth shaping)

- [x] A1 core `profiles` model in place on test (`handle`, `display_name`, `avatar_url`, `bio`, `role`, `banned_at`, timestamps, constraints/index).
- [x] **Handle change cadence (test):** `profiles.handle_changed_at` + `BEFORE UPDATE OF handle` cooldown trigger (one change per rolling 7 days; raises `PROFILE_HANDLE_CHANGE_COOLDOWN`). Sources: **`supabase/profile_handle_changed_at.sql`** and tail of **`supabase/profile_lounge_fullscreen.sql`**. Client: **`LoungeProfileFullScreen.jsx`**, **`profileGate.js`** (select includes `handle_changed_at`). **Apply SQL on test** before selects/saves that expect the column.
- [x] A2 feed model on test: `community_feed_posts` is **caption-only** (legacy `title` / `body` dropped after backfill); `edited_at`, pin/moderation columns, denormalized `like_count` / `comment_count` / `repost_count` (after `feed_interactions_phase_ef.sql`).
- [x] A3 baseline RLS/policy shape for public read + authed write + staff moderation is applied on test (includes author **30-minute** `UPDATE` window in SQL).
- [x] A4 **DB-first** posting rate limit on test: `rate_limit_events` + indexes + `BEFORE INSERT` guard on `community_feed_posts` in `feed_phase_a_profiles_public_read.sql` (optional later: Redis/edge limiter per roadmap).
- [x] A2 **counter maintenance:** `supabase/feed_interactions_phase_ef.sql` adds `post_likes`, `post_reposts`, `post_bookmarks`, `feed_comments`, `repost_count`, and triggers to keep `like_count` / `comment_count` / `repost_count` in sync (top-level comments only for post count). **Apply on test** before Lounge persistence works.

### Phase B - Public read feed

- [x] Basic public read feed path works on test (anon-visible rows, signed-in posting path from Guides).
- [x] Cursor pagination on `(created_at, id)` is implemented with load-more pagination (infinite auto-load polish still optional).
- [x] Pinned row: head load fetches at most one pinned row plus first unpinned page; pinned prepended; load-more uses unpinned-only cursor (matches roadmap “prepend one pinned” shape). RLS hides `hidden_at` rows.
- [ ] **Staff pin/unpin (and broader Lounge moderation UI):** not shipped in the client. **Database is ready:** `profiles.role in ('moderator','admin')` may `UPDATE` any feed row (`community_feed_posts_update_moderator` in `supabase/feed_phase_a_profiles_public_read.sql`), and `community_feed_posts_author_guard` lets staff change `pinned` / hide fields without hitting the author-only restriction. Until an in-app mod surface exists, **test pinned ordering** by rerunning the pin block at the end of `supabase/seed/lounge_fake_posts.sql` (clears pins, pins one visible row) or with a one-off `UPDATE` in the Supabase SQL editor (respect the partial unique index: at most one `pinned = true` among non-hidden rows).
- [x] Logged-out Lounge: composer hidden; like/comment/repost/bookmark are read-only (server counts only, no local mutation UI). Feed search is not a Lounge surface yet (Phase G). Guides search remains on Guides tab.

### Phases C-L

- [ ] Phases **D–L** not complete end-to-end; **first slice:** Lounge signed-in persistence for likes, reposts, bookmarks, and flat comments (post detail) + SQL `feed_interactions_phase_ef.sql` (Phase E/F subset). Threaded ranking, search, notifications, etc. still roadmap scope.
- [ ] **Phase C (remaining):** dedicated **`/u/:handle`** profile route + authored-posts list + handle collision + reserved-handle policy as in roadmap. **Shipped on test (partial):** profile completion gate for first post (Lounge + Guides); **full-screen profile editor** in Lounge; **7-day handle change** rule (DB + modals); iOS-focused profile-save mitigations — see **`docs/social-feed-roadmap.md`** Phase C and backlog SQL/FE rows below.
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

- [ ] Feed interactions Phase E/F (likes, reposts, bookmarks, comments) on test  
  - Change: Tables + RLS + triggers for Lounge engagement; `repost_count` on posts; client wiring in `SocialFeed.jsx` / `LoungePostArticle.jsx` / `AppShell.jsx`.
  - Source: `supabase/feed_interactions_phase_ef.sql`
  - Test validation: Run SQL on test project; signed-in user can like/repost/bookmark and post top-level comments; counts update; anon still read-only on actions.
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
  - **SQL:** `supabase/lounge_feed_post_stream_video.sql` → **`stream_video_uid`**; apply purge migrations for **`public.invoke_lounge_cf_stream_purge_pending`** (+ overload) and **`lounge_cf_stream_purge_pending_daily`** cron.
  - **Secrets (names only):** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`; purge: **`LOUNGE_CF_STREAM_PURGE_SECRET`** (Edge) + Vault **`lounge_cf_stream_purge_http_secret`**, **`lounge_cf_stream_purge_supabase_anon_key`** (legacy **`eyJ…`** anon or **`sb_publishable_`** / **`sb_secret_`** per migration + deploy **`verify_jwt = false`** in **`supabase/config.toml`**).
  - **Source:** `supabase/functions/lounge-cf-stream-direct-upload/`, `lounge-cf-stream-delete-video/`, `lounge-cf-stream-delete-orphan/`, `lounge-cf-stream-purge-pending-uploads/`, `src/utils/loungeVideoUpload.js`, `LoungePostStreamVideo.jsx`, `SocialFeed.jsx`, feed selects in `AppShell.jsx`. Optional SQL **`supabase/lounge_feed_posts_delete_moderator_align.sql`** if moderators staff-delete others’ posts.
  - Production replay: `production-rollout-checklist.md` §2 + §4 + smoke §5 (video line); Vault + cron parity for purge.

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

- [x] Lounge feed media + repost UX (test)
  - Change: Feed/detail carousels reset to **first slide** when post **re-enters viewport** (`LoungePostFeedMedia.jsx`); **repost** uses **anchored popover** above the control including reposted-state actions (`LoungePostArticle.jsx`, `SocialFeed.jsx`); quote composer textarea sizing aligned with main composer; image-cap modal from picker/quote flows.
  - Source: files above.
  - Test validation: scroll multi-image post off/on; repost menu position; quote sheet height + media below text; 7th image attempt shows cap modal.
  - Production replay: N/A (client-only).

- [x] Lounge **video** via **Cloudflare Stream** (test / branch `test`)
  - Change: **`stream_video_uid`** on posts; Edge **`lounge-cf-stream-direct-upload`**; client upload + HLS manifest poll (`loungeVideoUpload.js`); playback `LoungePostStreamVideo.jsx` (lazy `hls.js`); **`LoungeFeedVideoAutoplayContext.jsx`** — scroll-root **winner-only** inline attach/play + IO prefetch; first-tile / coordinator–IO race fixes (play when winner before in-view catches up); poster→video **crossfade** (`requestVideoFrameCallback` + staggered opacity) to reduce black flash; **shared feed inline sound** (Tap for sound / Tap to mute + **SoundOn** vs muted glyph); composer preview + post path in **`SocialFeed.jsx`**; selects include **`stream_video_uid`** in **`AppShell.jsx`**. **Quote repost** overlays **`z-[100]`** above opened post detail **`z-[98]`** (above profile **`z-[97]`**). Upload bar button label **Cancel**. Caps: **60s** duration, **200 MB** upload (Cloudflare basic POST).
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
    6. **Profile (Lounge):** own profile → edit → save display/avatar/about; change handle → **Confirm** → **Continue** completes save without a second Save; within 7 days of a handle change → **Cooldown** → **Continue** keeps handle, saves rest; **mod/admin** save retains `role`.
    7. **Feed carousels (incl. newly posted):** multi-image post — swipe to slide 2+; scroll the **feed** until that post’s media strip leaves the scroll area, then scroll back — carousel shows the **first** slide (scroll-root geometry + IO).
    8. **Repost:** menu opens **above** the Repost control on feed + post detail (portaled / `bottom-full`); already-reposted row shows manage actions in the same anchored popover (no bottom sheet).
    9. **Rate limit:** when posting is blocked, error strip is **above** the composer even with a tall draft.
    10. **Quote repost:** same vertical rhythm as main composer — **toolbar** (image / GIF / counter / Post) one line below the last caption line; optional media carousel under text with `mt-1.5`; cap modal if >6 images.
    11. **Lounge video:** after SQL **`lounge_feed_post_stream_video.sql`** + Edge **`lounge-cf-stream-direct-upload`** + secrets on test — pick a clip **under 60 seconds** and **under 200 MB** in the composer → **Post** → video plays in feed and post detail (HLS); **feed** first visible Stream tile autoplays; **Tap for sound** enables audio on the autoplaying clip and strip shows **Tap to mute** with **speaker-on** glyph; mute again silences; **open post** (detail sheet) → **Quote repost** sheet appears **on top** (not behind); **Uploading post…** bar shows **Cancel** (capital C).
    12. **Composer + quote (media) regression** — tick on **test** after Lounge composer / quote / stacking / lightbox churn:
        - [x] **Main composer (baseline):** short Stream video post; long video → **trim/crop** modal → confirm → post; **image-only** post; **GIF-only** post — behavior matches expectations (no regressions). *(Ryan, 2026-05-18, **PASSED** on test.)*
        - [x] **Quote + short video:** Add media → short video → prep → **Post** → quote child appears in feed; **original** post row shows updated interactions where applicable (repost count / your repost state). *(2026-05-18 **PASSED**.)*
        - [x] **Quote + long video:** long clip → **crop** modal → confirm → prep → **Post**. *(2026-05-18 **PASSED**.)*
        - [x] **Quote + video variants:** video-only (no caption); caption + video; **remove** video from preview then post (or confirm Post disabled until valid per design). *(2026-05-18 **PASSED**.)*
        - [x] **Quote + media rules:** attach **GIF** then video (expect GIF cleared / rules as designed); attach **images** then video (expect images cleared). *(2026-05-18 **PASSED**.)* — **Why not mix?** One **visual** attachment model per row today: **`stream_video_uid`** (Cloudflare Stream) **or** still/GIF/carousel URLs (`image_urls` / `media_url` / `gif_url`), not both — see `supabase/lounge_feed_post_stream_video.sql` (“exclusive of `image_urls` / GIF in app logic”), feed tile (`LoungePostStreamVideo` vs images), upload/delete (Stream Edge vs Storage), and composer validation (`Remove the GIF before posting a video`). Image **+** external GIF in one post remains supported; **Stream video +** GIF/images would need product + schema + playback work to do safely.
        - [x] **Quote + upload bar Cancel** while video is **preparing** (quote prep cancels; quote UI still usable; no stuck modal). *(2026-05-18 **PASSED**.)*
        - [x] *(Optional)* **Staff crown / badge tip:** hover or tap **`LoungeBadgeHoverTip`** — reads/positions OK; dismiss on outside tap / **Escape** (`LoungeBadgeHoverTip.jsx`, 2026-05-18).
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - **Sign-off (composer + quote media + badge tips, 2026-05-18, Ryan):** Smoke **§12** items **PASSED** on **test**; badge tip stickiness addressed with document **pointerdown** + **Escape** dismiss on open tip.
  - **Sign-off (Stream poster + dims, 2026-05-17, Ryan):** Extended checklist (session items **2–13**): all **PASSED** on **test**; SQL **`lounge_feed_post_stream_video.sql`** (including **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`**) applied on the test Supabase project.
  - Production replay: same ordered pass on production after deploy.

- [ ] Final pre-prod gate
  - Change: Mark all required sections here as complete before running production rollout checklist.
  - Production replay: Execute checklist top-to-bottom with no skipped items.

---

## Update log

- 2026-05-18: **Deferred:** **Stream inside image carousel** (upload-order mixed strip + lightbox + composer/quote + lifecycle) — `[-]` row under *Deferred / someday* in this file; short **Phase D** note in **`docs/social-feed-roadmap.md`** (not scheduled).
- 2026-05-18: **Lounge badge tips:** `LoungeBadgeHoverTip.jsx` — dismiss open tip on **document `pointerdown` (capture)** outside anchor/tip and on **Escape** (avoids stuck tooltips when `mouseleave` does not run). **Smoke §12:** Ryan **PASSED** main composer, quote video/media matrix, Cancel-while-prep on **test**; backlog §12 checkboxes + sign-off; note on **why Stream video is exclusive of GIF/images** (schema + feed tile + upload/delete paths).
- 2026-05-13: **Post detail vs profile z-index:** `SocialFeed.jsx` post detail overlay **`z-[98]`** (was **`z-[96]`**) so opening post detail from a post inside **`LoungeProfileFullScreen`** (`z-[97]`) or after dismissing media fullscreen shows the detail **above** the profile; quote/media layers remain **`z-[100]`+**.
- 2026-05-13: **Lounge repost menu + quote / comment from media fullscreen:** Portaled feed repost submenus anchor **above** the repost control (`LoungePostInteractionBar.jsx`: `top` at button top + `-translate-y-full`; sheet/detail dropdowns use `bottom-full mb-1`); post-detail repost menu in `SocialFeed.jsx` matches. **Quote** and **Comment** from a media lightbox dismiss fullscreen first (`loungeLightboxFooterDismissQuote.js` merges `onQuoteRepost` + comment path into `onCommentClick` after dismiss; used in `LoungePostFeedMedia.jsx`, `LoungeInlineMediaUrl.jsx`, `LoungePostStreamVideo.jsx`).
- 2026-05-13: **Lounge media fullscreen — post actions:** Image and Stream video lightboxes show the same **comment / repost / like / share / bookmark** row as the underlying post (`LoungePostInteractionBar.jsx`); feed/profile use feed-style + portaled repost menus (`z-[101]` above `z-[100]` lightbox); post detail + quoted-original embed use sheet-style (comment scrolls to `#lounge-detail-comments`); quote-repost composer preview uses feed bar with `z-[110]`. Files: `LoungeInlineMediaUrl.jsx`, `LoungePostFeedMedia.jsx`, `LoungePostStreamVideo.jsx`, `LoungePostArticle.jsx`, `SocialFeed.jsx`.
- 2026-05-13: **Quote repost compose — attach video:** `SocialFeed.jsx` quote sheet media picker matches the main Lounge composer (`accept` image+video; video clears images/GIF and uses `queueLoungeVideoOrCrop(..., 'quote')`); video preview tile + remove; Post button accounts for video-only quotes and blocks on failed prep, upload-failure sheet, or open video crop modal (`loungeQuoteRepostVideoPostBlocked`). **Quote + video posts** now enqueue **`runBackgroundLoungePostSubmission`** (same bottom upload / media-prep bar as main composer): modal dismisses immediately while prep/upload continues; `clearQuoteRepostForPostAttempt` preserves quote prep when awaiting handoff; cancel / failure / save-draft restore quote composer via **`restoreQuoteFromSnapshot`** when `quoteRepostOfPostId` is on the snapshot.
- 2026-05-13: **Lounge:** Post detail sheet no longer jumps to top when liking/unliking (scroll reset runs only when the opened post **id** changes). Own profile **Likes** / **Bookmarks** tabs (newest `post_likes` / `post_bookmarks` first; same card layout as Posts). **`profiles.is_og`** + one-time backfill **`supabase/profiles_is_og.sql`** (first 1000 by `created_at`, tie `user_id`); **`LoungeOgBadge`** on feed rows, detail header, comments, quote preview, profile header; `hydrateCommunityPosts` / profile fetches include **`is_og`**. **Apply the SQL on test (and prod when ready)** before the new profile column is guaranteed.
- 2026-05-17: **Stream poster + dims (test sign-off):** Ryan confirmed extended manual pass **PASSED**: prerequisite **`lounge_feed_post_stream_video.sql`** on test Supabase **COMPLETE**; composer prep + immediate-upload Stream posts; cross-device / incognito stable poster; same-tab vs **`stream_poster_url`**; portrait vs landscape tile aspect; full-screen + **Tap for sound** / mute; autoplay winner changes; caption-only edit (poster retained); author + staff delete (Stream + optional **`lounge-feed`** poster object); image-only + GIF-only regression; quote repost with video original (no feed console errors). Logged under **Test smoke and release readiness** sign-off line.
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
