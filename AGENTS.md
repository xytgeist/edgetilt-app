# Agent and maintainer playbook

---

## CRITICAL — PLATFORM GUARDS AND LAYOUT DEBUGGING

### Never use negative platform checks as a gate

> **NEVER use `!IS_ANDROID`, `!IS_IOS`, or any other negated platform constant as a way to target a specific platform.** `!IS_ANDROID` means "everything except Android" — it silently includes Windows, macOS, Linux, crawlers, tablets, and anything else that isn't Android. Always use the **positive** form: `IS_IOS`, `IS_ANDROID`, etc.

Bad: `composerFocused && !IS_ANDROID ? { paddingTop: X } : undefined`
Good: `composerFocused && IS_IOS ? { paddingTop: X } : undefined`

`AGENT_RULE_POSITIVE_PLATFORM_GUARDS` — searchability token.

### When a layout value shifts by exactly N px, grep for N first

> If Ryan reports a layout jump of a specific pixel amount, **grep the codebase for that number before investigating scroll/RAF/ResizeObserver logic.** A shift of exactly 32px almost certainly means a constant named something like `*_PAD_PX` or `*_INSET_PX` is being applied. Find the constant, read its gate condition, and verify the gate is correct before doing anything else.

`AGENT_RULE_GREP_PIXEL_CONSTANT` — searchability token.

### Trust Ryan's platform statement immediately

> When Ryan says "I'm on Chrome Windows" / "I'm on iOS" / "this is on localhost," **accept it as ground truth and immediately rule out any code path that cannot run on that platform.** Do not second-guess or silently assume a different device.

`AGENT_RULE_TRUST_PLATFORM_CLAIM` — searchability token.

---

## CRITICAL — PRODUCTION vs TEST SUPABASE (post EdgeTilt cutover)

> **Production** is **`jtjgtucumuoswnbauxry`** (`edgetilt.com`). **Test** is **`kcosfvmreeiosdjdzycb`** (`lvslotpro.com` sandbox). Cutover runbook: **`docs/edgetilt-production-cutover.md`**.

**Treat production Supabase like production.** AP guides, heroes (R2), and live **`guides.content_markdown`** on **`jtjgtucumuoswnbauxry`** are not a sandbox.

**Never without Ryan's explicit instruction (slug or batch named in chat):**

- `runSlotGuideIngest` / `npm run slots:sync:*` / `ap-guide-workspace-batch-run.mjs` / `ap-guide-reingest-payloads.mjs` against **production**
- Any script that upserts **`guides`** or **`machines`** on **production**
- "Quick" one-liner `node -e` ingest to fix copy on **production**

**Default agent workflow for guide text:** edit **`scripts/lib/apGuideBatch*Payloads.mjs`** (or answer in chat) only. Ryan pushes via **`/slot-guide-form` on edgetilt.com** or tells you exactly when to ingest to prod.

**Test sandbox (`kcosfvmreeiosdjdzycb`):** agents may propose test ingests only when Ryan explicitly asks; still offer backup before batch work.

**Before any approved batch ingest to production:** offer or run **`node scripts/ap-guide-backup-test-guides.mjs --all-batch --target=production`** (or slug list) so rows are snapshotted under **`ap-guide-workspace/_guide-backups/`**.

**Ingest must not wipe form assets:** re-ingest without a new hero file **preserves** existing **`thumbnail_url`** (see **`runSlotGuideIngest.mjs`**). Re-ingest still replaces **`content_markdown`** when Ryan explicitly requests it ... that is destructive by design.

`AGENT_RULE_TEST_IS_PROD` — searchability token (rule now: **prod is prod**, test is sandbox).

---

## CRITICAL — GIT: MATCH ORIGIN BEFORE ANY EDIT

> **Before changing any tracked file, fetch and confirm local matches `origin` (usually `origin/test`).** Dual-machine both push `test`. A stale local is how conflicts happen. Question-only turns skip this.

If behind: pull first. If diverged (`N` local and `M` remote): **stop**, tell Ryan, do not start a new diff. Cursor: **`.cursor/rules/sync-origin-before-edit.mdc`**.

`AGENT_RULE_SYNC_ORIGIN_BEFORE_EDIT` — searchability token.

---

## CRITICAL — GIT: COMMIT AND PUSH TO `test` + `main` (Ryan pre-approved)

> **Ryan has standing permission to commit and push to `test` without asking each time.** After finishing implementation work, commit, `git push origin test`, tell him the hash and summary. **Do not** wait for "commit and push" every session.

