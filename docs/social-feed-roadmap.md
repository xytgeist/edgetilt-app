# Social feed roadmap (test-first buildout)

This is the product build list. Build and validate on `test` first, then replay required infra steps on production using `docs/production-rollout-checklist.md`.

For day-to-day implementation status, use `docs/test-buildout-backlog.md`. For where Lounge and related UI live in the repo, see `docs/frontend-architecture.md`. For **which docs to update when** (including decisions that must survive past this chat), see root **`AGENTS.md`**.

**Execution:** phases are completed **in order (A → B → …)**; the “Suggested MVP sequencing” section below is a **priority hint** only. Dependency exceptions (e.g. count triggers that need tables from a later phase) are recorded in the backlog **Build policy**.

---

## Phase A - Foundation (DB + auth shaping)

### A1. Profiles model (or extend existing table)

- `user_id`
- `handle` (unique, lowercase)
- `display_name`
- `avatar_url`
- `bio` (max 160)
- moderation fields: `banned_at`, `strike_count` (or a separate strikes table)
- `role` enum: `user | moderator | admin`
- timestamps

### A2. Evolve `community_feed_posts` (or rename to `feed_posts`)

- **v1 on test:** single user-authored text column **`caption`** (≤280 chars). Legacy **`title` / `body`** were removed after a one-time backfill in `feed_phase_a_profiles_public_read.sql` (test-only data acceptable).
- Keep optional **`game_slug` / `game_title`** in v1 (FK later if needed).
- Moderation / edit metadata:
  - `edited_at` (maintained by trigger on `caption` updates)
  - `hidden_at`
  - `hidden_reason`
  - `pinned` (single pinned enforced via partial unique index)
- Denormalized counters (schema present on test):
  - `like_count`
  - `comment_count`
  - maintain via triggers when likes/comments land (Phase F / comment phase); not required for caption-only MVP read path

### A3. RLS alignment to visibility rules

- Audience rules for posts:
  - `anon` + `authenticated`: `SELECT` only where visible (`hidden_at is null`, author not banned per policy)
  - `authenticated`: `INSERT` own posts unless banned
  - author: `UPDATE` own post within 30-minute edit window (admin exception)
  - moderator/admin: hide actions; admin delete
- Logged-out restrictions:
  - no comments/likes/search mutation or privileged reads via anon policies

### A4. Rate limits

- **v1 on test:** DB-backed windows via `rate_limit_events` table + `BEFORE INSERT` trigger on `community_feed_posts` (see `feed_phase_a_profiles_public_read.sql`).
- Index pattern: `(user_id, kind, window_start)`.
- Later option: Redis/external limiter or edge enforcement for tighter UX.

### Deliverable

- Schema migrations + RLS verification checks (manual SQL checks acceptable initially).

---

## Phase B - Public read feed (UI + API only)

- Ensure anon read policy for visible posts.
- Home feed:
  - Latest mode
  - infinite scroll cursor on `(created_at, id)`
- Pinned behavior:
  - prepend one pinned row (single query strategy or two-step fetch)
- Logged-out UX:
  - hide composer, likes, comments, search
  - share stays allowed for public posts
  - comments may show teaser/count only

### Deliverable

- Production-like feed behavior for anonymous and signed-in read.

---

## Phase C - Profiles + first-interaction gating

- `/u/:handle` profile page:
  - profile data
  - authored posts
- Gate first write interaction (post/comment/like):
  - if profile incomplete, show completion modal
  - defaults from email local-part + placeholder avatar
- Handle collision strategy:
  - suffix fallback
  - reserved handle list

---

## Phase D - Composer + media

### D1. Images (up to 12)

- Upload to Storage.
- Persist media rows (`post_id`, `sort`, `type=image`, `path`, optional dimensions).
- Consider resumable upload flow for larger images.

### D2. Video (1 per post, up to 15s)

- Client checks: duration + size caps.
- Processing pipeline:
  - upload source
  - trigger process job (Edge function + worker/transcode path)
  - write derived mp4 + poster
  - mark media status `ready`
- UI shows processing state on post card.

### Deliverable

- Create post with caption + optional game tag + media.

---

## Phase E - Comments (threaded)

- Table: `feed_comments` with `parent_id`, `post_id`, `body`, `created_at`, `edited_at`, `hidden_at`.
- RLS:
  - logged-out: no full comment body access (counts/teasers only as needed)
  - signed-in: full thread access by policy
- Sorting:
  - top-level with score + decay
  - nested oldest-first
  - quality/collapse tuning can be phased later

---

## Phase F - Likes + counts

- `post_likes` and `comment_likes` with unique `(user_id, target)` constraints.
- Count updates via triggers initially; periodic reconcile optional later.

---

## Phase G - Search (signed-in only)

- Postgres `ILIKE`/trgm for posts + game tags.
- Profile search on handle + display name.
- Auth-gated RPC for search endpoints.

---

## Phase H - Activity + notification preferences + push

- `notification_preferences` per user (or short-term metadata fallback).
- `activity_events` outbox model.
- Push hooks for mentions/replies/comments/batched likes.
- Cron/edge schedule for batching.

---

## Phase I - Moderation + strikes + bans

- `reports` table + internal moderation queue UI.
- Moderator hide action sets `hidden_at` (+ review metadata as needed).
- Ban behavior enforced in RLS (`profiles.banned_at` blocks mutations).

---

## Phase J - Block/mute + popular mode

- `blocks` and `mutes` tables.
- Feed filtering and interaction restrictions by relationship.
- Popular mode SQL sort with decay formula + stored counts (view/computed strategy optional).

---

## Phase K - Permalinks + share

- `/p/:id` single post page with comment teaser rules.
- Share support via `navigator.share` with clipboard fallback.

---

## Phase L - Legal (parallel)

- Stable routes: `/terms`, `/privacy`, `/guidelines`.
- Counsel-reviewed policy text for Quantum Capital Ventures, LLC (Wyoming).
- Signup acceptance wiring as required.

---

## Suggested MVP sequencing

1. A + B (foundation + public feed latest/pinned shape)
2. C (profiles + gating)
3. D1 (composer + image media)
4. E + F (comments + likes)
5. K (permalink + share)
6. G (search)
7. D2 (video pipeline)
8. J (popular mode + decay)
9. H (notifications)
10. I (moderation + bans)
11. J polish (block/mute quality improvements)

---

## Risks to flag early

- Video transcoding path: a single Edge Function running ffmpeg may hit platform runtime/memory limits. Confirm where transcoding executes before D2 (Supabase-compatible patterns vs external worker).
- Comments + infinite scroll performance: ranking and thread queries are likely the first hotspot. Add indexes early (`post_id`, `parent_id`, `created_at`) and validate query plans on realistic data volume.
- Feed table migration safety: production promotion should still follow **expand → backfill → app deploy → contract** whenever changing column shapes; test env skipped straight to caption-only after backfill.
