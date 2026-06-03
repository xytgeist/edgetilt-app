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

## Chat

### Schema (apply before client deploy)
- [ ] **Apply migration `20260601120000_chat_phase2.sql` on test** — adds read receipts, reactions, soft-delete, reply columns, `chat_message_reactions` table + RLS, AFTER INSERT trigger on `chat_messages` keeping `chat_rooms.last_message_at` / `last_message_preview` fresh.
- [ ] **Redeploy `lounge-chat` Edge function** — now handles `delete_message`, `add_reaction`/`remove_reaction`, `update_last_read`, `mute_room`/`unmute_room`, and `reply_to_message_id` on `send_message`.

### Smoke (test)
- [ ] **Conversation list** — Chat tab loads; DMs + topic channels sorted unread-first; unread dot appears for rooms with messages newer than `last_read_at`.
- [ ] **Send/receive** — Send a message in a DM; confirm Realtime INSERT appends it; second device receives it.
- [ ] **Reply** — Long-press a bubble, tap Reply; reply quote strip shows in composer; sent message has `reply_to_preview` rendered above bubble.
- [ ] **Reactions** — Long-press bubble; tap emoji; reaction row appears; second device sees it via Realtime.
- [ ] **Typing indicator** — Type in composer; other device shows "X is typing…" for ~3.5 s.
- [ ] **Delete message** — Long-press own message, tap Delete; bubble shows "This message was deleted".
- [ ] **Mute** — Bell icon in conversation header; pick duration; confirm `muted_until` persists.
- [ ] **Read receipts** — Scroll to bottom of conversation; `update_last_read` fires; unread dot clears on list refresh.
- [ ] **Image attach** — Tap image icon in composer; select a photo; uploads to R2; appears in bubble.
- [ ] **Profile → Message** — Tap Message on a profile; confirm chat tab opens and DM conversation is active.
- [ ] **Dock panel** — Dock chat panel shows list-only; tapping a room navigates to the full Chat tab.
- [ ] **Deep link** — Navigate to `?tab=chat&room=<uuid>`; confirm conversation opens.
- [ ] **Quick link** — Toggle Chat quick link on/off; verify it appears in the title bar shortcut strip.
- [ ] **Anon gate** — Open chat while not signed in; confirm sign-in prompt renders.
- [ ] **Group header** — Open a group with no custom photo: three overlapping member avatars + title pill; tap pill → settings sheet.
- [ ] **Group photo** — Owner uploads group avatar in settings; header switches to single large photo.
- [ ] **Group settings** — Owner: rename, description, add/remove member, mute member (5m–permanent). Member: leave, mute group (presets + mute-until datetime), add member, starred list.
- [ ] **Star message** — Long-press a group message → Star; appears under Starred messages in settings.

### Production replay
- Replay migration `20260601120000_chat_phase2.sql` on production Supabase.
- Redeploy `lounge-chat` Edge on production.
- See `docs/production-rollout-checklist.md` §2 + §4.

---

## Planned (Lounge media — not started)

- [ ] **Multiple Stream clips per post (v1 cap: 2):** Move from a single **`stream_video_uid`** to an **ordered list** of Stream asset ids (max **two** for the first ship; can raise toward **4** later). Work: Supabase migration + backfill; `AppShell` / feed selects; **`loungeVideoUpload.js`** + composer + quote submit/cancel/draft; **`LoungePostFeedMedia.jsx`** / **`LoungePostStreamVideo.jsx`** (two tiles or horizontal strip); post delete / staff delete — call **`lounge-cf-stream-delete-video`** (or batch) **per** uid; orphan/purge alignment; **`LoungeFeedVideoAutoplayContext.jsx`** — **explicit rule** when one post row has two clips (e.g. only first clip eligible as inline winner, or neither). **Rough target:** ~1–2 weeks to test-ready slice once picked up.

---

## Lounge feed — tribes & filters

- [x] **Post category pills (v1, test build):** Optional **0–3** audience pills at compose / quote / edit; display on feed + detail; plain repost copies OP pills; quote inherits OP then editable. Migration **`20260525120000_community_feed_posts_category_pills.sql`**. Client: **`loungePostCategoryPills.js`**, **`LoungePostCategoryPillPicker.jsx`**, **`LoungePostCategoryPillRow.jsx`**, **`SocialFeed.jsx`**, **`LoungePostArticle.jsx`**. Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).

- [x] **Tribe filter — home feed + search (v1.1, test build):** Home **Tribes** dropdown beside **Latest** — **all on by default**; **tap to dim** hides posts whose **every** pill is excluded (posts with mixed pills stay visible if at least one pill is still on). Search: client **Tribes** typeahead → chip-in-field + text AND (`**lounge_search**` `p_category_slugs`; comments hidden when tribe filter on). Migrations **`20260525140000_*`** (search) + **`20260525150000_lounge_feed_category_exclusion_filter.sql`** (feed **`p_excluded_category_slugs`**); exclusion fix **`20260525200000_lounge_feed_category_exclusion_any_pill.sql`**. Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).

- [x] **Profile interest tribes (client + SQL, test build):** **`profiles.category_pills text[]`** (same enum as posts; **no max on profile** — interests display only). **Edit profile:** multi-select picker in **`LoungeProfileFullScreen.jsx`**; **view:** pill row on profile. **Scope:** profile column + UI only — **no changes** to post pills, compose/quote/edit, last-post **`loungeComposerLastCategoryPills:v1`**, feed Tribes filter, or search. SQL **`20260525160000_profiles_category_pills.sql`** / **`supabase/profile_category_pills.sql`**. Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).

- [x] **Following filter on Lounge home:** **All** / **Following** segmented control (`LoungeFeedScopeSwitch.jsx`); **`profile_follows`**-scoped feed queries in **`AppShell.jsx`** via **`loungeFeedScope.js`**; session-persisted scope; empty states. **Test on test** before prod sign-off.

---

## Play Logbook (shipped on `test` — Ryan smoke pending)

**Product intent (Ryan, 2026-05-29):** AP slot players — especially on **newer titles** — need a **Play Logbook** to capture floor data during scouting/plays and **analyze** it later for exploitation (hit distributions, bonus frequency, counter behavior, etc.). Distinct from **Bankroll Tracker** (session P&L only) and from **Local Intel** (public field reports).

**Surface:** new **Slots hub** tile (**Logbook** or **Play Log**) under `src/features/slots/SlotsScreen.jsx`; lazy-loaded feature module (e.g. `src/features/play-logbook/`). Subscribe gate TBD — align with **Bankroll** / **Slots Edge** in `docs/access-tiers.md` when implementing.

### Capture (log entry)

- **Game picker:** dropdown of **known AP slot games** (seed from `machines` catalog + calculator slugs where applicable: Phoenix Link, Buffalo Link, Stack Up Pays, MHB, …).
- **Per-game metric schema:** each template defines which fields appear on the entry form. Examples Ryan specified:
  - **Phoenix Link / Buffalo Link** (MHB-style counter games): `counter`, `bet_size`, `denom`, `spin_count`, `bonus_count`, `money_in`, `money_out`, `counter_at_hit`.
  - **Stack Up Pays** (multi-meter): `bet_size`, `denom`, `mega`, `grand`, `major`, `minor`, `mini`, `spin_count`, `money_in`, `money_out`, `target_bonus_paid`.
- **Metric registry:** one canonical list of **quantifiable capture fields** (shared subset across games). Templates pick a subset; types include integer counter, money, denom, spin count, etc.
- **Custom games:** **Create new** → user names the game → multi-select from the **full metric registry** → saves a **user-owned template** (reusable for future entries).
- **Entry row:** one logbook row = one captured play/sample (optionally: casino, date/time, free-text notes — TBD at implementation).

### Analysis (read path)

- Filter/slice logged entries **by game template** (and date range, casino — TBD).
- **Derived metrics** computed from captured fields, e.g.:
  - average **money out per entry** (or per winning entry)
  - average **bonuses per 100 spins**
  - average **counter increment per spin** (where counter + spin_count present)
  - hit-band stats when `counter_at_hit` logged (distribution, avg hit counter vs cap — ties to MHB calcs)
  - Stack Up: frequency / payout stats per meter tier when meter fields + `target_bonus_paid` present
- Start with **obvious aggregates** in v1; charting optional follow-on (reuse `chart.js` patterns from Bankroll tabs).

### Implementation sketch (when picked up)

- **SQL (test first):** e.g. `play_log_metric_defs` (slug, label, value_type), `play_log_game_templates` (builtin flag, `user_id` nullable for system templates, `machine_slug` optional FK, `metric_slugs text[]`), `play_log_entries` (`user_id`, `template_id`, `captured_at`, `casino_name` optional, `values jsonb` keyed by metric slug). RLS: users CRUD own templates (custom) + own entries; public read on builtin template defs only.
- **Seed:** map known games → metric sets (Phoenix, Buffalo, Stack Up, generic MHB preset).
- **Client:** Logbook home (recent entries + **+ Log play**), game picker, dynamic form from template, history list, **Analysis** tab/screen with game filter + computed stats.
- **Cross-links (later):** pre-fill from open calculator session; **casino/location** on log capture = active bankroll session’s casino if set, else GPS nearest (same as Bankroll start session — `resolveDefaultCaptureCasino` in `nearbyCasinos.js`); export CSV.

### Status