> **Do not push `main` unless Ryan explicitly asks** (revoked standing dual-push Aug 9, 2026 … Vercel credit burn from test+main deploys).

**Still ask / wait for explicit instruction before:**

- Pushing / promoting **`main`** (prod Vercel)
- **Production** Supabase ingest, migrations, Edge deploys, or other prod DB/ops (git `main` ≠ prod Supabase)
- Force-push, amend-after-push, git config changes
- Commits when Ryan asked a **question only** or there is **no meaningful diff**

Follow normal git safety (no secrets, no force-push). Cursor rule: **`.cursor/rules/commit-push-test-autonomous.mdc`**.

`AGENT_RULE_COMMIT_PUSH_TEST` / `AGENT_RULE_COMMIT_PUSH_MAIN_ON_ASK` — searchability tokens.

---

## CRITICAL — REPO & APP VERSIONING PROTOCOL

> **EdgeTilt uses Semantic Versioning (`MAJOR.MINOR.PATCH`) starting at `v1.4.0` (July 1, 2026 was `v1.0.0` live cutover).**

- **Locations synced**:
  - `package.json` (`"version"`)
  - `src/utils/appBuildInfo.js` (`APP_VERSION`)
  - `ios/EdgeTilt/AppConfig.swift` (`CFBundleShortVersionString` fallback)
  - `ios/project.yml` (`MARKETING_VERSION`)
  - `ios/EdgeTilt.xcodeproj/project.pbxproj` (`MARKETING_VERSION`)
- **Rules when pushing changes**:
  - **`PATCH` (e.g. `1.4.0` → `1.4.1`)**: Auto-bump for bug fixes, math calibrations, UI polish, minor tweaks.
  - **`MINOR` (e.g. `1.4.0` → `1.5.0`)**: Bump when shipping a substantial new feature suite (e.g. Creator Fan Subs, StoreKit IAP, new tool suites).
  - **`MAJOR` (e.g. `1.x.x` → `2.0.0`)**: Bump for massive milestones (e.g. full native Swift rewrite / multi-platform public App Store release).
  - **`BUILD_NUMBER`**: Increments automatically on every build in Xcode Cloud (`CI_BUILD_NUMBER + 100`).

`AGENT_RULE_VERSIONING_PROTOCOL` — searchability token.

---

## CRITICAL — DUAL-MACHINE (Mac iOS shell + Windows web)

> During the iOS shell sprint, Ryan runs **two Cursor chats** (Mac + Windows). They do **not** share memory. Continuity = **`git pull`/`push` on `test`** + **`WAKEUP`** + **`docs/ios-native-bridge.md`**.

**Ownership:** Mac → `ios/` + native bridge handlers. Windows → `src/**` + web/catalog. Conflict → Mac wins `ios/`, Windows wins `src/`. Do not edit the other lane the same day.

**Bridge:** Agree / update method rows in **`docs/ios-native-bridge.md`** before freestyling `window.EdgeNative.*` on both sides. Stub one side first.

**Session ritual:** match origin before each edit → work in lane → push `test` → short `WAKEUP` note. Full ruleset: **`docs/ios-native-bridge.md`** + **`WAKEUP`** Dual-agent ruleset. Cursor: **`.cursor/rules/dual-machine-ios-shell.mdc`** + **`.cursor/rules/sync-origin-before-edit.mdc`**.

`AGENT_RULE_DUAL_MACHINE_IOS` — searchability token.

---

## CRITICAL — READ BEFORE EDITING ANY EXISTING CODE

> **DO NOT UNDER ANY CIRCUMSTANCES EDIT (ALREADY WRITTEN) CODE BEFORE PROPERLY CHECKING THAT IT WILL NOT NEGATIVELY IMPACT OR BREAK ANY OTHER CODE IN THE PROJECT.**

That means tracing **callers, imports, shared components, dual-purpose timers/events, and data contracts** (grep / read related files / `npm run build` as appropriate) **before** changing behavior—not assuming the edit is isolated.

`AGENT_RULE_CROSS_IMPACT_CHECK` — if you are about to change non-trivial code, confirm you have done the above; this token is for searchability in-session.

### Report blast radius before landing changes

> Before implementing (or when summarizing a diff), tell **Ryan** every **other surface** the change will affect — shared CSS classes, reused components, cross-feature imports, light/dark leakage — not only the file or feature he named. Grep the symbol/class first.

`AGENT_RULE_BLAST_RADIUS` — searchability token.

## CRITICAL — QUESTIONS VS IMPLEMENTATION

