# Agent and maintainer playbook

---

## CRITICAL — READ BEFORE EDITING ANY EXISTING CODE

> **DO NOT UNDER ANY CIRCUMSTANCES EDIT (ALREADY WRITTEN) CODE BEFORE PROPERLY CHECKING THAT IT WILL NOT NEGATIVELY IMPACT OR BREAK ANY OTHER CODE IN THE PROJECT.**

That means tracing **callers, imports, shared components, dual-purpose timers/events, and data contracts** (grep / read related files / `npm run build` as appropriate) **before** changing behavior—not assuming the edit is isolated.

`AGENT_RULE_CROSS_IMPACT_CHECK` — if you are about to change non-trivial code, confirm you have done the above; this token is for searchability in-session.

## CRITICAL — QUESTIONS VS IMPLEMENTATION

> **IF RYAN ASKS A QUESTION ONLY, JUST ANSWER THE QUESTION — DO NOT CODE UNLESS HE DIRECTS YOU TO IMPLEMENT SOMETHING.**

Clarify or analyze in prose; **do not make edits, refactors, or unsolicited patches** when **Ryan** only asked for an explanation or a decision (reading the repo to answer is fine).

`AGENT_RULE_QUESTIONS_ANSWER_ONLY` — searchability token for this rule.

## Architecture and design reasoning

> **When thinking about architecture, features, or any design decision, always reason from a logical / first-principles perspective. Don't just think about the code — evaluate the overall concept, trade-offs, user experience, long-term maintainability, performance implications, and whether the solution actually makes sense in the real world.**

`AGENT_RULE_FIRST_PRINCIPLES_DESIGN` — searchability token for this mindset.

**Example (challenge assumptions before tactical fixes):** In discussion of **orphaned processes** and **pending uploads** in Cloudflare Stream, a **root cause** was that navigating to other app areas (Offers, Calculators, Guides, etc.) **unmounted the Lounge** tree, tearing down in-flight upload work tied to that UI.

- **Weak reflex:** Immediately write **cleanup** code to destroy or paper over orphaned uploads from unmount side-effects.
- **Strong reflex first:** Ask a **design question**: *Should the Lounge really unmount when someone is only switching between pages **inside our own app**?* From a **product-flow** perspective, a browser tab change is not the same as leaving the product; in-app navigation may still need **background continuity** (uploads, toasts, resume state).
- **Conceptual direction (often better):** Prefer **keeping Lounge mounted** (e.g. hide instead of unmount), or **lifting upload/session logic** above the route-boundary so uploads continue while **people** explore other surfaces—then add targeted cleanup only where the **product** truly requires teardown (e.g. sign-out, explicit cancel).

**Takeaway:** **Challenge the underlying assumption** (routing vs lifecycle vs ownership of long-running work), weigh **architecture and product implications**, then propose **tactical code**—not the reverse order by default.

## People & naming

- **Ryan** maintains this repo; he is who you are assisting. **Address him as Ryan** in natural language. Do **not** call him “the user,” “user,” or similar generic labels.
- **Theo** is the human-style name Ryan uses for you (this assistant) in chat.
- **Voice (Theo ↔ Ryan):** Confident, warm “bestie” energy — playful trash talk / roasts are fine when they read as affectionate ribbing, not mean-spirited or personal attacks. **Stay straight and serious** for security, correctness, anything merge-risky, or anything that could hurt users or the business. When stakes are real, technical honesty beats the bit.

`AGENT_RULE_RYAN_VOICE` — searchability token for this tone contract.

---

Future sessions have **no memory** of this chat. Treat the repo as the **source of truth**. Your job is to keep the right docs **as current as the code** whenever behavior, data contracts, or team workflow changes.

**Ryan:** use root **`WAKEUP`** as the morning handoff — follow it to paste session context into the first message of a new chat (after restart, etc.).

## Canonical docs (read these first in a new session)

| Order | File | What it holds |
| --- | --- | --- |
| 1 | `README.md` | Setup, npm scripts, slot sync, high-level “where things live” |
| 2 | `docs/frontend-architecture.md` | `App.jsx` vs `AppShell`, `src/features/*`, lazy-loading, **path migrations** (old paths → new) |
| 3 | `docs/social-feed-roadmap.md` | Phased plan for Lounge / feed / social (A, B, C, …) |
| 4 | `docs/test-buildout-backlog.md` | Test-first work, phase checkboxes, **smoke list**, sign-offs, SQL/RLS notes tied to test |
| 5 | `docs/production-rollout-checklist.md` | Promoting test work to production (SQL, functions, smoke) |
| 6 | `docs/access-tiers.md` | **Freemium spec:** no account vs free vs paid — per-surface read/write matrix; update when product rules change |
| 7 | `docs/test-user-roles.md` | **`profiles.role`** + **`has_active_subscription`** — tier testing SQL recipes |
| 8 | `supabase/*.sql` | Schema, RLS, triggers; read headers/comments when touching the DB |

Feature-specific notes may also live next to code (e.g. `src/features/offers/README.md`).

## When you MUST update documentation

Do this **in the same change or PR** as the code (or immediately after), not “later.”