- [x] **Phase 0 — spec + schema:** `supabase/play_logbook.sql` + migration **`20260529120000_play_logbook.sql`** — metric registry, system templates (Phoenix Link, Buffalo Link, Stack Up Pays, MHB generic), RLS. **Apply on test before UI works.**
- [x] **Phase 1 — capture UI:** `src/features/play-logbook/PlayLogbook.jsx` — Slots hub **Logbook** tile, game picker, dynamic form, custom template builder, entry list.
- [x] **Phase 2 — analysis UI:** ANALYZE tab — per-game derived stats (`playLogAnalysis.js`).
- [x] **Phase 3 — polish:** calculator **Log play in Logbook** pre-fill (`playLogPrefill.js`, `CalculatorLogPlayButton` on Phoenix/Buffalo/Stack Up/MHB); capture **casino/location** via active bankroll session casino or GPS nearest (`resolveDefaultCaptureCasino`); **Export CSV** on ANALYZE tab. Ryan smoke pending.

**Built on `test` (2026-05-29)** — Ryan smoke pending. Apply SQL on test Supabase first.

### Shared plays / partners (shipped — smoke pending)

**Product intent:** Creator logs one play with **partners** (registered users + optional **guest** name). Each registered partner gets the same play in **their** LOG tab; guests are attribution-only (no account, no row).

**Decisions (Ryan, 2026-05-29):**

| Topic | Decision |
| --- | --- |
| **Percent semantics** | **Attribution only** — full session `values` on every partner row; `share_percent` is metadata (UI / future P&L attribution). Do **not** scale `money_in` / `money_out` in ANALYZE aggregates for v1. |
| **Who can be picked** | Any user in creator’s **followers ∪ following** (`profile_follows`), plus **manual guest** label (non-user). |
| **Add to partner log** | **Auto-add** on save (no invite/accept in v1). |
| **Notifications** | **Lounge Alerts** — new `activity_events.event_type` (e.g. `play_log_shared`) + existing in-app panel + push pipeline (`lounge-send-activity-push`). Tap opens Logbook entry (deep link TBD). Not a separate play-log-only inbox. |
| **Edit** | **Creator only** updates canonical session (RPC syncs mirrored fields on all partner `play_log_entries`). |
| **Delete** | **Owner** (`created_by_user_id`) deletes the session via `play_log_delete_shared_session` — cascades all partners’ `play_log_entries`. **Partner** may delete **only their own** row (gone from their LOG tab only; session and other partners unchanged). |

**Data model (sketch):**

- `play_log_sessions` — canonical play (`created_by_user_id`, `template_id`, `captured_at`, `casino_name`, `notes`, `values`).
- `play_log_session_partners` — `participant_kind` (`user` \| `guest`), `user_id` / `guest_label`, `share_percent`; percents **sum to 100**.
- `play_log_entries.session_id` — one row per **registered** partner (`user_id`); unique `(session_id, user_id)`.
- **RPC** `play_log_save_shared_session` (security definer): validate metrics, follow graph, percents; insert session + partners; fan-out entries; `activity_events_insert_safe` per partner (not creator, not guests).

**Client (sketch):** Log Play sheet — partner rows (you + %), add from Following/Followers picker (`loungeProfileFollowList.js` data), add guest + %; save → RPC only (RLS cannot insert for other users).

**Smoke (when built):** User A follows B; A saves play with B at 40%; B sees entry in Logbook + unread Lounge Alert; A edits → B’s row updates; B deletes own row → gone from B’s LOG only, A (and any other partner) still shows B on session; guest name visible on A’s detail only.

- [x] **Phase 4 — shared plays (code on branch; apply SQL on test):** migration **`20260531140000_play_log_shared_sessions.sql`** — sessions/partners, RPC fan-out, Lounge `play_log_shared` + Alerts/deep link (`/?tab=logbook&playLogEntry=`). Redeploy **`lounge-send-activity-push`** after SQL. Ryan smoke pending.

- [x] **Label polish (metric defs + client `metricDefMap`):** migrations **`20260531330000`** (Counter Pop), **`20260531340000`** (Cash In / Cash Out), **`20260531360000`** (Counter Start); optional spin/bonus/EV labels **`20260531510000`**–**`20260531530000`**. Client normalizes legacy labels on read.

- [x] **Manager default + owner rules:** migration **`20260531210000_play_log_manager_owner_default.sql`** — creator default manager; owner-only session delete; partner row delete unchanged.

---

## AP Guide editor (`/slot-guide-form`)

**Surface:** separate Vite entry **`src/slot-guide-form/`** (`SlotGuideFormApp.jsx`, `LoginGate.jsx` admin session). Deployed at **`/slot-guide-form`** on app host (e.g. **`lvslotpro-calc-tx18.vercel.app`**). Not in main `AppShell` hamburger.

| Mode | Action |
| --- | --- |
| **New guide** | **Ingest guide** → `POST /api/slot-guide-ingest` (target **test** / **production**); optional hero + sparse body sections OK |
| **WIP (same browser)** | **Save draft** → `localStorage` **`slotGuideFormDraft:v1`** (text only; re-attach hero/diagram files after restore) |
| **Existing guide** | **Fetch guides** → **Load →** → **Save changes** (direct Supabase update, not ingest) |

**Auth (ingest API):** `Authorization: Bearer <supabase-session>`; caller **`profiles.role = admin`** (test project hardcoded in **`api/slot-guide-ingest.js`** for JWT validation). **Not** `x-guide-ingest-secret` on Vercel path.