> **IF RYAN ASKS A QUESTION ONLY, JUST ANSWER THE QUESTION — DO NOT CODE UNLESS HE DIRECTS YOU TO IMPLEMENT SOMETHING.**

Clarify or analyze in prose; **do not make edits, refactors, or unsolicited patches** when **Ryan** only asked for an explanation or a decision (reading the repo to answer is fine).

`AGENT_RULE_QUESTIONS_ANSWER_ONLY` — searchability token for this rule.

## CRITICAL — LIGHT MODE vs DARK MODE (mode-specific UI)

> When **Ryan** says a change is for **light mode only** or **dark mode only**, that change **MUST apply only to that mode** and **MUST NOT** affect the other mode.

- **Do not** change shared classes, unscoped styles, or root tokens in ways that shift **both** themes—unless Ryan explicitly asked for both, or you **verify with Ryan first** if you believe both should change.
- **Prefer scoping:** light → `html.light` and/or feature `data-*` overrides in `src/index.css` (see bankroll / play-logbook / quick-link patterns); dark → default (no `html.light` on `<html>`).
- If unsure whether an edit leaks across modes, **ask Ryan** before implementing.

`AGENT_RULE_THEME_MODE_ONLY` — searchability token for this rule. Cursor: `.cursor/rules/light-dark-mode-only.mdc` (`alwaysApply: true`).

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
- **Punctuation:** Never use **em dashes** (`—`) in anything you write for Ryan. When a break could be ` - ` or `...`, **prefer `...`** (Ryan's voice). Use `-` only for ranges and true compounds. Cursor: `.cursor/rules/no-em-dashes.mdc` (`alwaysApply: true`).

`AGENT_RULE_RYAN_VOICE` - searchability token for this tone contract. `AGENT_RULE_NO_EM_DASHES` - no em dashes; prefer ellipses over hyphens for prose breaks.

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
| 6 | `docs/edgetilt-production-cutover.md` | **One-time** prod/test Supabase + domain cutover (`edgetilt.com` / `lvslotpro.com`) |
| 6b | `docs/seo-edgetilt-slots.md` | Brand SEO for **edge tilt / advantage play slots** … `/advantage-play-slots`, `/slots` (+ tools), `/guides`, `/poker`, sitemap, Search Console |
| 6c | `docs/ios-native-bridge.md` | **iOS WKWebView shell:** JS↔Swift bridge contract stub + **dual-machine agent rules** (Mac vs Windows) |
| 6d | `docs/theo-channel.md` | **Windows ↔ Mac Theo mailbox** on **https://lvslotpro.com/theo** (read without git pull) |
| 6 | `docs/access-tiers.md` | **Freemium spec (shipped):** no account vs free vs **Slots Edge** / staff — per-surface read/write matrix |
| 7 | `docs/entitlements-matrix.md` | **Multi-product paywalls (planned + partial):** Edge Pro, creator fan subs, add-ons, stacking, **`get_my_entitlements()`** target, rollout phases |
| 8 | `docs/affiliates.md` | **Creator affiliates:** in-house v1 (packages, `?ref=` + promo, ledger, admin/creator portals, Connect) |
| 9 | `docs/test-user-roles.md` | **`profiles.role`** + **`has_active_subscription`** — tier testing SQL recipes |
| 10 | `supabase/*.sql` | Schema, RLS, triggers; read headers/comments when touching the DB |

Feature-specific notes may also live next to code (e.g. `src/features/offers/README.md`).

## When you MUST update documentation

Do this **in the same change or PR** as the code (or immediately after), not “later.”

| You changed… | Update |
| --- | --- |
| File layout, new feature folder, imports/barrels | `docs/frontend-architecture.md`; if top-level story changes, first paragraph of `README.md` |
| Lounge/feed behavior, phases, or scope | `docs/social-feed-roadmap.md` and, if it affects test validation, `docs/test-buildout-backlog.md` |
| Lounge Stream **iOS playback / hero / HLS recovery** | **`docs/lounge-stream-ios-playback.md`** (+ backlog Update log); Cursor rule **`.cursor/rules/lounge-stream-ios-playback.mdc`** |
| **iOS WKWebView shell / `EdgeNative` bridge / dual-machine rules** | **`docs/ios-native-bridge.md`** + backlog **Planned (Native shells)** + **`WAKEUP`** Dual-agent ruleset |
| Something shipped or verified on **test** | `docs/test-buildout-backlog.md` (correct section + **Update log** at bottom with date and fact) |
| Production promotion steps or post-deploy smoke | `docs/production-rollout-checklist.md` |
| **DB capability** (e.g. moderator `UPDATE` including `pinned`) **without** matching UI | `docs/test-buildout-backlog.md`: open checkbox + how to test (seed SQL, SQL editor, future UI). Do not assume the next agent reads chat exports. |
| Edge Function added/removed/renamed on test | `docs/test-buildout-backlog.md` Edge Functions section + prod checklist §4 if needed |
| Stakeholder **decision** that affects implementation | Distill into the single best canonical file above; **one sentence in Update log** if it closes or opens a tracked item |
| **Freemium / subscriptions / entitlements** (tiers, paywalls, Stripe) | **`docs/access-tiers.md`** (shipped tiers) + **`docs/entitlements-matrix.md`** (multi-product catalog + capability matrix) + `docs/social-feed-roadmap.md` (Freemium section) + backlog + `docs/frontend-architecture.md` when client gating changes |
| **Creator affiliates** (in-house ledger, packages, ref/promo) | **`docs/affiliates.md`** |
| Only internal refactor, **zero** API/UX/contract change | Docs optional unless you moved paths (then `frontend-architecture.md`) |

## Information that belongs in repo docs (not only in chat)

Port these into the table above when they appear in conversation:

- **Why** a tradeoff was chosen (e.g. lazy tabs vs one bundle).
- **Gaps**: what RLS allows vs what the app exposes (e.g. pin/unpin DB-only).
- **How to test** without prod (seed files, env names, branch `test`).
- **Deferred** work and **hard dependencies** (see backlog “hard dependencies” note).

## What NOT to treat as canonical

- **Secrets** — never commit values; document variable **names** and where to set them (Vercel, Supabase dashboard).

## Checklist before you finish a substantive task

1. Did behavior or contracts change? If yes, is at least one canonical doc updated?
2. Did test or prod **validation** happen? If **Ryan** (or whoever owns sign-off) confirmed, add a **sign-off** or **Update log** line in `docs/test-buildout-backlog.md`.
3. Did you introduce a **testing limitation** (e.g. no mod UI yet)? Is there an **open** backlog item and smoke wording that says so?

## Quick technical anchors (pointers — details live in canonical docs)

Do **not** duplicate long implementation notes here (they drift). Read these when touching a surface:

| Surface | Where the details live |
| --- | --- |
| App entry, auth vs shell, feature folders, lazy chunks | **`docs/frontend-architecture.md`** (`App.jsx`, `AppShell`, `src/features/*`) |
| Lounge (feed, Stream/R2, dock FAB, threads, profiles, **market charts**, smoke §11–§21) | **`docs/frontend-architecture.md`** → **`lounge/`** row; backlog **Lounge market** Update log lines |
| Lounge Stream **iPhone/PWA playback + hero** (rs=0 while playing, MSE hero lock, WAAPI land) | **`docs/lounge-stream-ios-playback.md`** — **read before** `LoungePostStreamVideo.jsx` HLS timers or hero motion; Cursor rule **`.cursor/rules/lounge-stream-ios-playback.mdc`** |
| Chat (DM, groups, video prep, link previews, glass CSS blast radius) | **`docs/frontend-architecture.md`** → **`chat/`** row; backlog **Chat** section |
| Play Logbook, calculators, bankroll, offers, guides | Matching **`docs/frontend-architecture.md`** feature rows; backlog sections |
| **Lounge bots (Scott Share / odds, wire, X editorial)** | **`docs/lounge-bot-sports-odds.md`**, **`docs/syndicate-cfb-weekly-runbook.md`** (CFB board + four-desk weekly SOP … internal), **`docs/lounge-bot-market-news.md`**, **`docs/lounge-bot-crypto-news.md`**, **`docs/lounge-bot-editorial-queue.md`**; portal **`/?tab=bots`** (**`BotReplyOnPostPanel`**, **`BotProfileEditor`**, **`BotComposeImagePicker`**, X **Transform a post**); Edge **`lounge-odds-ingest`**, **`lounge-odds-poll`**, **`lounge-news-poll`**, **`lounge-x-ingest`**; migrations through **`20260707000000`** on test + prod (**`schema_migrations`** tracked Jul 7); X manual transform works without bearer |
| Freemium product rules (shipped) | **`docs/access-tiers.md`** |
| Multi-product entitlements (planned) | **`docs/entitlements-matrix.md`** |
| **Native shells / app stores (planned)** | Backlog **Planned (Native shells / app stores)** … **raw iOS `WKWebView`** (not Capacitor) live-site shell, **iOS first**, Android PWA + optional TWA, billing notes (no Stripe-in-WebView); v1 vs v1.1 cut in backlog. **Bridge + dual-machine:** **`docs/ios-native-bridge.md`** |
| Creator affiliates | **`docs/affiliates.md`** |
| Tier testing SQL (`profiles.role`, `has_active_subscription`) | **`docs/test-user-roles.md`** |
| **Test:** SQL apply order, Edge deploy list, smoke sign-offs, shipped facts | **`docs/test-buildout-backlog.md`** (sections + **Update log** tail) |
| **Production:** full replay when promoting test → prod | **`docs/production-rollout-checklist.md`** §1–§5 — **most of the app is validated on test only today**; prod must follow the checklist, not WAKEUP or this file |
| Edge Function secrets / one-off deploy notes | **`supabase/functions/<name>/README.md`** + backlog **Edge Functions** table |
| Feed schema / RLS baselines | **`supabase/feed_phase_a_profiles_public_read.sql`**, **`feed_interactions_phase_ef.sql`**, **`supabase/migrations/`** |

**High-churn traps (grep repo docs before guessing):**

- Calculators live under **`src/features/calculators/games/`** (not removed **`src/calculators/`**). Buffalo slug **`buffalo-link`** — migration **`20260531540000_buffalo_calculator_slug_buffalo_link.sql`**.
- Lounge z-index: profile **`z-[97]`**, post detail **`z-[98]`**, quote/lightbox **`z-[100]`**+ — **`src/constants/appZIndex.js`**.
- **Do not** re-run **`20260601160000_chat_messages_page_catchup.sql`** after **`20260604180100`**.
- Lounge **thread** SQL chain through **`20260608210000`** — apply order in backlog Update log **2026-06-08** / **2026-06-09**.
- Lounge **market charts:** Edge **`lounge-market-data`** — redeploy after **`finnhubMarket.ts`** / **`yahooMarket.ts`** changes; snapshot PNG branding (**EDGE** wordmark) is **`loungeMarketChartSnapshot.js` only** — live **`LoungeMarketChartModal`** headers stay company-left.
- AP Guide updates: **`/slot-guide-form`** only (Supabase + R2/Storage source of truth). **`README.md`** § AP guide updates + backlog **AP Guide editor**. Legacy **`slots:sync`** scripts remain but repo **`Slots/`** / **`public/guides/`** were removed.
- AP Guide **card accent + light mode:** **`guides.card_accent_color`** (**`20260610240000`**); **`guideCardAccent.js`**, **`guideAccentPalette.js`**, **`dominantAccentFromRgba.js`**. Light mode: zinc **`bg-*`** remaps but **`text-white`** on inputs does not ... scope fixes under **`html.light [data-*]`** or feature classes (**`guide-accent-themed`**, **`data-ask-community-modal`**, **`ap-guides-search-input`**). Expanded card tap-to-collapse: **`shouldIgnoreGuideCardCollapseClick`** in **`GuidesScreen.jsx`**.
- AP Guide **workspace synthesize + ingest:** sources in **`ap-guide-workspace/<slug>/`** (manual mirror copies) → synthesize card → ingest to test → Ryan edits in form. Include **`machines.release_year`** on ingest (form field + card UI); **web-research** launch/floor year when exports don't state it (e.g. **`88-fortunes-emperors-coins`** → **2021**). Test DB: **310** published guides; release years backfilled **2026-06-25**.
- UI test pinned post: tail of **`supabase/seed/lounge_fake_posts.sql`**.

## Automation you can run anytime

```bash
npm run lint
npm run build
```

**Supabase SQL (test default, prod when explicit):** use **`npm run db:query:test`** / **`db:query:production`** (`scripts/supabase-db-query.mjs`) — **not** raw parallel `supabase db query --linked`. The wrapper serializes queries, retries pooler auth failures, and uses **`SUPABASE_DB_PASSWORD`** from **`.env.supabase.{test,production}`** (see **`.env.supabase.example`**) to hit postgres via **`--db-url`** instead of flaky **`cli_login_postgres`** temp role. **Never** fan out multiple `--linked` probes at once (circuit breaker).

```bash
npm run db:query:test -- "select 1"
npm run db:query:production -f supabase/migrations/foo.sql
```

`AGENT_RULE_SUPABASE_DB_QUERY` — searchability token.

Manual smoke steps live under **Test smoke and release readiness** in `docs/test-buildout-backlog.md`.

---

_If this file and the canonical docs disagree, **fix the docs** and prefer explicit backlog/roadmap text over chat memory._
