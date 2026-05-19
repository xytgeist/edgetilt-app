# Social feed roadmap (test-first buildout)

This is the product build list. Build and validate on `test` first, then replay required infra steps on production using `docs/production-rollout-checklist.md`.

For day-to-day implementation status, use `docs/test-buildout-backlog.md`. For where Lounge and related UI live in the repo, see `docs/frontend-architecture.md`. For **which docs to update when** (including decisions that must survive past this chat), see root **`AGENTS.md`**.

**Execution:** phases are completed **in order (A → B → …)**; the “Suggested MVP sequencing” section below is a **priority hint** only. Dependency exceptions (e.g. count triggers that need tables from a later phase) are recorded in the backlog **Build policy**.

---

## Lounge UI glossary (post detail & comment threads)

Shared vocabulary for product talk, tickets, and `SocialFeed.jsx` / `LoungePostCommentThread.jsx`. The feed card is **`LoungePostArticle`**; the **OP block on post detail is not** that component (inline markup in `SocialFeed.jsx`).

### Navigation stack

| Step | Call it | Code / notes |
| --- | --- | --- |
| Lounge home → tap post | **Post detail** (sheet) | `loungePostDetail`; dialog `aria-labelledby="lounge-post-detail-title"` |
| Post detail, `pathIds` empty | **Post detail — root comment list** | `#lounge-detail-comments`; `LoungePostCommentThread` `variant="post"` |
| Tap any comment or nested reply | **Comment thread view** (same mode at every depth) | `loungeCommentDetailPathIds.length ≥ 1`; title bar shows **Reply** for all depths |

There is **no** separate “reply detail” or “reply-to-reply detail” screen type. Each tap rebuilds the full **thread path** from root → focus (`buildLoungeCommentDrillPath` in `SocialFeed.jsx`).

### Post detail — OP block (top of scroll)

| UI piece | Call it | Code / notes |
| --- | --- | --- |
| Whole original post at top | **OP block** / **OP post** | Inline in `SocialFeed.jsx` inside `px-4` scroll content |
| Avatar + name + handle | **OP header** | `LOUNGE_FEED_POST_DETAIL_*` in `loungeFeedAvatar.js`; avatar `id="lounge-detail-post-avatar"` |
| Caption / media / quote embed | **OP body** | `LoungePostFeedMedia` variants `detail` / `embed` |
| “2h ago · Edited” | **When row** / **date row** | `formatLoungePostDetailWhen` |
| Comment / repost / like / bookmark row | **Interaction row** | `LOUNGE_FEED_POST_DETAIL_INTERACTIONS_WRAP_CLASS` |
| “Relevant ▾” + rule below | **Comment sort** + **separator** | `LoungePostDetailCommentSort`; `LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_*` |

### Comments on post detail

| UI piece | Call it | Code / notes |
| --- | --- | --- |
| Rows under the separator (no drill) | **Root comments** | `feed_comments` with no parent in the roots list; `parent_id` null at DB |
| Post owner reply under a root on main list (no drill) | **OP inline reply** | `user_id === post.user_id`, `parent_id` → root; connector in `LoungePostCommentThread.jsx` |
| After tap — entire drilled UI | **Comment thread view** / **comment drill-down** | Umbrella term; `loungeCommentDetailPathIds` = **thread path** or **drill path** |
| Cards above the focus | **Ancestry** / **thread chain** | `LoungePostDetailCommentHierarchy`; `#lounge-detail-comments-thread` |
| Bottom card in hierarchy (you are here) | **Focused comment** | Last id in `loungeCommentDetailPathIds` |
| List under the focus | **Direct replies** | `variant="commentDetailReplies"`; `orderCommentDetailDirectReplies`; `parent_id ===` focus |
| Whole subtree in DB | **Descendants** / **thread** | `feedCommentDescendantCount*`; nested `parent_id` chain |
| Sticky bottom composer | **Detail comment composer** | `data-lounge-detail-comment-host`; `#lounge-detail-comment`; composes with `parent_id` = focused comment |

**Depth:** `loungeCommentDetailPathIds.length` (1 = first drill from post detail, 2 = reply focus, etc.). Prefer “thread view focused on X, depth N” over inventing new screen names per level.

### DB vs UI words

| Layer | Database | UI label |
| --- | --- | --- |
| Top-level on a post | `feed_comments` row, `parent_id` null | **comment** |
| Child of focused comment | same table, `parent_id` set | **reply** / **direct reply** |
| Deeper nesting | same table | still **replies**; depth is navigation, not a type |