**Vercel ingest env (required on preview/prod that serves `/api/slot-guide-ingest`):** **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** for test target (no repo **`.env.supabase.test`** on server — **`scripts/lib/supabaseEnv.mjs`** falls back to `process.env` @ **`24d0412`**). Production target: **`SUPABASE_URL_PRODUCTION`** + **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`** optional.

### Status

- [x] **Draft save + restore:** manual **Save draft** + auto-save (~2s); **Restore draft** banner; bottom **Save draft** beside **Ingest** @ **`d4d6c09`**
- [x] **Optional fields (new ingest):** hero, skins, risk bullets, guide body sections, +EV threshold (client + **`slotGuideIngestCore.mjs`** @ **`25d81f1`**)
- [x] **Slug typing:** **`slugifyInput`** allows trailing hyphen while typing (`buffalo-link`) @ **`25d81f1`**
- [x] **Vercel env fallback:** ingest no longer requires **`.env.supabase.test`** file on server @ **`24d0412`**
- [ ] **Ryan smoke — ingest on tx18:** Vercel env vars set + deploy **`test`** ≥ **`24d0412`**; ingest Buffalo Link (or other) → **Fetch guides** → **Load** → edit → **Save changes**
- [x] **AP Guides light-mode search:** **`ap-guides-search-input`** + **`html.light`** rules in **`index.css`** (readable on light gray) @ **`ea1d72e`**

---

## Shipped (Quick links — title bar shortcuts — v1, 2026-05-29)

**Product intent (Ryan, 2026-05-29):** Members want **one-tap** access to tools they use constantly (e.g. Bankroll) without hamburger → Slots hub → tile every time.

### Decisions (Ryan)

| Topic | Decision |
| --- | --- |
| **Default** | **Empty** until the user turns on quick links themselves (no pre-fill for subscribers). |
| **Calcs shortcut** | Opens **Calculators tab home** (picker) — **not** a specific game or last-opened calc. |
| **Anonymous** | Non-issue — anon is Lounge read-only; quick links only on member tool surfaces. |
| **Configuration UX** | **Per-screen toggle** on the tool page itself (not Profile / hamburger settings). Unobtrusive **“Quick link”** switch at the **top** of each eligible screen. ON → adds that destination to the title bar. |
| **Max slots** | **2** quick links globally. Attempting a **3rd** → modal: explains limit, lists the **two active** links with their switches so user can turn one (or both) off, then enable the new one. |
| **Title bar placement** | Up to **2 icon buttons** in the fixed title bar row, **left of hamburger** (same cluster as `titleBarNavSlot` in `ScrollLinkedEdgeTitleBarShell` / Lounge feed bar). On **Lounge dock panels** (search, notifications, settings, chat), the hamburger cluster **slides left** to make room for the panel **×** close button — logo max-width reserves extra space via `titleBarLayout.js` (`panelCloseVisible`). |

### Eligible destinations (v1 allowlist)

Each maps to an `AppShell` tab (and subscribe/auth gates unchanged):

- **Calculators** (`calculators` — home only, `activeCalculator` null)
- **Calendar** (`offers`)
- **Bankroll** (`bankroll` — Slots Edge)
- **Logbook** (`logbook` — Slots Edge)
- **AP Guides** (`guides`)

**Not quick-linkable:** Lounge home, Team, Slots hub, individual calculator games, **Local Intel** (hidden from Slots hub; Lounge covers field intel for now).

Ryan (2026-05-29): **Only** Calcs, Calendar, Bankroll, Logbook, AP Guides — no Intel.

### Implementation sketch (when picked up)

- **Registry:** `src/features/shell/quickLinkDestinations.js` — id, label, icon, `tab`, optional `requiresSlotsEdge` / calc gate flags.
- **Persist:** `localStorage` key e.g. `lvsp:quickLinks:v1` → `string[]` of ≤2 destination ids (profile column optional later).
- **Shell:** `AppShell.jsx` — read store, render icons in `renderTitleBarNavSlot()`; tap → same navigation + subscribe/auth as hub tiles.
- **Shared UI:** `QuickLinkPageToggle.jsx` — small switch row for top of each eligible screen; coordinates with store + **at-cap modal** (`QuickLinkAtCapModal.jsx`).
- **Light/dark:** reuse title bar / zinc patterns; scope any light overrides under `data-quick-link-*` if needed (same discipline as bankroll/logbook).
- **Do not** add switches on **individual game calculator** roots — only **CalculatorsTab** home.

### Status

- [x] Registry + localStorage store (`quickLinkDestinations.js`, `quickLinksStore.js`)
- [x] Title bar icon buttons (`TitleBarQuickLinks.jsx` in `AppShell` `renderTitleBarNavSlot`; Lounge feed + dock panels via `titleBarNavSlot` + dynamic logo width)
- [x] Per-page “Quick link” toggle + at-cap modal (`QuickLinkPageToggle.jsx`, `QuickLinkAtCapModal.jsx`)
- [x] Wire toggles on: CalculatorsTab (home only), BankrollTracker, PlayLogbook, OffersCalendar, GuidesScreen
- [x] Light-mode scoped overrides (`data-quick-link-*` in `index.css`)

**Shipped v1.** Optional later: persist to profile column instead of `localStorage` only.

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
- [x] **Staff pin/unpin (and broader Lounge moderation UI):** **Admin → profile ⋯ → Promote to moderator / Remove moderator role** shipped on **test** (requires **`admin_set_profile_role.sql`** on Supabase). Pin/unpin in `LoungePostRowMenu.jsx` (staff ⋯ menu on post detail); staff delete also in post detail. No dedicated mod queue — not currently planned. **Database is ready:** `profiles.role in ('moderator','admin')` may `UPDATE` any feed row (`community_feed_posts_update_moderator` in `supabase/feed_phase_a_profiles_public_read.sql`), and `community_feed_posts_author_guard` lets staff change `pinned` / hide fields without hitting the author-only restriction.
- [x] Logged-out Lounge: composer hidden; like/comment/repost/bookmark are read-only (server counts only, no local mutation UI). **Lounge search** (dock) requires sign-in — **Phase G** server RPCs (`lounge_search_posts` / `lounge_search_profiles` / `lounge_search_comments`); anon tap → create-account modal. Guides search remains on Guides tab.

### Phases C-L

- [ ] Phases **D–L** not complete end-to-end; **E/F first slice**, **Phase G search stack**, and **Phase E Relevant comment ranking** validated on **test** (Ryan smoke **§16** / **§19** **PASSED** 2026-05-21 @ **`f40ff0e`**). **Phase J Popular feed** — smoke **§20** **PASSED** (Ryan, 2026-05-24 @ **`51b1621`**). **Phase H1 in-app notifications** — smoke **§21** **PASSED** (Ryan, 2026-05-24 @ **`51b1621`**). **Freemium**, etc. still roadmap scope.
- [x] **Phase H1 notifications (test build):** **`activity_events`** + emit triggers + dock **`LoungeNotificationsPanel`** + bell unread badge — migration **`20260522120000_lounge_activity_events_phase_h1.sql`**. Ryan sign-off **PASSED** on **test** (smoke **§21**, 2026-05-24 @ **`51b1621`**).
- [x] **Phase H2 Lounge web push (test build):** Settings push toggle + Edge **`lounge-send-activity-push`** + migration **`20260523160000_lounge_activity_events_push.sql`**. Deploy function, set **`LOUNGE_ACTIVITY_PUSH_SECRET`** + Vault secrets (see function **`README.md`**); smoke **§21b** **PASSED** (Ryan, test). **Push tap badge clear:** **`20260523180000_lounge_activity_mark_push_opened.sql`** + Edge redeploy — smoke **§21b** badge step **PASSED** (Ryan, test @ **`25adae1`**).
- [x] **Phase H3 push batching + prefs (test build):** migration **`20260523170000_lounge_activity_push_h3.sql`** + redeploy Edge — like/bookmark **10s grouped push**, Settings category toggles (`notification_preferences`); Ryan sign-off **PASSED** on **test** (smoke **§21c**, 2026-05-24 @ **`51b1621`**).
- [x] **Phase J Popular feed (test build):** **`lounge_feed_posts_page`** + **`lounge_feed_popular_score()`** — home feed **Latest | Popular** (`LoungeFeedSortSwitch`, `AppShell` RPC load). Migration **`20260521120000_lounge_feed_popular_sort.sql`**. Ryan sign-off **PASSED** on **test** (smoke **§20**, 2026-05-24 @ **`51b1621`**). Block/mute still open.
- [x] **Phase C (profiles + identity, test):** profile gate (Lounge + Guides); full-screen profile editor; 7-day handle change (DB + modals); **`/u/:handle`** permalink + OG + deep link; **handle conflict** dialog (taken/reserved + suggested `@handle_1`). Ryan sign-off **PASSED** on **test** @ **`7ce7b44`** (2026-05-18). *Deferred (not blocking):* dedicated server-side reserved-handle SQL beyond client `RESERVED_HANDLES` + unique index; standalone marketing profile page beyond in-app sheet.
- [x] **Phase G (search, test):** Auth-gated **`lounge_search()`** stack — posts, profiles, comments, highlight/recent/about, Top/Latest, rate limit, bundled pagination, hardening, **`@handle` keyword**, relevance ranking, volatile helpers. Migrations **`20260518160000`** through **`20260520190000`**. Client: **`loungeSearchApi.js`**, **`LoungeDockSlidePanels.jsx`**. Ryan sign-off **PASSED** on **test** (smoke **§16**, 2026-05-21).
- [ ] **Freemium / subscriptions:** multi-product entitlements (**`slots-edge`**, **`sports-edge`**, **`crypto-edge`**) — migration **`20260526120000_edge_subscriptions.sql`**, Stripe Edge functions (**`stripe-create-checkout-session`**, **`stripe-webhook`**, **`stripe-create-portal-session`**), **`get_my_entitlements()`**, Subscribe modal + hamburger/OCR gates shipped on **test** branch; **apply migration + deploy Edge + Stripe secrets** before smoke; RLS hardening + per-calc/guide locks still open. Spec: **`docs/access-tiers.md`**; setup: **`supabase/functions/stripe-create-checkout-session/README.md`**.

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

- [x] Lounge activity notifications Phase H1 on test  
  - Change: **`activity_events`** outbox + safe AFTER INSERT triggers (comment on post, reply, @mention in post/comment, follow); read RPCs **`lounge_activity_events_page`**, **`lounge_activity_unread_count`**, **`lounge_activity_mark_all_read`**. Client: **`LoungeNotificationsPanel.jsx`**, dock bell unread badge.
  - Source: `supabase/lounge_activity_events_phase_h.sql`, migration **`20260522120000_lounge_activity_events_phase_h1.sql`**
  - Test validation: Smoke **§21** **PASSED** on **test** (Ryan, 2026-05-24 @ **`51b1621`**).
  - Production replay: `production-rollout-checklist.md` §2

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
- [ ] **`lounge-send-activity-push`** (Lounge **`activity_events`** → web push via **`push_subscriptions`**) — deploy on **test** with **`LOUNGE_ACTIVITY_PUSH_SECRET`** + Vault secrets; migration **`20260523160000_lounge_activity_events_push.sql`**; smoke **§21b** pending.
  - Source: `supabase/functions/lounge-send-activity-push/README.md`
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

- [x] **Repost cleanup when original post deleted (test build):** migrations **`20260524100000`** + **`20260524110000`** + **`20260524120000`** (v2 denorm guard — nested repost delete + `post_likes` CASCADE). Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).

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
  - Test validation: feed scroll — neighbors feel ready when scrolled in; tap playing tile → smooth hero grow (minimal poster flash); swipe down on full-screen video dismisses; load-more fetches 40 rows. Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).
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
    16. **Play Logbook + AP Guide editor (when promoting Play Log / guide tooling):**
        - [ ] **SQL on test:** play-log migrations through **`20260531540000`** applied; **`lounge-send-activity-push`** redeployed after shared-play / paid-notify migrations.
        - [ ] **Logbook:** Slots hub → **Logbook** → log play (Phoenix/Buffalo/Stack Up/MHB); optional shared play + partner alert; ANALYZE export CSV; admin **Primary game templates** if applicable.
        - [ ] **Guide form:** **`/slot-guide-form`** — admin login; **Save draft** restores on return; **Ingest** with Vercel **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** on preview host; **Fetch guides → Load → Save changes**.
    17. **Video submit queue + parallel prep** (after **`57eaca2`** on test):
        - [x] **Back-to-back videos:** post video 1, immediately post video 2 → bar **Post 1 of 2** / **Post 2 of 2**; both appear in feed with playable video + poster. *(Ryan, 2026-05-18, **PASSED**.)*
        - [x] **Fast lane:** while video 1 uploading, post text-only, image-only, and GIF-only — each lands **without** waiting for the video queue to drain. *(2026-05-18 **PASSED**.)*
        - [x] **Parallel prep:** DevTools **Network** while **Post 1 of 2** active — **two** **`lounge-cf-stream-tus-create`** (201) and **two** tus upload ids (`?tusv2=true`) before job 2's bar turn; red **`video.m3u8`** poll noise OK if posts succeed. *(2026-05-18 **PASSED**.)*
        - [x] **Profile Likes hydration:** Likes tab → open liked post → like toggle does not **`post_likes_pk`** duplicate error. *(2026-05-18 **PASSED**.)*
    16. **Lounge search (Phase G):** migrations **`20260518160000`** through **`20260520190000`** on test — **logged out:** dock **Search** or **#hashtag** tap → create-account modal (no panel). **Logged in:** search **2+ chars** finds posts **not** in loaded feed (caption / game / hashtag) and matching **comment bodies** in one mixed feed; **Profiles** when handle/display/about match — **highlight**, **Recent** chips, **Top / Latest**, **`@handle` keyword**, relevance ordering; tap comment/post → detail over search; **←** back preserves query. *(Ryan, 2026-05-21, **PASSED** on test — full **§16** stack.)*
    17. **Lounge media lightbox (unified chrome + pinch):** feed image → full-screen lightbox — pinch zoom + pan; swipe down at 1× dismisses. Stream video → hero expand — author row / caption layout OK in portrait; interaction bar (like/repost/bookmark) works; repost submenu above controls. Repeat from post detail and profile Posts tab. *(Ryan, 2026-05-19, **PASSED** on test.)*
    18. **Direct comment entry + profile unfollow sync** (after **`59a26bd`** + **`dd02294`** on test): **Profile Replies** or **comment-repost** card → post detail opens, sheet lands, **smooth scroll** to focused comment (title bar stays put); in-feed comment drill still **instant**. **Unfollow** from profile or follow list → close sheet → feed **Follow** pill returns; **Following** filter drops them without refresh. *(Ryan, 2026-05-19, **PASSED** on test.)*
    19. **Comment sort — Relevant (Phase E):** open a busy post detail → default **Relevant** puts freshly posted comment at top (viewer pin); older low-engagement roots sink below higher-engagement / recent activity; switch **Popular** / **Most liked** / **Oldest first** and back — order changes predictably; **like/unlike** does not jump row order or stick liked after unlike. Drill into a thread → sibling replies read **oldest-first** in Relevant mode. *(Ryan, 2026-05-21, **PASSED** on test @ **`f40ff0e`**.)*
    20. **Home feed Popular (Phase J):** apply migration **`20260521120000_lounge_feed_popular_sort.sql`** on test — **Latest | Popular** toggle above feed; **Popular** floats engaged recent posts (not pure recency); **Latest** unchanged; **Following** filter works in both modes; load-more does not duplicate rows. *(Ryan, 2026-05-24, **PASSED** on test @ **`51b1621`**.)*
    21. **Lounge notifications (Phase H1):** apply migrations **`20260522120000_lounge_activity_events_phase_h1.sql`** through **`20260523150000_lounge_activity_events_like.sql`** on test — comment, reply, @mention, follow, repost, quote repost, bookmark, **like** on post/comment → bell badge + Alerts row + avatar action badge; tap → post detail / profile / repost card as appropriate. *(Ryan, 2026-05-24, **PASSED** on test @ **`51b1621`**.)*
    21b. **Lounge web push (Phase H2):** apply **`20260523160000_lounge_activity_events_push.sql`**, **`20260523180000_lounge_activity_mark_push_opened.sql`**, deploy **`lounge-send-activity-push`**, set Edge + Vault secrets — Settings → Push notifications ON (browser allow) → second account triggers like/comment/follow → OS notification; tap opens post/profile/notifications and **FAB/Alerts badge clears immediately**. Toggle OFF unsubscribes device. *(Ryan **PASSED** on test @ **`25adae1`**.)*
    21c. **Lounge push batching + prefs (Phase H3):** apply **`20260523170000_lounge_activity_push_h3.sql`**, redeploy Edge — rapid likes on same post → **one** grouped push after ~10s; Settings category toggles (mute likes, keep replies); replies/mentions still immediate. *(Ryan, 2026-05-24, **PASSED** on test @ **`51b1621`**.)*
    21d. **Lounge foreground in-app toast + per-tap mark read:** hard-refresh / update **`push-sw.js`** on device — with app tab **focused**, second account triggers like/comment → **in-app banner** (no OS notification); FAB badge bumps immediately; tap banner opens post/profile. Minimize app or switch away → OS push still fires. Offers push unchanged. Tap push or in-app toast → target opens and **only that notification** marks read (badge −1). Alerts row tap → same. *(Ryan **PASSED** on test @ **`dcc3852`**.)*
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - **Sign-off (Lounge tribes + feed + notifications batch, 2026-05-24, Ryan):** Post category pills, tribe filter (home + search), profile interest tribes, Popular feed (**§20**), in-app notifications (**§21**), push batching + prefs (**§21c**), repost cleanup on delete, Stream hero/scroll polish — all **PASSED** on **test** @ **`51b1621`**.
  - **Sign-off (Lounge in-app toast + per-tap mark read, 2026-05-23, Ryan):** Smoke **§21d** **PASSED** on **test** @ **`dcc3852`** — foreground banner vs OS push; push/in-app tap marks single notification read; badge decrements correctly.
  - **Sign-off (Phase E Relevant comment ranking + post-detail comment UX, 2026-05-21, Ryan):** Smoke **§19** **PASSED** on **test** @ **`f40ff0e`** — score + decay **Relevant** sort; stable list order on like/unlike; comment unlike glyph hydration fix.
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

- 2026-06-05: **Group delete lifecycle:** migration **`20260605120000_chat_group_delete.sql`** — `AFTER DELETE` trigger removes empty **`kind = 'group'`** rooms (leave, owner remove member, last person out); RPC **`chat_delete_group`** (creator or **`role = admin`**) deletes room for everyone. Client: **`ChatGroupSettingsSheet`** → **Delete Group for Everyone** (owner/admin) + **Leave Group**. Commit **`10f9a0e`**. **Apply migration on test before smoke.**
- 2026-06-05: **Lounge layout-test removed:** deleted **`loungeLayoutTestPost.js`**; Chat tab **Layout test** button + **`AppShell`** / **`SocialFeed`** fake DM post-detail harness removed (keyboard debug only).
- 2026-06-05: **Lounge caption bare-domain links:** **`loungeCaption.jsx`** uses **`splitTextWithLinks`** (`linkifyText.jsx`) so `x.com`-style URLs match chat link colors in feed/detail captions.
- 2026-06-04: **Link preview polish (code on `test`):** commit **`3addcf3`** — brand-colored preview pills (`accent_color`, domain map, favicon sample; no canvas on Google favicon URLs); unified chat bubble (text + card); Lounge post detail **`link_preview`**; await attach on post/comment submit. Redeploy **`lounge-link-unfurl`** on test for server-side **`accent_color`**.
- 2026-06-04: **Link preview cards v1 (code on `test`):** commit **`8ac92a1`** — migrations **`20260604180000`**, **`20260604180100`**; Edge **`lounge-link-unfurl`**; **`ChatLinkPreviewCard`**, **`LoungeLinkPreviewBlock`**. **Apply migrations + deploy Edge on test before smoke.**

- 2026-06-03: **Group chat header + settings v1 (code on `test`):** migration **`20260603100000_chat_group_features.sql`** (`avatar_url`, `description`, `moderation_muted_until`, `chat_message_stars`, `chat_pinned_messages`, RPCs `chat_group_header_members`, `chat_group_members_list`, `chat_starred_*`, extended `chat_rooms_for_user`). Edge **`lounge-chat`**: `update_group`, `add_group_members`, `remove_group_member`, `mute_group_member`, `star_message`, `mute_room_until`, etc. Client: overlapping member avatars or single group photo; pill → **`ChatGroupSettingsSheet`**; long-press **Star** on group messages. **Apply migration + redeploy Edge on test before smoke.**
- 2026-06-03: **Group settings members list:** fixed client bug where **`chat_starred_messages_page`** failure in **`Promise.all`** left members empty with a misleading “apply migrations” message; settings now loads members independently and shows the real RPC error.
- 2026-06-03: **Group member RPC repair:** if UI shows **`Could not find the function public.chat_group_members_list`**, run **`20260603150000_chat_group_member_rpcs_repair.sql`** on test (member + star RPCs; often `03100000` never applied or `03140000` failed without `moderation_muted_until` column).
- 2026-06-03: **Group photo schema fix:** if **`update_group`** errors on **`avatar_url` schema cache**, apply **`20260603100000`** and/or **`20260603120000_chat_rooms_group_avatar_columns.sql`** on test (adds `chat_rooms.avatar_url` / `description`, `NOTIFY pgrst` reload).
- 2026-06-03: **Group chat search / pins / shared media (code on `test`):** migration **`20260603110000_chat_group_search_pins_media.sql`** — RPCs `chat_search_messages`, `chat_pinned_messages_page`, `chat_pinned_message_ids`, `chat_room_shared_media`, `chat_room_shared_links` (links + docs), `chat_messages_window` (jump-to-message). Client: **`ChatGroupAuxSheets.jsx`** (search, pinned list, media/links/docs tabs); owner long-press **Pin/Unpin**; settings **More** rows + tap starred/pinned/search/media → jump with cyan highlight. **Apply both group migrations on test before smoke.**

- 2026-05-26: **Per-guide Slots Edge toggles + admin lock switches:** **`guideAccess.js`** (`FREE_GUIDE_SLUGS` default **`phoenix-link`**, **`stack-up-pays`**); AP Guides tab partially open like Calcs; lock icons + subscribe on expand. **`content_access_gates`** table + admin-only lock switches on calculator/guide rows (migration **`20260526150000_content_access_gates.sql`**). **`calculatorAccess.js`** honors DB overrides. **`docs/access-tiers.md`** updated.

- 2026-05-26: **Per-calculator Slots Edge toggles:** **`src/features/calculators/calculatorAccess.js`** — **`FREE_CALCULATOR_KEYS`** (default **`stackup`**, **`phoenix`** free; **`buffalo`**, **`mhb`** locked). Calcs tab open for free users; lock icons on gated rows; **`openCalculator`** / Guides **Open calculator** respect same list. **`docs/access-tiers.md`** updated.

- 2026-05-24: **Multi-product Edge billing (scaffold):** migration **`20260526120000_edge_subscriptions.sql`** (`slots-edge` / `sports-edge` / `crypto-edge`), Stripe Edge **`stripe-create-checkout-session`**, **`stripe-webhook`**, **`stripe-create-portal-session`**, client Subscribe modal + **`get_my_entitlements()`**; OCR gated on **`slots-edge`**; Lounge + calendar + alerts remain free. **Apply migration + deploy Edge + Stripe test secrets** before checkout smoke — see **`supabase/functions/stripe-create-checkout-session/README.md`**.

- 2026-05-24: **Tribe feed exclusion (any-pill rule):** migration **`20260525200000_lounge_feed_category_exclusion_any_pill.sql`** + **`loungeFeedScope.js`** pinned query — hide post only when **all** `category_pills` are excluded; mixed-pill posts stay visible if at least one pill is still on. Apply on test Supabase.

- 2026-05-24: **Ryan sign-off (test batch @ `51b1621`):** Post category pills (v1), tribe filter (home + search), profile interest tribes, Popular feed (Phase J / smoke **§20**), in-app notifications (Phase H1 / smoke **§21**), push batching + prefs (Phase H3 / smoke **§21c**), repost cleanup on delete (migrations **`24100000`**–**`24120000`**), Stream hero expand + feed scroll polish — all **PASSED** on **test**.

- 2026-05-24: **Comment/reply edit UI removed (test):** Lounge post-detail ⋯ and Stream lightbox no longer expose **Edit** on comments/replies — **Delete** only. **`feed_comments_update_own`** SQL unchanged; edit pipeline left in **`SocialFeed.jsx`** but unreachable from UI. **`docs/frontend-architecture.md`** updated.

- 2026-05-24: **Post delete denorm guard v2 (SQL):** migration **`20260524120000_community_feed_posts_delete_denorm_guard_v2.sql`** — fix tuple-modified error when deleting posts with plain reposts, quote reposts, comments, and likes (nested delete flag + `post_likes` skip). Apply after **`24110000`** on test.

- 2026-05-23: **Lounge in-app toast + per-tap mark read (Ryan sign-off, test):** foreground banner, push/in-app tap marks single event read, badge −1 — smoke **§21d** **PASSED** @ **`dcc3852`**.

- 2026-05-23: **Lounge foreground in-app toast (client):** **`push-sw.js`** routes focused-tab Lounge activity pushes to **`AppShell`** banner (**`LoungeActivityInAppToast.jsx`**) instead of OS notification; **`lounge-activity-arrived`** refreshes FAB/Alerts badge. Per-tap mark read @ **`dcc3852`**.

- 2026-05-23: **Push tap clears notification badges (Ryan sign-off, test):** migration **`20260523180000`** + Edge redeploy — tap marks read; FAB/Alerts badge drops immediately. Smoke **§21b** **PASSED** @ **`25adae1`**.

- 2026-05-23: **Push tap clears notification badges:** migration **`20260523180000_lounge_activity_mark_push_opened.sql`** — RPC marks single event or batched push events read; Edge + **`push-sw.js`** pass **`activityEventId`** / **`activityBatchId`**; **`SocialFeed`** refreshes FAB/Alerts unread on tap (cold start via URL params + focused app via **`lounge-push-opened`**). Redeploy Edge + apply migration on test before smoke.

- 2026-05-22: **Lounge main composer contenteditable (test, Ryan):** **`LoungeRichComposerField`** + **`loungeRichComposerDom.js`** replace textarea+mirror on home composer — real **`@mention`** / **`#hashtag`** styling with aligned caret; mention autocomplete smoke **PASSED** @ **`f764ae8`**. Quote repost / post-detail edit / comment composers still textarea (extend next).

