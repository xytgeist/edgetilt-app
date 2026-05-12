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
  - Change: Feed/detail carousels reset to **first slide** when post **re-enters viewport** (`LoungePostFeedMedia.jsx`); **repost** uses **anchored popover** under control including reposted-state actions (`LoungePostArticle.jsx`, `SocialFeed.jsx`); quote composer textarea sizing aligned with main composer; image-cap modal from picker/quote flows.
  - Source: files above.
  - Test validation: scroll multi-image post off/on; repost menu position; quote sheet height + media below text; 7th image attempt shows cap modal.
  - Production replay: N/A (client-only).

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
    7. **Feed carousels:** multi-image post — scroll off-screen until row leaves view, scroll back — carousel shows **first** (left-most) slide.
    8. **Repost:** menu opens **under** the Repost control on feed + post detail; already-reposted row shows manage actions in the same anchored popover (no bottom sheet).
    9. **Rate limit:** when posting is blocked, error strip is **above** the composer even with a tall draft.
    10. **Quote repost:** textarea expands like main composer; images/GIF one line below text; picking more than **6** images shows cap modal (composer + quote sheet).
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - Production replay: same ordered pass on production after deploy.

- [ ] Final pre-prod gate
  - Change: Mark all required sections here as complete before running production rollout checklist.
  - Production replay: Execute checklist top-to-bottom with no skipped items.

---

## Update log

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