### Avoid

- **“Reply detail screen”** — use **comment thread view** + **focused comment**.
- **“Post article” on detail** — that name is the **feed card** (`LoungePostArticle`), not the OP block.

---

## Freemium & subscriptions (cross-cutting — planned)

Product direction (not fully implemented yet; today’s **anonymous shell + open auth** is the stepping stone):

1. **Anonymous** — See **`docs/access-tiers.md`**: Lounge **read-only** (no artificial post cap; normal pagination/RLS), no search/filter/post open; **create account** modal on any attempt to leave Lounge / use other disallowed UI.
2. **Free account** — **Verified user** badge; **full Lounge**; other tabs reachable; **subscribe** gates on bankroll, offer alerts + OCR, locked calculators/guides (see access tiers).
3. **Subscriber** — Verified + **subscriber** badges on Lounge posts; **full app** access; **optional add-on paywalls** for brand-new game packs offered **only to subscribers**. Billing likely **Stripe** + webhooks → Supabase.

**Engineering rules when this ships:**

- **Server truth:** RLS + Edge checks must enforce tier limits; the client only hides/shows UX and must not be the only gate.
- **Single entitlement read path:** e.g. `get_entitlements(user_id)` RPC or JWT claims refreshed post-webhook so `AppShell` / features can branch without duplicating business rules everywhere.
- **Lounge:** view for everyone with `SELECT`; **writes** gated on `authenticated` + profile/tier policies (already directionally aligned with Phase A3).

Order vs phases **A–L** is TBD; likely after **Phase C** (profiles + identity) and stable read paths, introduce schema + webhooks, then gate tab-by-tab. Track concrete tasks in `docs/test-buildout-backlog.md` when implementation starts.

**Your tier definitions:** fill in **`docs/access-tiers.md`** (per-surface read/write matrix + global rules). That file becomes the spec implementation should follow.

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
- **UX (test):** rate-limit / “spam” errors for posting are shown **above** the composer strip in Lounge so long drafts do not hide the message (`SocialFeed.jsx`).
- Later option: Redis/external limiter or edge enforcement for tighter UX.

### Deliverable

- Schema migrations + RLS verification checks (manual SQL checks acceptable initially).

---

## Phase B - Public read feed (UI + API only)

- Ensure anon read policy for visible posts.
- Home feed:
  - Latest mode
  - infinite scroll cursor on `(created_at, id)`
  - **Following tab (planned):** signed-in **Following** slice — posts where `user_id` is in the viewer’s **`profile_follows`**; separate from global home; empty state + query/index + `SocialFeed` tab UI — track in **`docs/test-buildout-backlog.md`** → *Planned (Lounge feed)*.
- Pinned behavior:
  - prepend one pinned row (single query strategy or two-step fetch)
- Logged-out UX:
  - hide composer, likes, comments, search
  - share stays allowed for public posts
  - comments may show teaser/count only

### Deliverable

- Production-like feed behavior for anonymous and signed-in read.

### Lounge FAB wheel navigation (shipped on test — client only)

Primary Lounge nav is a **draggable cyan FAB** + **arc spin wheel** (`LoungeDockArcCarouselPrototype.jsx`), not the legacy footer icon row (`LoungeDockFooterBar.jsx` remains in repo but is **commented out** in `SocialFeed.jsx` / profile).

| Behavior | Notes |
| --- | --- |
| **Open / close** | Tap FAB → wheel; tap FAB or backdrop → close. **Home** chip when a dock panel is open (compact chrome). |
| **Panels** | Search, notifications, chat, settings via `LoungeDockSlidePanels.jsx` (`activePanel` / `panelChrome`). |
| **Following filter** | Wheel **Following** toggles feed scope (`LoungeFeedScopeSwitch` / `loungeFeedScope.js`); **cyan filled** person+ when on; **mid border** on chip, not full “page active” glow. |
| **Compose** | Wheel compose expands feed composer + keyboard (`loungeDockComposeFocus.js`; panel must close first). |
| **Reposition** | Long-press FAB (~450ms), drag, release → position saved (`loungeDockFabPosition.js`). Native text-selection suppressed while held; **~1s** click-through guard after release (synthesized click on feed under finger). |
| **Menu shape** | Settings (dock) → **Wheel (O)** (arc + spin) or **Edge (L)** — `localStorage` `loungeDockMenuLayout:v1`; L mode snaps FAB to bottom-left/right by screen half and lays icons in horizontal + vertical legs (`loungeDockLShapeOffsets` in `loungeDockFabPosition.js`). **After long-press reposition, bottom-corner snap is L only** (wheel keeps drop position). |
| **Visual** | Unified neon-cyan wheel; **glow off**; border-only active state. Icon optical tweaks (e.g. bell `translate(-2, …)`). |