- 2026-05-23: **Phase H3 Lounge push batching + prefs:** migration **`20260523170000_lounge_activity_push_h3.sql`** — `notification_preferences`, `activity_push_batches` (10s debounce for like/bookmark), pg_cron flush; Settings category toggles; Edge batch payload. Smoke **§21c** **PASSED** (Ryan, 2026-05-24 @ **`51b1621`**).

- 2026-05-23: **Phase H2 Lounge web push (client + SQL + Edge):** Settings push toggle wired to **`useWebPushNotifications`** / **`push_subscriptions`**; Edge **`lounge-send-activity-push`** + migration **`20260523160000_lounge_activity_events_push.sql`**. Ryan smoke **§21b** **PASSED** on test.

- 2026-05-23: **Phase H1 repost notifications (SQL):** migration **`20260523120000_lounge_activity_events_repost.sql`** — `repost` / `quote_repost` event types + emit on `community_feed_posts` insert (plain post repost, quote repost, comment repost). Apply on test before repost smoke. Client avatar badges enlarged, no badge background ring.
- 2026-05-23: **Phase H1 like notifications (SQL):** migration **`20260523150000_lounge_activity_events_like.sql`** — `like` event type + AFTER INSERT on **`post_likes`** / **`feed_comment_likes`**. Client: avatar badges bottom-right, filled comment bubble, larger follow icon.

