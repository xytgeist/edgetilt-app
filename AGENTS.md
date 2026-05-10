# Agent and maintainer playbook

Future sessions have **no memory** of this chat. Treat the repo as the **source of truth**. Your job is to keep the right docs **as current as the code** whenever behavior, data contracts, or team workflow changes.

**Humans:** copy the template in root **`WAKEUP`** into the first message of a new chat (after restart, etc.).

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
| User / stakeholder **decision** that affects implementation | Distill into the single best canonical file above; **one sentence in Update log** if it closes or opens a tracked item |
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
2. Did test or prod **validation** happen? If the user confirmed, add a **sign-off** or **Update log** line in `docs/test-buildout-backlog.md`.
3. Did you introduce a **testing limitation** (e.g. no mod UI yet)? Is there an **open** backlog item and smoke wording that says so?

## Quick technical anchors (avoid stale mental models)

- Auth/session: `src/App.jsx`. Logged-in shell: `src/features/shell/AppShell.jsx`.
- Calculators: `src/features/calculators/` and `src/features/calculators/games/` (not `src/calculators/`).
- Feed schema/RLS: `supabase/feed_phase_a_profiles_public_read.sql` and related files.
- Pinned row for UI testing: tail of `supabase/seed/lounge_fake_posts.sql`.

## Automation you can run anytime

```bash
npm run lint
npm run build
```

Manual smoke steps live under **Test smoke and release readiness** in `docs/test-buildout-backlog.md`.

---

_If this file and the canonical docs disagree, **fix the docs** and prefer explicit backlog/roadmap text over chat memory._
