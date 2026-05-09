# Test buildout backlog (source of truth before production)

Use this file to track work that is implemented and validated on `test` first.
When a feature is ready to promote, replay steps on production using `docs/production-rollout-checklist.md`.
Roadmap and phase ordering live in `docs/social-feed-roadmap.md`.

Do not store secrets in this file.

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

### Phase B - Public read feed

- [x] Basic public read feed path works on test (anon-visible rows, signed-in posting path from Guides).
- [x] Cursor pagination on `(created_at, id)` is implemented with load-more pagination (infinite auto-load polish still optional).
- [ ] Pinned row handling exists at data level but UI/query behavior is not fully finalized to roadmap spec.
- [ ] Logged-out gating for like/comment/search is not fully enforced end-to-end yet.

### Phases C-L

- [ ] Not started as complete feature slices yet (media pipeline, comments, likes, search, notifications, moderation, block/mute, permalinks, legal).
- [ ] Phase C started: first-interaction profile completion gate now blocks posting until `handle` + `display_name` are set (Lounge + Guides).

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
  - Source: `supabase/community_feed_posts.sql`, `supabase/feed_phase_a_profiles_public_read.sql`, `src/App.jsx`, `src/features/guides/GuidesScreen.jsx`, `supabase/seed/lounge_fake_posts.sql`.
  - Test validation: Lounge + Guides posting and feed read verified on test after re-applying phase A SQL.
  - Production replay: `production-rollout-checklist.md` §2 — run current `community_feed_posts.sql` then `feed_phase_a_profiles_public_read.sql` (or equivalent migration) before relying on caption-only clients.

- [x] A4 rate limiting foundation (DB path) on test
  - Change: `rate_limit_events` + rolling-window insert guard on new community posts; app surfaces rate-limit errors in Lounge/Guides.
  - Source: `supabase/feed_phase_a_profiles_public_read.sql` (section 4) + client error handling.
  - Test validation: repeated posts within the configured window return the limiter error; normal posting outside the window succeeds.
  - Production replay: checklist §2; optional §4 only if an edge path is added later.

---

## Test smoke and release readiness

- [ ] Maintain a "known-good on test" smoke pass list
  - Include: home feed (anon), signed-in posting, offers save, calculators, calendars, push config endpoint.
  - Production replay: mirrors checklist §5.

- [ ] Final pre-prod gate
  - Change: Mark all required sections here as complete before running production rollout checklist.
  - Production replay: Execute checklist top-to-bottom with no skipped items.

---

## Update log

- 2026-05-08: Initialized test-first backlog and seeded with current feed/policy/edge-function parity work.
- 2026-05-08: Added explicit roadmap phase status snapshot; set active implementation target to A2 feed model finalization.
- 2026-05-08: Started A2 implementation: added `caption` migration/backfill path and app read/write compatibility for `caption` with legacy `title/body` fallback.
- 2026-05-08: Added pinned-first feed query + cursor-based pagination (`created_at`, `id`) with load-more behavior in Home feed UI.
- 2026-05-09: Started A4 foundation with DB-backed post rate limiting (`rate_limit_events` + insert trigger guard) and user-facing rate-limit error copy.
- 2026-05-09: Added rate-limit cooldown feedback (`retry_in_seconds`) and surfaced user-facing countdown in Lounge/Guides post errors.
- 2026-05-09: Started Phase C gating with profile completion modal (handle/display name) before posting from Lounge or Guides.
- 2026-05-09: Doc sync — marked **A2** (caption-only, legacy columns dropped) and **A4** (DB rate limit in phase A SQL) complete on test; clarified A3 includes 30-minute author update policy in SQL.