- 2026-05-21: **Phase J Popular home feed (client + SQL build):** **`lounge_feed_popular_score()`** + **`lounge_feed_posts_page`** RPC; **Latest | Popular** toggle (`LoungeFeedSortSwitch`, `loungeFeedSortPref.js`); frozen **`p_as_of`** pagination for Popular — migration **`20260521120000_lounge_feed_popular_sort.sql`**. Smoke **§20** **PASSED** (Ryan, 2026-05-24 @ **`51b1621`**).

- 2026-05-21: **Phase E Relevant comment ranking sign-off (test, Ryan):** Smoke **§19** **PASSED** @ **`f40ff0e`** — **`loungeFeedCommentSort.js`** score + decay; stable comment order on interaction toggles (**`e195415`**); post-detail comment unlike hydration fix (**`f40ff0e`**).

- 2026-05-21: **Phase E Relevant comment ranking (client build):** **`loungeFeedCommentSort.js`** — weighted engagement + gravity/time decay for post-detail **Relevant** roots; viewer just-posted pins stay first; modest OP-root and following boosts; nested drill-down replies **oldest-first** in Relevant mode.

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

- 2026-05-18: **Title bar build badge (test):** **`TitleBarStatusLine.jsx`** + **`loungeBuildBadgePref.js`** — git SHA when staff (admin/moderator) enables **Settings → Build SHA in title bar** (local dev always). Persists in `localStorage` `loungeBuildBadge:v1`. **Video debug HUD** toggle is staff-only too.

- 2026-05-19: **Per-tile inline sound (test):** removed feed-wide `feedInlineSoundUnmuted` from **`LoungeFeedVideoAutoplayContext.jsx`**; **`LoungePostStreamVideo.jsx`** Tap for sound unmutes **this clip only** (autoplay handoffs stay muted; sound resets when tile loses active). Removed **`LoungeFeedInlineSoundResetBinder`** from **`SocialFeed.jsx`**. Ryan sign-off **pending**. **`loungeFeedVideoAutoplayStore.js`** — `{prev, active, next}` ring (max 3 decoders), visibility handoff thresholds, flinger idle 200ms, **hero lock** (ring → hero tile only), coordinator suspend when post detail open. **`LoungePostStreamVideo.jsx`** + **`LoungeFeedVideoAutoplayContext.jsx`** — feed-wide Tap for sound + 60%/40% audio bands; hero-first resource budget on expand.

- 2026-05-18: **Plain repost interaction hydration (test, Ryan sign-off):** Feed/profile interaction refresh now includes **embedded original post IDs** for plain repost cards — fixes “You reposted” header with **inactive repost glyph** and duplicate plain-repost error. **`collectLoungePostInteractionHydrateIds`** in **`communityFeedPost.js`**; **`SocialFeed.jsx`** + **`LoungeProfileFullScreen.jsx`** (Likes/Bookmarks tab refresh).

- 2026-05-18: **Feed video perf diet (test):** **`loungeFeedVideoAutoplayStore.js`** — drop multi-tile HLS **staging** (was cap 24 paused decoders); **winner-only** attach + IO prefetch margin. **`LoungePostStreamVideo.jsx`** — **`pinInlinePosterBehindFlyout`** on hero tap (poster behind flyout, not above). **`AppShell.jsx`** **`COMMUNITY_FEED_PAGE_SIZE = 28`**. Backlog open row + smoke **§11** updated; Ryan sign-off **pending**.

- 2026-05-18: **Stream hero expand + prefetch staging + feed page 40 (test, `4cba1e5` → `7dbbec7`):** **`LoungePostStreamVideo.jsx`** — X-style hero FLIP (same `<video>`, GPU transform, tap snapshot, canvas frame shield, deferred scrim, swipe dismiss on flyout); **`loungeFeedVideoAutoplayStore.js`** — prefetch-band **staging** (winner plays, neighbors attach HLS paused, cap 24); **`AppShell.jsx`** **`COMMUNITY_FEED_PAGE_SIZE = 40`**. Continuity: **`AGENTS.md`**, **`docs/social-feed-roadmap.md`** (D2), **`docs/frontend-architecture.md`**, smoke **§11** / **§14**, this backlog (new checked row + video row refresh). Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).