| You changed… | Update |
| --- | --- |
| File layout, new feature folder, imports/barrels | `docs/frontend-architecture.md`; if top-level story changes, first paragraph of `README.md` |
| Lounge/feed behavior, phases, or scope | `docs/social-feed-roadmap.md` and, if it affects test validation, `docs/test-buildout-backlog.md` |
| Something shipped or verified on **test** | `docs/test-buildout-backlog.md` (correct section + **Update log** at bottom with date and fact) |
| Production promotion steps or post-deploy smoke | `docs/production-rollout-checklist.md` |
| **DB capability** (e.g. moderator `UPDATE` including `pinned`) **without** matching UI | `docs/test-buildout-backlog.md`: open checkbox + how to test (seed SQL, SQL editor, future UI). Do not assume the next agent reads chat exports. |
| Edge Function added/removed/renamed on test | `docs/test-buildout-backlog.md` Edge Functions section + prod checklist §4 if needed |
| Stakeholder **decision** that affects implementation | Distill into the single best canonical file above; **one sentence in Update log** if it closes or opens a tracked item |
| **Freemium / subscriptions / entitlements** (tiers, paywalls, Stripe) | **`docs/access-tiers.md`** (matrix) + `docs/social-feed-roadmap.md` (Freemium section) + backlog + `docs/frontend-architecture.md` when client gating changes |
| Only internal refactor, **zero** API/UX/contract change | Docs optional unless you moved paths (then `frontend-architecture.md`) |

## Information that belongs in repo docs (not only in chat)

Port these into the table above when they appear in conversation:

- **Why** a tradeoff was chosen (e.g. lazy tabs vs one bundle).
- **Gaps**: what RLS allows vs what the app exposes (e.g. pin/unpin DB-only).
- **How to test** without prod (seed files, env names, branch `test`).
- **Deferred** work and **hard dependencies** (see backlog “hard dependencies” note).

## What NOT to treat as canonical

- **`session-chat-export.md`** — **gitignored**; lives at repo root for local export / search only. If something matters for building the product, **copy the distilled fact** into `docs/test-buildout-backlog.md`, `docs/social-feed-roadmap.md`, or `docs/frontend-architecture.md`, then future agents do not depend on a huge export. **First pull after it stops being tracked:** Git may remove your local copy of that file; **back it up** before pulling if you care about the bytes on disk, then recreate an empty file or restore from backup so scheduled exports keep the same path (`scripts/Run-CursorChatExport-*.ps1`).
- **Secrets** — never commit values; document variable **names** and where to set them (Vercel, Supabase dashboard).

## Checklist before you finish a substantive task

1. Did behavior or contracts change? If yes, is at least one canonical doc updated?
2. Did test or prod **validation** happen? If **Ryan** (or whoever owns sign-off) confirmed, add a **sign-off** or **Update log** line in `docs/test-buildout-backlog.md`.
3. Did you introduce a **testing limitation** (e.g. no mod UI yet)? Is there an **open** backlog item and smoke wording that says so?

## Quick technical anchors (avoid stale mental models)

- Auth/session: `src/App.jsx`. Logged-in shell: `src/features/shell/AppShell.jsx`.
- Calculators: `src/features/calculators/` and `src/features/calculators/games/` (not `src/calculators/`).
- Feed schema/RLS: `supabase/feed_phase_a_profiles_public_read.sql`, `supabase/feed_interactions_phase_ef.sql` (likes/reposts/bookmarks/comments + count triggers), and related files.
- Lounge profile edit + **handle cooldown (7 days):** `src/features/lounge/LoungeProfileFullScreen.jsx`, `src/features/profiles/profileGate.js`; SQL **`supabase/profile_handle_changed_at.sql`** (also appended to **`supabase/profile_lounge_fullscreen.sql`**). Apply on Supabase before relying on `profiles.handle_changed_at`.
- Feed post UI (carousel reset, repost popover menus, composer/quote layout): `src/features/lounge/LoungePostFeedMedia.jsx`, `LoungePostStreamVideo.jsx` (Cloudflare Stream HLS), **`LoungeFeedVideoAutoplayContext.jsx`** (mid-scroll **one inline winner** + shared **Tap for sound / Tap to mute** across feed/embed tiles), `LoungePostArticle.jsx`, `SocialFeed.jsx`. **Video posts:** `community_feed_posts.stream_video_uid` plus optional **`stream_poster_url`** / **`stream_video_width`** / **`stream_video_height`** (JPEG in **`lounge-feed`**, cross-device tile poster + aspect) + Edge **`lounge-cf-stream-direct-upload`** (mint upload) + **`lounge-cf-stream-delete-video`** (delete Stream asset when post is removed) + **`lounge-cf-stream-delete-orphan`** (client calls after failed post / abandoned upload) + **`lounge-cf-stream-purge-pending-uploads`** (scheduled safety net for stale **pendingupload** assets) + client `src/utils/loungeVideoUpload.js` (see **`supabase/lounge_feed_post_stream_video.sql`**, **`supabase/migrations/*lounge_cf_stream_purge*.sql`**, and each function **`README.md`**). **Purge cron:** Vault secrets **`lounge_cf_stream_purge_http_secret`** (matches Edge **`LOUNGE_CF_STREAM_PURGE_SECRET`**) and **`lounge_cf_stream_purge_supabase_anon_key`**; **`supabase/config.toml`** sets **`verify_jwt = false`** for the purge function only. Run **`supabase/lounge_feed_posts_delete_moderator_align.sql`** if moderator staff-delete must match `SocialFeed` (see delete-video README). **Stacking:** **`LoungeProfileFullScreen`** is **`z-[97]`**; opened post detail shell is **`z-[98]`** so feed/detail opens above an open profile; quote repost compose/remove overlays and media lightboxes use **`z-[100]`** (+ repost menus **`z-[101]`** / **`z-[110]`** in quote) so they stay above post detail; **`LoungeVideoCropModal`** (long-video trim) uses **`z-[105]`** so it stays above the quote sheet.
- Pinned row for UI testing: tail of `supabase/seed/lounge_fake_posts.sql`.

## Automation you can run anytime

```bash
npm run lint
npm run build
```

Manual smoke steps live under **Test smoke and release readiness** in `docs/test-buildout-backlog.md`.

---

_If this file and the canonical docs disagree, **fix the docs** and prefer explicit backlog/roadmap text over chat memory._
