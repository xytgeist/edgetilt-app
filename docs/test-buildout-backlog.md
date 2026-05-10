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
- [x] A2 feed model on test: `community_feed_posts` is **caption-only** (legacy `title` / `body` dropped after backfill); `edited_at`, pin/moderation columns, denormalized `like_count` / `comment_count` (counter **maintenance** still deferred until likes/comments ship).
- [x] A3 baseline RLS/policy shape for public read + authed write + staff moderation is applied on test (includes author **30-minute** `UPDATE` window in SQL).
- [x] A4 **DB-first** posting rate limit on test: `rate_limit_events` + indexes + `BEFORE INSERT` guard on `community_feed_posts` in `feed_phase_a_profiles_public_read.sql` (optional later: Redis/edge limiter per roadmap).
- [ ] A2 **counter maintenance:** when Phase E/F add `feed_comments` / `post_likes`, ship SQL triggers to keep `like_count` / `comment_count` in sync (cannot complete before those tables exist).

### Phase B - Public read feed

- [x] Basic public read feed path works on test (anon-visible rows, signed-in posting path from Guides).
- [x] Cursor pagination on `(created_at, id)` is implemented with load-more pagination (infinite auto-load polish still optional).
- [x] Pinned row: head load fetches at most one pinned row plus first unpinned page; pinned prepended; load-more uses unpinned-only cursor (matches roadmap “prepend one pinned” shape). RLS hides `hidden_at` rows.
- [ ] **Staff pin/unpin (and broader Lounge moderation UI):** not shipped in the client. **Database is ready:** `profiles.role in ('moderator','admin')` may `UPDATE` any feed row (`community_feed_posts_update_moderator` in `supabase/feed_phase_a_profiles_public_read.sql`), and `community_feed_posts_author_guard` lets staff change `pinned` / hide fields without hitting the author-only restriction. Until an in-app mod surface exists, **test pinned ordering** by rerunning the pin block at the end of `supabase/seed/lounge_fake_posts.sql` (clears pins, pins one visible row) or with a one-off `UPDATE` in the Supabase SQL editor (respect the partial unique index: at most one `pinned = true` among non-hidden rows).
- [x] Logged-out Lounge: composer hidden; like/comment/repost/bookmark are read-only (server counts only, no local mutation UI). Feed search is not a Lounge surface yet (Phase G). Guides search remains on Guides tab.

### Phases C-L

- [ ] Phases **D–L** not started as complete slices yet (media pipeline, comments, likes, search, notifications, moderation, block/mute, permalinks, legal).
- [ ] **Phase C (next):** `/u/:handle` profile surface, authored-posts list, handle collision + reserved-handle policy; profile completion gate for first post already in Lounge + Guides.

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
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - Production replay: same ordered pass on production after deploy.

- [ ] Final pre-prod gate
  - Change: Mark all required sections here as complete before running production rollout checklist.
  - Production replay: Execute checklist top-to-bottom with no skipped items.

---

## Update log

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