- 2026-05-18: **Video submit queue + fast lane + parallel prep (test sign-off, Ryan):** **`SocialFeed.jsx`** — video-only **`loungeSubmitQueueRef`** drain (**Post X of Y**); text/image/GIF **`runFastLaneLoungeSubmit`**; waiting jobs parallel encode/upload via **`loungeQueuedVideoPrep.js`** while active job owns bar; queued poster pin + deferred composer prep; profile Likes interaction hydration + duplicate-like recovery. Commits **`7f93eb8`**, **`57eaca2`**. Smoke **§15** **PASSED**; backlog checked item + sign-off. Rate-limit SQL **`20260518103000_fix_rate_limit_profiles_user_id.sql`** — apply on test/prod Supabase if not already.

- 2026-05-16: **Profile Replies tab + dock upload overlap + Stream lightbox UX (restored on `test`, `24690aa`):** **`LoungeProfileFullScreen.jsx`** — Replies tab loads profile user's **`feed_comments`** (hidden filtered), hydrates parent posts, **`ProfileReplyRow`** with parent embed. **`SocialFeed.jsx`** — `onOpenProfileReply` → `openLoungePostDetail(post, { focusCommentId })` → `openLoungeCommentDetail` once comments load. **Upload bar vs FAB:** `loungeUploadBarRef` + `ResizeObserver` → **`bottomObstacleInsetPx`** on **`LoungeDockArcCarouselPrototype`**; **`loungeDockFabPosition.js`** `bottomObstaclePx` on move bounds / corner snap. **Stream lightbox:** **`loungeStreamLightboxRegistry.js`** + `useSyncExternalStore` in **`SocialFeed.jsx`** hide viewport dock while any Stream fullscreen is open; **`LoungePostStreamVideo.jsx`** opaque **`bg-black`** shell + footer (was `bg-black/75` + blur). Smoke **§6** / **§14** wording updated; Ryan sign-off pending on test deploy.

- 2026-05-16: **Lounge post detail — comment media:** `feed_comments` post-parity columns (`supabase/migrations/20260516140000_feed_comments_media.sql`); reply composer supports images/GIF/Stream (`loungeCommentSubmitJob.js`, `SocialFeed.jsx`); thread display via `LoungePostFeedImagesAndGif` — `commentInline` (~⅔ detail height) on main list, full `detail` on focused Reply drill-down; media-only replies allowed; edit/delete reuse post media rules + Stream orphan cleanup on delete.

- 2026-05-15: **Post detail — OP-only inline nest:** Main list still **root** comments first; replies authored by the **post owner** with `parent_id` pointing at a **root** render **below** that parent in **`LoungePostCommentThread.jsx`** (`postAuthorUserId` from **`SocialFeed.jsx`**): **same horizontal layout** as other comments; **vertical connector** at parent avatar column only. OP replies whose parent is not a visible root still appear as **extra root rows** (no silent drops). Comment drill-down (`variant="commentDetail"`) unchanged.
- 2026-05-15: **`feed_comments.body` max 280** (matches post captions): client **`LOUNGE_COMMENT_BODY_MAX`** in **`SocialFeed.jsx`**; **`supabase/feed_interactions_phase_ef.sql`** + migration **`supabase/migrations/20260515180000_feed_comments_body_max_280.sql`** (truncates existing rows over 280, then constraint).
- 2026-05-15: **Lounge post detail — sticky comment composer:** Bottom-sheet footer with **feed-parity UX** — collapsed **“Post your reply”** pill (no toolbar); tap expands to **autosizing** textarea + media/GIF icons (text-only hints until schema supports attachments), **char counter** (**280**, same as posts), cyan **Reply**; **`visualViewport`** overlap lifts footer with keyboard; **`expandAndFocus`** + **`scrollLoungePostDetailToTopInstant`** on open / reply interaction; **`composerSlot` removed from `LoungePostCommentThread.jsx`**.
- 2026-05-15: **Lounge comments — interaction row per card:** each comment uses **`LoungePostInteractionBar`** (`variant="sheet"`) with the **opened post** as `post` (same handlers as post detail / lightbox: like, repost menu, bookmark). **`comment_count`** on that merged object is overridden per row with **direct child reply count** for the bubble. **`onCommentClick`** → reply composer for that comment. **`LoungePostCommentThread.jsx`** + **`SocialFeed.jsx`** props mirror **`renderDetailMediaLightboxFooter`**.
- 2026-05-15: **Brand palette (Tailwind + CSS):** **`src/index.css`** defines **`lv-red/orange/yellow/blue/green/purple`** + **`--lv-*`** on **`:root`**; **`cyan-*`** + **`violet-*`** scales retuned to electric blue **`#06cefc`** and purple **`#9d00ff`**. Wired through **`loungeDockFabGlow.js`**, **`loungeDockArcCarouselItems.jsx`**, dock slide panels, coach SVG accents, Offers datepicker, Lounge likes (**`#fd262d`**) / bookmarks (**`#ffea00`**). **`docs/frontend-architecture.md`** § Brand palette.
- 2026-05-15: **Lounge FAB reposition while menu open:** Long-press + drag on the **+** works when the dock menu is **expanded** (same timing as when closed); short tap still **closes** the menu. (`LoungeDockArcCarouselPrototype.jsx` — reposition timer no longer gated on `!open`.)
- 2026-05-18: **Lounge notification interaction rows:** comment, reply, mention, and quote-repost cards show feed-style **`LoungePostInteractionBar`** (post or comment variant) with hydrated counts + viewer toggles; like/bookmark/repost/comment open target without activating the row tap.
- 2026-05-18: **Lounge Settings Account section:** collapsible **Account** (Edit profile → own profile sheet in edit mode, read-only email, change-password reset email, membership badge + billing stub); logout/delete stay below fold.
- 2026-05-23: **Lounge menu layout help in Settings:** move-menu + Wheel/Edge schematics live under collapsible **Menu button layout** in dock Settings (`LoungeDockMenuLayoutHelp.jsx`); Settings copy shares the first-run intro overlay.
- 2026-05-18: **Lounge menu layout first-run intro:** On first **tap** that **opens** the dock menu, **`LoungeDockMenuLayoutIntroOverlay`** shows the same help + Wheel/Edge diagrams; user **must tap a layout** to dismiss (`loungeDockMenuLayoutIntro:v1` — no **Got it** / backdrop / Escape). Settings **Menu button layout** reuses **`LoungeDockMenuLayoutHelp.jsx`** for later changes.
- 2026-05-18: **Lounge iPhone PWA install help:** Settings → **Notifications** — amber inline banner + **`IosPwaInstallHelpDialog`** (`/onboarding/ios-setup.png`); one-time popup on first expand; tapping **Push notifications** ON in Safari tab opens steps instead of subscribing. Shared helpers in **`pwaNotificationPrompt.js`** (`lounge_ios_pwa_setup_seen:v1`).