**Likes (interaction row):** poker-chip + heart icon (`LoungeFlameIcon.jsx`, solar red when liked); **Share** only in card **⋯** menu.

---

## Phase C - Profiles + first-interaction gating

- **Shipped (test, partial):** Full-screen **profile editor** in Lounge (`LoungeProfileFullScreen.jsx`) for own profile: display name, handle, avatar, About; saves respect RLS; **staff `role` is not stripped** on save. **Handle changes:** at most **once per rolling 7 days** — DB column `profiles.handle_changed_at` + trigger in **`supabase/profile_handle_changed_at.sql`** (also bundled at end of **`profile_lounge_fullscreen.sql`**); client shows **Confirm** (first change in window) or **Cooldown** (within window: save other fields, keep server handle) on **Save**, with **Continue** performing the save without a second Save tap. **iOS:** min **16px** text on handle/display fields and post-save **blur + window/visualViewport scroll** to reduce Safari zoom/viewport glitches.
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

### D2. Video (1 per post today, max **60s** on Lounge)

- **Shipped (test):** **Cloudflare Stream** — Edge **`lounge-cf-stream-direct-upload`** mints one-time upload URLs (`maxDurationSeconds: 60`); Edge **`lounge-cf-stream-delete-video`** deletes the Stream asset when the feed post is removed (client calls it before row delete); client **`src/utils/loungeVideoUpload.js`** uploads and polls HLS manifest until ready; DB **`community_feed_posts.stream_video_uid`** (`supabase/lounge_feed_post_stream_video.sql`). Playback **`LoungePostStreamVideo.jsx`** (native HLS where supported, else lazy **`hls.js`**). Video bytes **not** in Supabase Storage. **Basic POST** path: files **≤ 200 MB** (Cloudflare limit for that method).
- **Shipped (test, feed UX):** **`LoungeFeedVideoAutoplayContext.jsx`** + **`loungeFeedVideoAutoplayStore.js`** + feed scroll root — **mid-scroll winner** tile plays inline HLS (one decoder; IO prefetch margin). Poster→video **crossfade** with **`requestVideoFrameCallback`** (and fallbacks) + short **transition delay** to reduce black flash. **Shared inline sound:** provider flag so **Tap for sound** / **Tap to mute** + speaker glyph apply to whichever clip is autoplaying; strip label toggles. **Hero expand (test):** tap tile → same `<video>` **GPU FLIP** to full-screen (`LoungePostStreamVideo.jsx`); tap snapshot freezes fade; canvas frame shield + deferred scrim; card-hole poster **behind** flyout; vertical **swipe dismiss** on flyout shell. **Community feed pagination:** **`COMMUNITY_FEED_PAGE_SIZE = 28`** in **`AppShell.jsx`** (perf diet; was 40). **Quote repost** modal **`z-[100]`** above opened post detail **`z-[98]`** (above profile **`z-[97]`**) so compose/remove is not behind the post page or an open profile. Upload progress bar: **Cancel** capitalization.
- **Edge secrets (names only):** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` (Stream **Write** or **Edit**). See **`supabase/functions/lounge-cf-stream-direct-upload/README.md`** and **`supabase/functions/lounge-cf-stream-delete-video/README.md`**.
- **Alternatives** (not implemented): Mux, Bunny Stream.
- **Planned (not shipped):** **Up to two** Stream clips per post (ordered uids; still exclusive of still-image carousel). First ship caps at **2**; may raise toward **4** later. Needs migration from scalar `stream_video_uid`, multi-tile feed/detail, composer + quote paths, delete-each-uid, and an **inline autoplay** rule when two clips share one row — tracked **`[ ]`** in **`docs/test-buildout-backlog.md`** *Planned (Lounge media)*.

### Deliverable

- Create post with caption + optional game tag + media.

**Shipped (test, UX):** Quote-repost composer uses the same **tall textarea** behavior as the main composer (min/max height, typography); **images/GIF** sit on the line below text. **Multi-image carousels** in the feed reset to the **first (left-most) slide** when the post row **re-enters the viewport** after scroll-away (`LoungePostFeedMedia.jsx`). Composer **image cap** (e.g. 6) shows a modal with clear copy from file picker / quote flows.

### Deferred — Stream + images in one carousel (upload order)

- **Not scheduled.** Product idea: a **single** horizontal strip where **Stream clips and still/GIF slides** share one list ordered by **upload sequence** (no type precedence). Requires replacing the current **either/or** split (`stream_video_uid` vs `image_urls` / carousel), mixed lightbox behavior, composer + quote + delete/orphan + autoplay work — tracked as **`[-]`** in **`docs/test-buildout-backlog.md`** *Deferred / someday*.

---

## Phase E - Comments (threaded)

- **Shipped (test, first slice):** `supabase/feed_interactions_phase_ef.sql` defines `feed_comments` + RLS + top-level-only post `comment_count` triggers; Lounge post detail lists **top-level** comments and drill-down for full threads. **Inline OP replies (post detail only):** replies authored by the **post owner** (`user_id === post.user_id`) with `parent_id` set to a **root** comment render **below** that parent in `LoungePostCommentThread.jsx` with the **same horizontal layout** as other comments; a **vertical connector** at the parent avatar column marks the thread (other replies stay drill-down only). Threading, ranking, and anon teaser rules below are not all implemented yet.
- Table: `feed_comments` with `parent_id`, `post_id`, `body` (max **280** chars, same as post captions), `created_at`, `edited_at`, `hidden_at`.
- RLS:
  - logged-out: no full comment body access (counts/teasers only as needed)
  - signed-in: full thread access by policy
- Sorting:
  - top-level with score + decay
  - nested oldest-first
  - quality/collapse tuning can be phased later

---

## Phase F - Likes + counts

- **Shipped (test, first slice):** `post_likes`, `post_reposts`, `post_bookmarks` + triggers on `like_count` / `repost_count` in `feed_interactions_phase_ef.sql`; Lounge wiring persists toggles. **Per-comment** interactions: **`feed_comment_likes`**, **`feed_comment_reposts`**, **`feed_comment_bookmarks`** + denormalized counts on **`feed_comments`** (migration **`20260515190000_feed_comment_interactions.sql`** + §5b in the same canonical SQL); post-detail comment rows use their own counts/toggles in **`SocialFeed.jsx`** / **`LoungePostCommentThread.jsx`**. Periodic reconcile for counts remains optional / out of scope.
- **UX (test):** **Repost** opens a **fixed popover above the stat** (plain / quote / undo / remove quote as applicable) on feed + post detail; removed bottom-sheet “repost manage” for consistency.
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

- `/p/:id` single post page with comment teaser rules (not shipped; in-app query param used first).
- **Shipped (partial):** share permalink **`/lounge/p/<uuid>`** (Vercel **`api/lounge-post-og.js`** serves **Open Graph** / Twitter Card HTML + redirect to **`/?tab=home&post=<uuid>`**); **Share** uses `navigator.share` with **clipboard** fallback (`src/utils/loungeSharePost.js` + `SocialFeed.jsx`). Anonymous visitors can **open** a shared post in the detail sheet (read-only); other entry paths to the sheet still require sign-in where they did before.

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
12. **Freemium / subscriptions** (see section above): entitlements in DB + Stripe webhooks, then progressive **subscribe gates** on tabs/features once account + feed foundations are stable.

---

## Messaging / chat (future — outside A–L phase order)

**MVP wiring (DMs + topic channels + dock UI)** lives in **`supabase/chat_phase1.sql`**, Edge **`lounge-chat`**, **`LoungeChatPanel.jsx`**, and backlog **Planned (messaging)** / smoke **§13** — apply SQL + deploy Edge on **test** before treating chat as live.

When extending beyond the MVP slice: ship with **TLS in transit** + **managed encryption at rest** first; plan a **second phase** for **app-level ciphertext storage** (honest wording — **not** end-to-end unless clients alone hold keys). **Prep from day one:** central message API seam + schema fields for `content_encoding` / key metadata so ciphertext is an upgrade, not a rewrite. **Details, checkboxes, and rough timelines:** `docs/test-buildout-backlog.md` → **Planned (messaging)**.

---

## Risks to flag early

- Video transcoding path: a single Edge Function running ffmpeg may hit platform runtime/memory limits. Confirm where transcoding executes before D2 (Supabase-compatible patterns vs external worker).
- Comments + infinite scroll performance: ranking and thread queries are likely the first hotspot. Add indexes early (`post_id`, `parent_id`, `created_at`) and validate query plans on realistic data volume.
- Feed table migration safety: production promotion should still follow **expand → backfill → app deploy → contract** whenever changing column shapes; test env skipped straight to caption-only after backfill.