- 2026-05-15: **Lounge FAB reposition coach (one-time):** *(superseded 2026-05-23 — help moved inline to Settings; overlay removed.)* On first successful **tap** that **opened** the dock menu…
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
- 2026-05-18: **Profile interest tribes (decision, not built):** Profile pills = public **interests** on profile only (same slug enum; uncapped on profile). **No changes** to post pills, compose defaults, feed Tribes filter, or search in this work. Compose pre-fill + feed ranking from profile interests **deferred**. Tracked **`docs/social-feed-roadmap.md`** D3 + backlog *Profile interest tribes*.
- 2026-05-18: **Composer last-post tribe pills persist (test):** **`loungeComposerLastCategoryPills:v1`** writes on pill change + fast-lane / video / post-edit submit paths (**`16f8fae`**). Ryan smoke **PASSED**.
- 2026-05-18: **Post category pills (v1):** **`category_pills text[]`** on **`community_feed_posts`** (0–3, staff enum: AP Slots, AP Tables, Poker, Gaming, Tabletop, Investing, Trading, Stocks, Crypto, Collectibles); compose/quote/edit picker + feed/detail display; plain repost copies OP pills; quote inherits OP; last-post default in **`localStorage`**. Migration **`20260525120000_community_feed_posts_category_pills.sql`** (+ **`20260525130000_*_rename.sql`** if old slug constraint already applied). Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).
- 2026-05-18: **Tribe filter (home feed + search):** Home **Tribes** dropdown — all on by default, dim hides matching posts (exclusion, **`loungeFeedCategoryFilter:v2`**); search chip-in-field + text AND. Feed RPC **`p_excluded_category_slugs`** — migration **`20260525150000_*`** (after **`20260525140000_*`** search half). Ryan sign-off **PASSED** on **test** @ **`51b1621`** (2026-05-24).
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
- 2026-05-25: **`session-chat-export.md`** and all `scripts/Run-CursorChatExport-*.ps1` / `Register-CursorChatExportScheduledTask-*.ps1` scripts deleted; scheduled tasks unregistered. Continuity is maintained via docs only.
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
- 2026-05-29: **Quick links v1 (test):** Title bar shortcuts (max 2, `localStorage`); **`TitleBarQuickLinks`** in hamburger cluster; per-page **`QuickLinkPageToggle`** on Calcs home, Bankroll, Logbook, Calendar, AP Guides; at-cap modal; dynamic logo width via **`titleBarLayout.js`** (extra reserve on Lounge dock panels for **×** close). Light-mode **`data-quick-link-*`** CSS.
- 2026-05-29: **Play Logbook Phase 3 (`test`):** Calculator **Log play in Logbook** pre-fill; capture casino = active bankroll session or GPS nearest; ANALYZE **Export CSV**. Ryan smoke pending.
- 2026-05-29: **Play Logbook (test / branch `test`):** Schema **`supabase/play_logbook.sql`** + migration **`20260529120000`**; client **`src/features/play-logbook/`** (LOG + ANALYZE tabs, custom templates); Slots hub **Logbook** tile; Slots Edge gate; light-mode scoped CSS **`data-play-logbook*`** in **`index.css`**. **Apply SQL on test before smoke.**
- 2026-05-29: **Planned (Play Logbook):** Ryan spec captured → shipped v1 (see row above).
- 2026-05-29: **Planned (Play Logbook — shared plays):** Ryan locked product rules — attribution-only %; partners from followers∪following + guests; auto-add; notify via Lounge `activity_events`; creator edits; partner delete = own row only, partner row stays on session for others.
- 2026-05-29: **Play Logbook Phase 4 — shared plays (client + SQL migration `20260531140000`):** partners UI, RPC save/update/delete session, Lounge Alerts `play_log_shared`, push/deep link to Logbook entry. Apply migration on test + redeploy Edge push; Ryan smoke pending.
- 2026-05-29: **Play Logbook — calc EV snapshot:** migration **`20260531150000_play_log_calc_ev_metrics.sql`**; Log play from calcs pre-fills **Current EV (RTP %)** + **Average case (×/$)** (Phoenix/Buffalo/Stack Up) or **Expected EV ($)** (MHB). Apply on test with play logbook migrations.
- 2026-05-29: **Play Logbook — acquisition fee:** migration **`20260531160000_play_log_acquisition_fee.sql`**; **Acquisition fee** field on Phoenix/Buffalo/Stack Up templates (manual entry in log form; calc finder's-fee UI does not pre-fill). Apply on test.
- 2026-05-29: **Play Logbook — partner picker fix:** client loads partners via same **`fetchProfileFollowListProfiles`** path as Lounge Following/Followers (not RPC-only); migration **`20260531170000_play_log_partner_candidates_fix.sql`** hardens RPC fallback.
- 2026-05-29: **Play Logbook — edit shared attributions:** migration **`20260531180000_play_log_update_shared_partners.sql`** extends **`play_log_update_shared_session`** with **`p_partners`** (sync %, add/remove partners, fan-out + alert for new users). Creator edit form partners section no longer read-only.
- 2026-05-29: **Play Logbook — manager + Paid:** migration **`20260531190000_play_log_session_manager_paid.sql`** — one **manager** per shared play (radio), **Paid** checkbox per partner; manager or creator can update paid via **`play_log_update_session_partners_paid`**. Apply on test.
- 2026-05-29: **Play Logbook — partner paid/unpaid notifications:** migrations **`20260531200000`** / repair **`20260531300000`** (paid, false→true) + **`20260531310000`** (unpaid, true→false) + Edge **`lounge-send-activity-push`**. **Order:** run **`31310000` after `31300000`**; if unpaid alerts missing after fixing paid, run **`20260531320000_play_log_paid_unpaid_rpc_repair.sql`** (31300000 ran after 31310000 and stripped unpaid RPC branch).
- 2026-05-29: **Play Logbook — custom template fields:** migration **`20260531350000_play_log_template_custom_metrics.sql`** (`custom_metric_defs` jsonb on `play_log_game_templates`); Create Game Template UI **Create field** (name + type: whole number / money / decimal / short text). Apply on test before creating templates with custom fields.
- 2026-05-29: **Play Logbook — admin primary game templates:** migration **`20260531400000_play_log_admin_system_templates.sql`** (`play_log_viewer_is_admin()` + RLS insert/update/delete for `is_system` templates); Logbook **Primary game templates** sheet (`profiles.role = admin` or `isAdmin` prop). Apply on test before admin creates/edits primary dropdown games.
- 2026-05-29: **Play Logbook — MHB template fields:** migration **`20260531500000_play_log_mhb_template_fields.sql`** — `mhb_manufacturer` (Ainsworth/AGS/IGT/Manual), `mhb_meter`, `must_hit_by` on **Must Hit By** system template; Log Play picker + prefill from MHB calculator. Apply on test.
- 2026-06-01: **Chat scale hardening (session):** Three migration files applied on top of Phase 2:
  - **`20260601140000_chat_rpcs.sql`** — `chat_rooms_for_user()` RPC (conversation list in 1 query vs 3); `chat_message_reactions_agg()` RPC (GROUP BY server-side vs raw row dump). Client: `ChatTab` + `LoungeChatPanel` use `chat_rooms_for_user`; `ChatConversation` uses `chat_message_reactions_agg`.
  - **`20260601150000_chat_indexes_and_rpc_messages.sql`** — drops Phase 1 `(room_id, created_at desc)` index, replaces with `(room_id, created_at DESC, id DESC)` composite (required by new composite cursor); adds `chat_message_reactions(message_id)` index + unique index; adds `chat_messages_page()` security-definer RPC (membership check once, bypasses per-row RLS EXISTS overhead).
  - **`20260601160000_chat_messages_page_catchup.sql`** — extends `chat_messages_page` with `p_after_*` cursor for reconnect catchup.
  - **Client (`ChatConversation.jsx`):** DOM cap 150 messages + `hasNewer`/`newMsgCount` banner ("↓ N new messages / Jump to latest"); `useLayoutEffect` scroll-position restoration after prepend (no visual jump); Realtime reconnect gap recovery (fetch missed messages on `SUBSCRIBED` after initial); lazy batch sender-profile resolver (unknown channel/group senders fetched in 150ms windows instead of showing "Member"); composite cursor (`created_at, id`) on `loadMore`; `update_last_read` debounced 2s + flush on unmount.
  - **Edge `lounge-chat`:** rate limiting on `send_message` — max 5 messages / 5 seconds per user (DB count, no Redis required).
  - **Apply all three migrations on test. Redeploy `lounge-chat` Edge after for rate limiting.**

- 2026-06-01: **Chat Phase 2 — full X.com-level feature build:** Migration **`20260601120000_chat_phase2.sql`** adds `last_message_at`/`last_message_preview`/`last_message_sender_id` on `chat_rooms`, read-receipt + mute + role columns on `chat_room_members`, `reply_to_message_id`/`reply_to_preview`/`deleted_at` on `chat_messages`, `chat_message_reactions` table (RLS: member-of-room select; own insert/delete), AFTER INSERT trigger keeping `chat_rooms` last-message columns current. Edge `lounge-chat` extended: `reply_to_message_id` on `send_message`, `delete_message` (soft), `add_reaction`/`remove_reaction`, `update_last_read`, `mute_room`/`unmute_room`. New feature module **`src/features/chat/`**: `ChatTab.jsx` (lazy top-level tab; conversation list sorted unread-first then `last_message_at`; anon gate), `ChatConversation.jsx` (full-screen message view; Realtime subscriptions; paginated load-more; read receipts; typing indicator display), `ChatBubble.jsx` (alignment, reply quote strip, image grid, reaction row, long-press action menu), `ChatComposer.jsx` (autogrow textarea; R2 image attach; reply strip; typing broadcast emit; Ctrl+Enter), `chatApi.js`, `chatTypingBroadcast.js`. **AppShell** wiring: lazy `ChatTab` chunk; `chat` in hamburger nav; `pendingChatPeerUserId`/`pendingChatRoomId` state; `?tab=chat&room=<uuid>` deep link; `onOpenChatWithUser` + `onOpenChatRoomFromDock` callbacks threaded to SocialFeed → LoungeDockSlidePanels. **LoungeChatPanel** simplified to list-only (dock shortcut). **Quick link** `chat` added to `quickLinkDestinations.js`. **Apply migration on test before client deploy; redeploy `lounge-chat` Edge after migration.**
- 2026-05-29: **Play Logbook — spins/bonuses labels:** migration **`20260531510000_play_log_spin_bonus_optional_labels.sql`** + client `metricDefMap` — `# Spins (optional)` / `# Bonuses (optional)` on Log Play, entry detail, template builder, CSV.
- 2026-05-29: **Play Logbook — EV ($) field:** migrations **`20260531520000`** / **`20260531530000`**; metric **`expected_ev_usd`** label **EV ($) (optional)**; calculator prefill no longer duplicates EV in notes (form field only).
- 2026-05-29: **Buffalo Link calculator slug:** **`buffalo`** → **`buffalo-link`** (`calculatorAccess.js`, Guides resolve, play log + machines + `content_access_gates`); migration **`20260531540000_buffalo_calculator_slug_buffalo_link.sql`**. Apply on test.
- 2026-05-29: **Play Logbook — metric label polish:** **`20260531330000`** Counter Pop, **`20260531340000`** Cash In/Out, **`20260531360000`** Counter Start; client **`playLogMetrics.js`** / **`metricDefMap`** keeps optional spin/bonus/EV labels aligned with DB.
- 2026-05-29: **Play Logbook — manager/owner defaults:** **`20260531210000_play_log_manager_owner_default.sql`** — apply on test with other play-log migrations.
- 2026-05-29: **AP Guide editor — draft + relaxed ingest:** **`src/slot-guide-form/`** localStorage draft (**`slotGuideFormDraft:v1`**), optional hero/sections on ingest, **`slugifyInput`**, bottom **Save draft** @ **`25d81f1`** / **`d4d6c09`**.
- 2026-05-29: **AP Guide ingest on Vercel:** **`supabaseEnv.mjs`** uses dashboard **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** when gitignored target file absent @ **`24d0412`** — set on **tx18** (or preview) before ingest smoke.
- 2026-05-29: **AP Guides light-mode search input:** **`GuidesScreen.jsx`** + **`index.css`** **`ap-guides-search-input`** contrast fix @ **`ea1d72e`**.
- 2026-05-26: **Fix: comment repost like counter optimistic update (`test`):** `toggleLoungeDetailCommentLike` was only patching `setLoungeDetailComments` (detail view), never `communityPosts`. Added `setCommunityPosts` patch that updates `p.reposted_comment.like_count` when a matching comment id is found. Ryan **PASSED** on `test` @ `e1d09a4`.
- 2026-06-02: **Chat DM push duplicate fix:** `lounge-chat` `send_message` removed redundant `fetch` to `lounge-send-activity-push` after `activity_events` insert — H2 trigger `trg_activity_events_enqueue_push` already invokes Edge once per row (was 2× OS notification per message). **Redeploy `lounge-chat` on test/prod**; smoke one DM → one push.
- 2026-06-02: **Chat DM push debounce (60s):** migration **`20260602200000_chat_dm_push_debounce.sql`** — `chat_dm` uses `activity_push_batches` per recipient+room (60s debounce, timer resets on each message; like/bookmark stay 10s); flush via existing pg_cron. Edge **`lounge-send-activity-push`**: batched body e.g. “X sent you 3 messages”. Apply migration + redeploy Edge on test; smoke rapid DMs → one push ~60s after last message.
- 2026-06-02: **Fix: chat DM push never sent after debounce:** **`20260602200000`** only scheduled batches (pg_cron flush) — if cron lagged or Edge wasn’t redeployed, **zero** DM pushes. **`20260602210000_chat_dm_push_invoke_edge.sql`** invokes Edge with `batchId` right after schedule; Edge waits for `scheduled_send_at` then sends (cron remains backup). Apply **`20260602210000`** + redeploy **`lounge-send-activity-push`**; smoke one DM with recipient **not** in active room → one push ~60s after send.
- 2026-06-02: **Chat DM push — first immediate, then batch:** **`20260602220000_chat_dm_first_message_immediate.sql`** — first message after 60s+ quiet → immediate push; follow-ups within 60s → debounced batch. Apply migration on test (no Edge redeploy required unless **`20260602210000`** Edge wait path not deployed yet).

---

## Chat — scale backlog

Tracks architecture and correctness work for the chat feature at growth scale.
Items are ordered by priority. ✅ = implemented. 🔜 = next. ⏳ = deferred (monitor before doing).

### ✅ Completed this session (2026-06-01)

| Item | What was done |
|---|---|
| Room list: 3 queries → 1 | `chat_rooms_for_user()` security-definer RPC — single JOIN returns room + member state + peer profile + sender name |
| Reaction aggregation | `chat_message_reactions_agg()` RPC — GROUP BY server-side; 500 👍 = 1 row not 500 |
| `update_last_read` debounce | 2s debounce + flush on conversation unmount; never fires for optimistic message IDs |
| DOM cap + history window | Max 150 messages in DOM; trim tail when loading older pages; `hasNewer` flag + "↓ N new messages / Jump to latest" banner |
| Scroll position restoration | `useLayoutEffect` measures pre-prepend `scrollHeight`, restores `scrollTop` after commit — no visual jump |
| Composite cursor | `loadMore` uses `(created_at, id)` cursor — eliminates skipped messages at identical timestamps |
| Missing indexes | `chat_messages(room_id, created_at DESC, id DESC)` — replaces Phase 1's 2-column index; `chat_message_reactions(message_id)` + unique constraint |
| Per-row RLS bypass | `chat_messages_page()` security-definer RPC — membership check once per call, not 50× per page load |
| Reconnect gap recovery | Realtime `SUBSCRIBED` callback (after first connect) fetches missed messages using `p_after_*` cursor; merges without duplicates |
| Lazy sender profiles | Unknown `sender_id`s in channels/groups batch-fetched in 150ms windows; renders name/avatar instead of "Member" |
| Rate limiting | `send_message`: max 5 messages / 5 seconds per user — DB count query, no Redis required |

### ✅ Completed (2026-06-01 continued)

| Item | What was done |
|---|---|
| **Push notifications for DMs** | Migration `20260601170000`: added `chat_dm` event type to `activity_events` CHECK constraint + `chat_room_id` column. `lounge-chat` `send_message`: mute/block/active-room gates, then `activity_events` insert; push via **`trg_activity_events_enqueue_push`** → `lounge-send-activity-push` (do not call Edge from `lounge-chat` — was duplicate push). `lounge-send-activity-push`: `chat_dm` → `push_messages` pref; URL `/?tab=chat&room=<roomId>`. **Redeploy `lounge-chat` after duplicate-push fix.** |
| **User blocking** | Migration `20260601170000`: `blocks` table (blocker_id, blocked_id, unique constraint, no-self check) + RLS (participant SELECT, blocker-only INSERT/DELETE). `lounge-chat` `open_dm`: checks blocks in both directions — returns 403 "You have blocked this member." or "This member is unavailable." `lounge-chat`: new `block_user` + `unblock_user` actions. `chatApi.js`: `chatBlockUser`, `chatUnblockUser`, `chatGetBlockStatus`. `LoungeProfileFullScreen`: loads block status in `refreshSocial`; block/unblock button (ban-circle icon) in action row; Message button disabled with appropriate title when either party blocks. |
| **Chat bug fixes (2026-06-01)** | Migration `20260601180000`: (1) `chat_messages(sender_id, created_at DESC)` index — rate-limit query was doing a full table scan without it; (2) `GRANT SELECT, INSERT, DELETE ON blocks TO authenticated` — RLS policies were silently unreachable without table-level privilege; (3) `idempotency_key TEXT UNIQUE` column on `chat_messages` — Edge function returns existing `message_id` on duplicate key, preventing duplicates on automatic retries / rapid double-taps. `chatApi.js`: `chatSendMessage` now generates a `crypto.randomUUID()` per call. `AppShell`: service worker `app-navigate` message handler now handles `tab=chat` — backgrounded app correctly opens the specific room when a DM push notification is tapped. |

### ✅ Link preview cards (2026-06-04)

| Item | What was done |
|---|---|
| **Chat + Lounge link cards** | Migrations `20260604180000_link_previews_chat_and_lounge.sql`, `20260604180100_chat_messages_rpc_link_preview.sql`. Edge **`lounge-link-unfurl`** (`unfurl`, `attach`) + shared **`_shared/linkUnfurl.ts`** (OG scrape, SSRF guards, **`/lounge/p/:uuid`** + `?post=` permalink → post row). **`lounge-chat` `send_message`** attaches preview on send. Client: **`ChatLinkPreviewCard`**, **`LoungeLinkPreviewBlock`**, attach from **`loungePostSubmitJob`** / **`loungeCommentSubmitJob`**. Rich card when `og:image`; compact pill otherwise. **Deploy:** `supabase functions deploy lounge-link-unfurl` + redeploy **`lounge-chat`**; run both migrations on test. **Do not** re-run `20260601160000_chat_messages_page_catchup.sql` after `041801`. |
| **Polish (`3addcf3`)** | Brand tint on preview pills (`accent_color` from OG `theme-color`, domain map, optional favicon canvas — skip `google.com/s2/favicons` CORS). Chat: caption + preview in **one** **`ChatBubble`**; URL-only sends card without duplicate text bubble. Lounge: post detail shows **`link_preview`**; submit jobs **await** attach before closing composer. |

### ✅ Group delete lifecycle (2026-06-05, code `10f9a0e`)

| Item | What was done |
|---|---|
| **Auto-delete empty groups** | Migration **`20260605120000_chat_group_delete.sql`**: `AFTER DELETE` trigger on **`chat_room_members`** deletes **`chat_rooms`** when `kind = 'group'` and zero members remain (covers leave, Edge **`remove_group_member`**, owner clearing roster). Messages/stars/pins cascade via existing FKs. DMs/channels unaffected. |
| **Delete for everyone** | RPC **`chat_delete_group(p_room_id)`** — creator or **`chat_room_members.role = 'admin'`**. Client **`chatDeleteGroup`**; **`ChatGroupSettingsSheet`** destructive button + confirm. |
| **Prior behavior (fixed)** | Leaving or removing all members left orphan **`chat_rooms`** rows; inbox hid them but data remained. |

**Test smoke (Ryan):** owner deletes group with members present; non-owner leaves while others stay; last member leaves; owner removes everyone then leaves. **Apply `20260605120000` on test before smoke.**

### 🔜 Next priorities (chat)

- Ryan sign-off on link-preview + group-delete smoke after migrations/Edge deploy on test.

### ⏳ Deferred (monitor, implement when triggered)

| # | Item | Trigger to act |
|---|---|---|
| 3 | **`last_message_at` trigger hotspot** | Measure Postgres lock wait on `chat_rooms` in production at >500 msg/min per room. Fix: batch update with 1s delay, or move to Edge function write path. |
| 4 | **Realtime `postgres_changes` → Broadcast** | Supabase dashboard shows WAL lag, OR concurrent Realtime connections approach plan limit. Fix: Edge `send_message` also publishes to a Supabase Broadcast channel; client subscribes to Broadcast instead of `postgres_changes`. ~3h work. |
| 5 | **E2E encryption** | Schema already has `content_encoding`, `body_cipher`, `nonce`, `key_version` columns. Implement when product roadmap demands it. |
