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

- [-] **Lounge thread compose — iOS options bar behind keyboard:** after image/video pick in **`LoungeThreadComposeSheet`**, the media options toolbar can sit **behind** the software keyboard on iOS Safari/PWA. Known issue; **parked** — revisit later (not blocking test ship).

---

## Chat

### Schema (apply before client deploy)
- [ ] **Apply migration `20260601120000_chat_phase2.sql` on test** — adds read receipts, reactions, soft-delete, reply columns, `chat_message_reactions` table + RLS, AFTER INSERT trigger on `chat_messages` keeping `chat_rooms.last_message_at` / `last_message_preview` fresh.
- [ ] **Redeploy `lounge-chat` Edge function** — now handles `delete_message`, `add_reaction`/`remove_reaction`, `update_last_read`, `mute_room`/`unmute_room`, and `reply_to_message_id` on `send_message`.

### Smoke (test)
- [ ] **Conversation list** — Chat tab loads; DMs + topic channels sorted unread-first; unread dot appears for rooms with messages newer than `last_read_at`.
- [x] **Inbox swipe actions** — Swipe a conversation **left** → **Archive** (hidden from inbox); swipe **right** → **Delete** (leave room). Long-press context menu still works. Apply migrations **`20260702150000_chat_room_member_archive.sql`** + **`20260702160000_chat_archived_rooms_list.sql`** on test first.
- [x] **Archived inbox** — Tab bar **Archived** opens archived list; swipe left (blue) → **Move to inbox**; long-press **Move to inbox**; swipe right → delete. While archived: **no DM push** (redeploy **`lounge-chat`**). **Reply from archived thread** auto-restores to Inbox + re-enables push; **inbound-only messages do not** auto-unarchive.
- [ ] **Send/receive** — Send a message in a DM; confirm Realtime INSERT appends it; second device receives it.
- [ ] **Reply** — Long-press a bubble, tap Reply; reply quote strip shows in composer; sent message has `reply_to_preview` rendered above bubble.
- [ ] **Reactions** — Long-press bubble; tap emoji; reaction row appears; **second device sees pill + attribution sheet update live via Realtime** (groups: tap pill emoji to toggle; tap pill → Reactions sheet). Apply **`20260606140000_chat_message_reactions_page.sql`** + **`20260606150000_chat_message_reactions_realtime.sql`** on test first.
- [ ] **Typing indicator** — Type in composer; other device shows "X is typing…" for ~3.5 s.
- [ ] **Delete message** — Long-press own message, tap Delete; bubble shows "This message was deleted".
- [ ] **Mute** — Bell icon in conversation header; pick duration; confirm `muted_until` persists.
- [ ] **Read receipts** — Scroll to bottom of conversation; `update_last_read` fires; unread dot clears on list refresh.
- [ ] **Delivered / Read labels** — Own latest message shows **Delivered** after send; **Read** after peer opens thread (DM) or all receipt-enabled members read (group). Toggle **Read receipts** in **Chat info** (DM pill) or **Group info** (group pill) under **Privacy** — labels hide and peer stops seeing your read position. Apply **`20260606120000_chat_read_receipts.sql`** on test first.
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

**Primary workflow (form-first):** Supabase + cloud storage are source of truth. Repo **`Slots/`** and **`public/guides/`** removed from git @ **`8bcbdb6`** — all guide heroes and inline images are R2/Storage URLs in the DB. Calculator icons: **`public/calculators/*.webp`**.

| Mode | Action |
| --- | --- |
| **New guide** | Fill form → upload hero/diagrams → **Ingest guide** → `POST /api/slot-guide-ingest` |
| **Existing guide** | **Fetch guides** → **Load** → edit → **Save changes** or **Delete guide** (direct Supabase update/delete; admin session) |
| **Sister card / copy** | **Duplicate** (picker or edit header) → set new slug + title → tweak skins → **Ingest guide** (text fields copied; slug cleared; hero/diagram file picks not copied — re-upload) |
| **WIP (same browser)** | **Save draft** → `localStorage` **`slotGuideFormDraft:v1`** (text only; re-attach images after restore) |

**Fetch → Load before editing.** Save recompiles full markdown from form fields — empty **Where to find** wipes that section in the DB.

**Test = prod:** agents must not ingest, batch-run, or patch test **`guides`** / **`machines`** unless Ryan explicitly asks. Snapshot before any approved batch: **`npm run ap-guide:backup`** (or **`node scripts/ap-guide-backup-test-guides.mjs --all-published`**). If a bad ingest wipes form edits: **`npm run ap-guide:restore`** (restores from newest `*-all-published.json` backup). See **`AGENTS.md`** **`AGENT_RULE_TEST_IS_PROD`**.

**SQL (test before Save changes):** apply **`20260610220000_guide_admin_write_rls.sql`** (admin INSERT/UPDATE on **`machines`** + **`guides`**, read unpublished guides). Delete policies: **`20260610180000_guide_admin_delete_rls.sql`**. Or run full **`supabase/guide_admin_rls.sql`** in SQL editor.

### Legacy docx / repo sync (optional, not in repo)

Historical pilot used local **`Slots/_ingest/`** docx → **`Slots/<slug>/`** → **`npm run slots:sync:test`**. Scripts remain under **`scripts/`** if you recreate manifests locally; **not** required for test/prod copy after form-first cutover.

**When to commit / deploy:**

| Change | Form save/ingest | Git commit | Vercel deploy |
| --- | --- | --- | --- |
| Guide text / images (form) | ✓ enough for test app | not required | client deploy for form code only |
| Form / parse / card UI code | — | yes | yes |

**Compiled markdown section order:**

1. 🟢 When to play  
2. 🛑 When to stop  
3. 🔍 How to check  
4. 💰 **Bankroll on hand** (optional)  
5. ⚠️ Risk & Warnings  
6. 📍 **Where to find** (optional — floor / regions; after Risk; **Ryan fills in form — batch synth omits**)  
7. 🎭 Skins (optional)  
8. 🎰 Gameplay Mechanics  

Built by **`formUtils.js`** / **`scripts/lib/slotGuideIngestCore.mjs`**; slot-guide-form field **`where_to_find`**.

**Machine card fields (collapsed tile):**

| Field | Role |
| --- | --- |
| **`machines.popularity`** | Tier label on card + 🔥 (`Common`, `Very Common`, …) — was **`vegas_availability`**; migration **`20260610170000`** |
| **`machines.popularity_summary`** | Optional; **not** shown on card (legacy / future use) |

**Copy:** no em dashes; prefer ellipses (`.cursor/rules/no-em-dashes.mdc`).

**Pilot on test:** **`coin-kingdom-aztec`** @ **`132ec95`** / **`102cec1`** — dual MHB; Egyptian skin; **Where to find** with Vegas + regional table.

**Form-only fixes (2026-06-10):** **`parseGuideMarkdown`** preserves embedded images on Load; **`buildGuideMarkdown`** uses shared **`slotGuideIngestCore.mjs`** (diagram placements); **Diagrams** section enabled on edit; hero/diagram/inline uploads convert to WebP client-side before R2/Storage PUT.

**Auth (ingest API):** `Authorization: Bearer <supabase-session>`; caller **`profiles.role = admin`** (test project hardcoded in **`api/slot-guide-ingest.js`** for JWT validation). **Not** `x-guide-ingest-secret` on Vercel path.

**Vercel ingest env (required on preview/prod that serves `/api/slot-guide-ingest`):** **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** for test target (no repo **`.env.supabase.test`** on server — **`scripts/lib/supabaseEnv.mjs`** falls back to `process.env` @ **`24d0412`**). Production target: **`SUPABASE_URL_PRODUCTION`** + **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`** optional.

### Status

- [x] **Form-first workflow:** Load preserves inline images; WebP uploads; Diagrams on edit; DB + R2 source of truth (2026-06-10)
- [x] **Repo asset cleanup:** **`Slots/`** + **`public/guides/`** removed; heroes/inline images R2-only; calc icons **`public/calculators/`** @ **`8bcbdb6`**
- [x] **Docx pilot workflow** (historical); **`coin-kingdom-aztec`** on test @ **`132ec95`** / **`102cec1`**
- [x] **`## 📍 Where to find`** section in markdown pipeline + form @ **`102cec1`**
- [x] **`machines.popularity`** rename + card shows tier only @ **`132ec95`** / **`a3a20b7`** — SQL **`20260610170000`** (apply on test + prod)
- [x] **Slot-guide-form scroll** (`LoginGate` viewport scroll shell) @ **`132ec95`**
- [x] **Draft save + restore:** manual **Save draft** + auto-save (~2s); **Restore draft** banner; bottom **Save draft** beside **Ingest** @ **`d4d6c09`**
- [x] **Optional fields (new ingest):** hero, skins, risk bullets, guide body sections, +EV threshold (client + **`slotGuideIngestCore.mjs`** @ **`25d81f1`**)
- [x] **Slug typing:** **`slugifyInput`** allows trailing hyphen while typing (`buffalo-link`) @ **`25d81f1`**
- [x] **Vercel env fallback:** ingest no longer requires **`.env.supabase.test`** file on server @ **`24d0412`**
- [ ] **Ryan smoke — ingest on tx18:** Vercel env vars set + deploy **`test`** ≥ **`24d0412`**; ingest Buffalo Link (or other) → **Fetch guides** → **Load** → edit → **Save changes**
- [ ] **Automated `_ingest` docx → guide.md** script (pilot was manual; deferred)
- [x] **Admin Delete on AP Guide cards** — **`GuidesScreen`** red **Delete** (admin only) + confirm modal; SQL **`20260610180000_guide_admin_delete_rls.sql`** (apply on test before use)
- [x] **AP Guides light-mode search:** **`ap-guides-search-input`** + **`html.light`** rules in **`index.css`** (readable on light gray) @ **`ea1d72e`**
- [x] **Guide card hero accent (test):** **`guides.card_accent_color`** migration **`20260610240000_guides_card_accent_color.sql`**; UI **`src/utils/guideCardAccent.js`** + **`guideAccentPalette.js`**; hero upload / ingest extracts dominant color; backfill **`npm run ap-guide:backfill-accents`** (NULL-only; skips 13 legacy pilot slugs unless **`--include-legacy-pilots`**) @ **`e88510c`**
- [x] **Release years on test:** all **310** published guides have **`machines.release_year`** (web-research backfill via **`scripts/ap-guide-backfill-release-years.mjs`**; Ryan manual fix **`payday`**)
- [x] **Guide card light mode (test):** expanded markdown h2 uses **`--gca-light-accent`** (not dark-mode **`--gca-strong`** washout); +EV panel flat neutral bg; Ask Community / auth / profile-gate modals scoped **`data-ask-community-*`** @ **`75ea4f5`**
- [x] **Expanded guide card tap-to-collapse:** tap anywhere on open card collapses (links, **Open calculator**, **Ask community**, admin controls still work) @ **`e8861ae`**
- [x] **Ask Community modal caption crash:** restored missing **`caption`** **`useState`** @ **`3e4eae2`**
- [ ] **Ryan smoke — guide cards (light + dark):** expand/collapse, accent colors, Ask Community post flow, embedded **`guide:`** skin cards; file bugs in bug-hunt phase

### Guide card UI — light mode scoping (agents)

Zinc **`bg-*`** remaps under **`html.light`**; **`text-white`** on inputs **does not**. When fixing guide surfaces in light mode only, prefer **`data-*`** roots + **`html.light [data-…]`** rules in **`index.css`** (same pattern as **`ap-guides-search-input`**, **`data-ask-community-modal`**, **`data-quick-link-modal`**). Hex-accent cards use class **`guide-accent-themed`** + CSS vars from **`guideCardAccent.js`**; light readable accent = **`--gca-light-accent`**.


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

## Edge Monitor (admin ops)

In-app ops dashboard for **`profiles.role = admin`**. Roadmap: **`docs/edge-monitor-roadmap.md`**.

- [ ] **v1 snapshot (code on branch):** migration **`20260703100000_admin_ops_monitor_snapshot.sql`** — RPC **`admin_ops_monitor_snapshot()`**; client **`src/features/ops/EdgeMonitorScreen.jsx`**; AppShell tab **`monitor`** + hamburger **Monitor** + **`?tab=monitor`**. Apply SQL on **test** before smoke.
- [ ] **Ryan smoke (test):** admin opens Monitor → sections populate (users, subs, lounge, search, chat, guides, bankroll, play log, offers, push, starter drops); **Refresh** updates timestamp; non-admin sees access denied.
- [ ] **Prod promote:** after test sign-off, apply migration on **`jtjgtucumuoswnbauxry`** per **`docs/production-rollout-checklist.md`**.

**Phase 2+ (not started):** time-series charts, top search queries, Sentry/Stripe/Cloudflare deep links, alert thresholds — see roadmap.

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

- [x] **`lounge-market-data`** (Lounge market charts: Finnhub/Yahoo/CoinGecko proxy, attach, modal series, **`logo_image`**, auto cashtag resolve) deployed on **test** with **`FINNHUB_API_KEY`** (+ optional **`COINGECKO_API_KEY`**). Ryan sign-off **PASSED** on **test** (2026-06-07) — `$AAPL` without picker → real Apple chart; Advanced snapshot PNG → EDGE wordmark left, company centered, floating legend.
  - Source: `supabase/functions/lounge-market-data/README.md`, `finnhubMarket.ts`, `yahooMarket.ts`, `LoungeMarketChartModal.jsx`, `loungeMarketChartSnapshot.js`.
  - Production replay: `production-rollout-checklist.md` §4.

- [ ] **`lounge-chat-r2-video-upload`** (chat video MP4 → **Cloudflare R2** direct upload). Clone of `lounge-cf-r2-direct-upload` accepting **`video/mp4`** only; reuses all `_shared/loungeCfR2.ts` helpers. Requires same R2 secrets as existing image upload function (no new secrets needed).
  - **Deploy:** `supabase functions deploy lounge-chat-r2-video-upload` on **test** first.
  - **Also:** redeploy **`lounge-chat`** (now imports `loungeCfR2DeleteObject` to clean up R2 video + poster on `delete_message`; also accepts `video_url` on `send_message`).
  - **Migration:** run **`20260608000000_chat_messages_video_url.sql`** on test before client deploy (adds `video_url TEXT` column; rebuilds `chat_messages_page` + `chat_messages_window` RPCs to include it).
  - **Smoke (test):** send a video in chat — progress bar encodes then uploads; bubble appears immediately with poster; tap bubble → native `<video>` plays; delete message → R2 objects removed. Legacy `stream_video_uid` messages still render via CF iframe unchanged.

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

- [x] **Lounge thread SQL chain (test):** migrations **`20260608140000`** through **`20260608210000`** applied on test — caption 320 + post threads, parts as **`feed_comments`**, thread drafts, timeline repair, per-part media body check, quote repost on thread parts, draft thread part media. Ryan sign-off **PASSED** on **test** (2026-06-07).
  - Production replay: `production-rollout-checklist.md` §2 — apply same chain on prod before thread compose client.

- [x] **Lounge market chart embeds + Advanced modal (test):** migration **`20260609120000`** + related market SQL; Edge **`lounge-market-data`** redeployed (**`logo_image`**, **`yahooResolveUsEquityCashtag`**, auto cashtag attach). Ryan sign-off **PASSED** on **test** (2026-06-07) — post `$AAPL` without picker → real Apple chart (not Ondo); Advanced snapshot PNG → EDGE wordmark left, company centered, floating legend.
  - Source: `LoungeMarketChartModal.jsx`, `loungeMarketChartSnapshot.js`, `LoungeMarketChartStrip.jsx`, `loungePostSubmitJob.js`, `supabase/functions/lounge-market-data/`.
  - Production replay: checklist §2 (migrations) + §4 (Edge + secrets).

- [x] **Lounge thread compose sheet UX** (test / branch `test`, commits **`8b7d1d2`** → **`8b32619`**)
  - Change: Full-screen **`LoungeThreadComposeSheet`** — X-style parts, glass header + keyboard-docked toolbar, scroll pin active part above strip; **`LoungeComposerMediaToolbar`** split image/video on all composers; media/GIF without keyboard in thread; failure retry keeps per-part media; empty feed caption opens 2-part thread with focus on part 1.
  - Source: `LoungeThreadComposeSheet.jsx`, `LoungeComposerMediaToolbar.jsx`, `SocialFeed.jsx`, `loungePostSubmitJob.js`, `loungeThreadComposeMedia.js`, `loungeThreadComposeVideoPrep.js`, `index.css` (`.lounge-thread-compose-header-glass`, `.lounge-thread-compose-toolbar-glass`).
  - Test validation: Ryan sign-off **PASSED** on **test** (2026-06-07) — (1) feed **Start thread** focus rules; (2) keyboard up → add part / type / attach media → active part above toolbar; (3) image / video / GIF do not re-open keyboard; (4) fail mid-upload → **Retry** restores all part media; (5) load Lounge — no white screen; (6) post detail multi-part hierarchy. *Known deferred:* iOS options bar behind keyboard after media pick (see **Deferred / someday**).
  - Production replay: N/A (client-only); thread SQL chain required first (see row above).

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
    22. **Lounge market charts:** **`lounge-market-data`** redeployed on test with **`FINNHUB_API_KEY`** (+ optional **`COINGECKO_API_KEY`**) — post `$AAPL` in caption without picker → feed mini shows **Apple** (not Ondo/xStock); open **Advanced** → snapshot PNG → EDGE wordmark **left**, company logo + name + ticker **centered**, price/% **right**, floating indicator legend on chart. *(Ryan **PASSED** on test, 2026-06-07.)*
    23. **Lounge thread compose + SQL:** migrations **`20260608140000`**–**`20260608210000`** applied — **Start thread** focus rules; keyboard-docked toolbar; split image/video; mid-upload **Retry** restores all part media; Lounge loads without white screen; multi-part post detail hierarchy. *(Ryan **PASSED** on test, 2026-06-07.)* *Deferred:* iOS options bar behind keyboard after media pick.
  - **Sign-off:** Manual steps above passed on **test** (operator confirmation after latest `test` deploy).
  - **Sign-off (Lounge market + thread batch, 2026-06-07, Ryan):** Smoke **§22** + **§23** **PASSED** on **test** — **`lounge-market-data`** redeploy; thread SQL chain applied; thread compose UX validated. iOS thread-compose options-bar/keyboard overlap **parked**.
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

- 2026-07-03: **Lightbox video scrubber (Ryan sign-off):** Shared **`LoungeStreamVideoPlaybackControls`** on feed hero + chat lightbox: two-tone track, pointer-position seek (iOS hidden-thumb fix), seeked-gated resume on Android **hls.js** MSE, hero **`savedStreamTimeRef`** sync on commit. Live scrub while dragging not required; tap/drag release seek **PASSED** on test (iOS + Android). Client **`14372ac`** on **`origin/main`** / **`edgetilt.com`**.
- 2026-07-03: **Android chat video lightbox (Ryan sign-off):** Android chat videos use lounge-style **`ChatVideoLightbox`** (swipe dismiss, ← back, play/pause + scrubber); no OS **`requestFullscreen`** bypass. Native HLS + hard media stop on dismiss; feed hero shrink mute unchanged. Client **`ac9a948`** on **`origin/main`** / **`edgetilt.com`**. **PASSED** on test then prod.
- 2026-07-03: **Android dock Home ghost click (Ryan sign-off):** Chat (or other tab) → dock **Home** no longer opens wrong post detail (tap-through on feed under home chip). Fix: capture-phase pointer guard before tab switch + **`openLoungePostDetail`** suppress window. Client **`cdb5c69`** on **`origin/main`** / **`edgetilt.com`**. **PASSED** on test then prod.
- 2026-07-03: **iOS nested lounge + chat composer caret (Ryan sign-off):** **`Hello` → Enter → Enter** (empty line 2) caret painted on line 3 on post detail reply + chat. Fix: iOS **`variant !== 'feed'`** lounge composers + chat use native **`<textarea>`** (no contenteditable caret paint bug in fixed/transformed footers); **`scrollHeight`** auto-grow for textarea height. Client **`60652cd`** on **`origin/main`** / **`edgetilt.com`**. **PASSED** on test then prod.
- 2026-07-03: **Lounge + chat composer Enter + Android placeholder (Ryan sign-off):** contenteditable **`execCommand('insertLineBreak')`** with deferred **`syncComposerHtml`** after Enter (fixes mobile double-tap newline); overlay placeholder hides on first keystroke via DOM/`beforeinput` (fixes Android ghost placeholder). Client **`52071b2`** + **`d9ef2a9`** on **`origin/main`** / **`edgetilt.com`**. iOS + Android smoke **PASSED** (feed/comment/chat Enter; first-char placeholder).
- 2026-07-02: **Lounge strict hashtag search (Ryan sign-off):** **`#tag`** dock search routes through **`lounge_search_hashtag_posts`** (literal **`#TAG`** only; case-insensitive tag body; no fuzzy **`edge`** / **`edgeai`** prose matches). Migration **`20260702210000`** + client **`a496a97`** on **`edgetilt.com`**. **PASSED** smoke.
- 2026-07-02: **Lounge strict hashtag search (code):** **`lounge_caption_has_hashtag`** + **`lounge_search_hashtag_posts`**; **`loungeSearchUnified`** routes **`#tag`** queries before **`$TICKER`**. Apply **`20260702210000_lounge_search_strict_hashtag.sql`** on test + prod.
- 2026-07-02: **Lounge hashtag tap-to-search hotfix (code):** **`68de674`** — cashtag unified router requires explicit **`$`**; hashtag tap keeps **`#`** in search input (fixes empty results after cashtag ship).
- 2026-07-02: **Lounge cashtag tap-to-search (Ryan sign-off):** Tap **`$TICKER`** in captions opens dock **Search** prefilled with cashtag and routes through **`lounge_search_cashtag_posts`**. Client-only **`efe255d`** on **`origin/main`** / **`edgetilt.com`**. **PASSED** smoke: feed cashtag tap → search panel + matching posts.
- 2026-07-02: **Lounge market chart ALL timeframe (Ryan sign-off):** Quick modal **ALL** pill no longer aliases **1Y** — **`window_key: all`** with max-history fetch (Yahoo `range=max` / CoinGecko `days=max`). Client **`6c2c811`** + **`lounge-market-data`** redeploy on **`edgetilt.com`**. **PASSED** smoke: ALL shows longer span than 1Y.
- 2026-07-02: **Lounge market chart ALL timeframe (code):** **`MARKET_MODAL_TIMEFRAMES`** ALL → **`all`**; Edge **`finnhubMarket`/`yahooMarket`/`coingeckoMarket`** max-history paths. **Redeploy `lounge-market-data`** on test + prod.
- 2026-07-02: **Chat archive inbox — production (Ryan sign-off):** **`jtjgtucumuoswnbauxry`** migrations **`20260702150000`**–**`170000`** applied; **`lounge-chat`** redeployed; frontend **`origin/main`** through **`f31d9a7`** on **`edgetilt.com`**. Archive / restore swipe, push mute while archived, reply-unarchive validated.
- 2026-07-02: **Chat archive reply-unarchive (code):** **`lounge-chat` `send_message`** clears sender **`archived_at`** on post (Gmail-style restore + push re-enabled). Inbound-only messages stay archived. Client: **`onInboxRestored`** refreshes lists and exits Archived view after send. Migration **`20260702170000`** documents push gate. **Redeploy `lounge-chat` on test.**
- 2026-07-02: **Chat archived push mute + restore swipe (code):** `lounge-chat` **`enqueueChatDmPush`** / **`enqueueChatGroupInvitePush`** skip recipients with **`archived_at`**. Archived list: swipe left → **blue** move-to-inbox (inbox-up icon); inbox stays green archive. **Redeploy `lounge-chat` on test** after client deploy.
- 2026-07-02: **Chat archived inbox (code):** migration **`20260702160000_chat_archived_rooms_list.sql`** — **`chat_archived_rooms_for_user`**, **`chat_archived_room_count`**, **`chat_unarchive_room`**. Client: Inbox tab bar **Archived** entry + back nav; archived list reuses swipe (left unarchive, right delete) + context menu **Move to inbox**. Apply with **`20260702150000`** on test before smoke.
- 2026-07-02: **Chat inbox swipe archive/delete (code):** migration **`20260702150000_chat_room_member_archive.sql`** — **`chat_room_members.archived_at`**, RPC **`chat_archive_room`**, **`chat_rooms_for_user`** / **`chat_unread_room_count`** exclude archived rows. Client: **`ChatTab.jsx`** swipe left → archive, right → delete ( **`chatLeaveRoom`** ); **`chatApi.chatArchiveRoom`**. **Apply migration on test before smoke.** No archived-inbox UI yet (rooms reappear only if unarchive is added later).
- 2026-07-02: **Starter weekly drop — production (Ryan sign-off):** **`jtjgtucumuoswnbauxry`** migration **`20260702120000_starter_weekly_drop_reveal_cron.sql`** applied; pg_cron job **`starter_weekly_guide_drop_weekly`** + **`@edgelord`** verified; **`lounge-send-activity-push`** redeployed; frontend **`origin/main`** fast-forward through **`66d6ed7`** (Vercel **`edgetilt.com`**). **Test sign-off:** scratch reveal UX validated on **`lvslotpro.com`**. **Prod app smoke:** Ryan — one Starter grant via **`docs/test-user-roles.md`** SQL on prod.
- 2026-07-02: **Starter weekly drop scratch reveal (code):** migration **`20260702120000_starter_weekly_drop_reveal_cron.sql`** — weekly pg_cron job, stacked **`activity_events`**, scratch modal + motion-gated audio, tap-to-reveal, Pro upgrade count CTA, exhausted-pool auto-unlock for new **2020+** guides. Apply on **test** first; redeploy **`lounge-send-activity-push`**. Requires **`@edgelord`** profile for system actor + **pg_cron** enabled.
- 2026-07-03: **Edge Monitor v1 (code):** admin-only **`/?tab=monitor`** — RPC **`admin_ops_monitor_snapshot()`** (migration **`20260703100000`**) + **`EdgeMonitorScreen`** lazy tab. Hamburger **Monitor** when **`isAdmin`**. Roadmap **`docs/edge-monitor-roadmap.md`**. Apply SQL on test before smoke.
- 2026-07-01: **Legal URLs (Ryan decision):** **`edgetilt.com/terms`**, **`/privacy`**, **`/guidelines`** in-app routes are sufficient; no separate hosted legal site. Prod checklist §7 closed.
- 2026-07-01: **Legal counsel review (Ryan sign-off):** in-app **`/terms`**, **`/privacy`**, and **`/guidelines`** copy in **`src/features/legal/legalDocuments.js`** reviewed by counsel. Prod checklist §7 updated; policy version still **`2026-06-27`** (`legalPolicyVersion.js`).
- 2026-07-01: **Stripe billing — production (Ryan sign-off):** **`jtjgtucumuoswnbauxry`** migrations through **`20260701160000`**, live **`STRIPE_*`** secrets + webhook, three Edge functions deployed; minimal smoke **PASSED** on **`edgetilt.com`** (Starter monthly Checkout, founding **25% × 12 mo** coupon **`QnYlzKuK`**). Handoff: **`docs/stripe-billing-test-to-prod-handoff.md`**. **Still open on test/prod:** full interval/upgrade/portal smoke matrix on prod; RLS hardening. **Weekly drop cron:** shipped prod **2026-07-02** (see Update log).
- 2026-07-01: **Subscribe modal + checkout (code):** **`SubscribeModal`** plan picker (Starter vs Full, monthly/annual Full, early-bird list prices). Edge **`stripe-create-checkout-session`** accepts **`price_interval`** + optional **`STRIPE_COUPON_EARLY_BIRD`**. Test: Dashboard products/prices, Edge secrets, deploy, webhook smoke validated before prod promote.
- 2026-07-01: **Free tier catalog (code):** **`FREE_GUIDE_SLUGS`** — 14 guides (5 Coin Frenzy, 88 Fortunes Emperor's Coins, AGS/Ainsworth/IGT MHB, World Cruise, Buffalo Link/Cash, Lightning Buffalo Link, Cashman Bingo, Crush Conquest/Dynasty, Dancing Phoenix, Golden Egypt). **`FREE_CALCULATOR_KEYS`** — Buffalo Link + MHB only.
- 2026-07-01: **Starter weekly drop (spec + schema):** per-user random from **remaining** published **2020+** slugs; migration **`20260701130000_starter_weekly_guide_unlocks.sql`**, **`grant_starter_weekly_guide_drop`**, client **`useStarterWeeklyDropGuideSlugs`**. Cron scheduler + reveal UX still open.
- 2026-07-01: **EdgeTilt cutover sign-off (Ryan):** **`edgetilt.com`** prod auth (Google + email); **`lvslotpro.com`** sandbox auth; Vercel Production → **`main`** (**`d4554d0`**); R2 CORS updated for **`edgetilt.com`**. Repo: **`20260701100000_lounge_cf_stream_purge_vault_project_url.sql`** — purge cron **`base_url`** from Vault **`lounge_cf_stream_purge_project_url`** (apply on prod + sandbox; set Vault per project).
- 2026-07-02: **AP Guides list perf:** **`GuidesScreen`** — card metadata first paint, deferred **`content_markdown`** fetch (search skin index + expand cache), **24-card infinite scroll** sentinel on **`ScrollLinkedEdgeTitleBarShell`** scroll root; lazy hero images; **`GuideLockTvSnowCanvas`** stops RAF off-screen. Smoke: scroll AP Guides on test (300+ cards), Lounge embed deep-link still expands target card.
- 2026-06-30: **EdgeTilt production cutover (in progress):** Option A — **`jtjgtucumuoswnbauxry`** → production **`edgetilt.com`**; full clone → **`edgetilt-sandbox`** (**`kcosfvmreeiosdjdzycb`**) test on **`lvslotpro.com`**. Runbook **`docs/edgetilt-production-cutover.md`**; repo: env-driven **`LoginGate`**, **`slot-guide-ingest`**, form ingest default by hostname, **`scripts/supabase-deploy-all-functions.mjs`**. **`AGENTS.md`** + **`production-rollout-checklist.md`** refs updated.
- 2026-06-27: **Lounge cold-boot Lottie — installed PWA only (`test` code):** **`shouldShowLoungeColdBootSplash`** / resume splash require **`isStandalonePwa()`** (Home Screen / installed app). Browser tab skips Lottie and loads the feed directly. **`loungeColdBootSplash.js`**. **Ryan smoke:** Safari/Chrome tab → no splash; Add to Home Screen open → full splash.
- 2026-06-27: **Lounge cold-boot splash — anonymous (`test` code):** anonymous browse now uses the same **play-gated** dismiss as signed-in members (wait for first Lottie frame + **`complete`**, 7s max from playback start). Previously **380ms / 900ms** overlay timers cut the animation early. **`useLoungeColdBootSplash.js`**, **`loungeColdBootSplash.js`**. **Ryan smoke:** logged-out cold open → full fly-through before feed.
- 2026-06-27: **Bankroll + Logbook freemium (local):** free users may open **Bankroll** and **Logbook** from Slots hub / quick links; **10 bankroll sessions** + **10 play logs** before **Start Session**, **Log previous session(s)**, **+ Log Play**, and **Log play in Logbook** (guides + calcs) lock → subscribe modal. **`freemiumToolLimits.js`**, **`useFreemiumToolUsage.js`**. **`docs/access-tiers.md`** updated. **Ryan smoke:** non-subscriber with 10 existing rows sees locked CTAs; subscriber/staff unlimited.
- 2026-06-27: **PWA install title-bar chip (`test` code):** **`Install for better experience`** chip in the EDGE title bar (logo ↔ menu) via **`PwaInstallTitleBarRow`** in **`PwaInstallBanner.jsx`**. Tap toggles a **full-width drop panel** below the title bar (steps + **`/onboarding/ios-setup.png`** on iPhone). Shown whenever **`!isStandalonePwa()`**. Optional **Install app** button when **`beforeinstallprompt`** fires.
- 2026-06-27: **Community Guidelines (`test` code):** in-app **`/guidelines`** page + Settings → Account → Legal link. Content in **`legalDocuments.js`** (same shell as Terms/Privacy).
- 2026-06-27: **Legal (`test` code):** in-app **`/terms`** + **`/privacy`** (**`src/features/legal/`**); signup checkbox + Google OAuth gate; **`LegalAcceptanceModal`** on policy version mismatch; Settings → Account → Legal links. **Apply migration **`20260627200000_profiles_legal_acceptance.sql`** on test before signup smoke.** Counsel review recommended before prod.
- 2026-06-27: **Play Logbook — game picker UX:** **`LogPlayGamePicker`** — search by name/slug, **Recent** (5), **All games (A–Z)**; default open template is first A–Z system game. **`resolvePlayLogPrefillTemplate`** prefers machine slug for calculator prefill. **Guides:** **Log play in Logbook** on cards without a calculator (Slots Edge gate). Sync script removes orphan **`wof-collectors-edition`** when canonical guide template exists.
- 2026-06-27: **Play Logbook — AP guide templates (test):** **`scripts/sync-play-log-guide-templates.mjs`** upserts a system **`play_log_game_templates`** row per published guide (312 on test). Standard fields: bet, denom, cash in/out, acquisition fee, # spins, # bonuses. Calculator extras when **`has_calculator`** / slug maps to a shipped calc (Phoenix/Buffalo counters+EV, Stack Up meters, MHB fields, WoF R1–R5). Re-run after new guide ingests: **`node scripts/sync-play-log-guide-templates.mjs --target=test`**. Metrics lib: **`scripts/lib/playLogGuideTemplateMetrics.mjs`**.
- 2026-06-27: **Play Logbook — # Spins / # Bonuses last:** **`orderedLogPlayFormFields`** + **`sortMetricSlugs`** pin **`spin_count`** / **`bonus_count`** to the bottom of Log Play (above notes) for every template. Migration **`20260627140000_play_log_spin_bonus_fields_last.sql`**; reordered system templates on test.
- 2026-06-27: **WoF 4D CE play log template (test):** applied **`20260627120000_play_log_wof_collectors_edition_template.sql`** — system template **`wof-collectors-edition`** (R1–R5 prize credits, bet/denom, session fields, acquisition fee). **No** Current EV / Average Case fields ... calc does not model RTP/EV like Phoenix/Buffalo/MHB.
- 2026-06-27: **WoF 4D Collector's Edition calculator (local):** new calc key **`wof-collectors-edition`** — weighted column sum (R1×0.7 + R2×0.9 + R3×0.5 + R4×1.0 + R5×0.33 ≥ 45×), simple 70× scout, AP tier shortcuts. Files: **`WheelOfFortuneCollectorsEdition.jsx`**, **`wofCollectorsEditionCalc.js`**, play log migration **`20260627120000_play_log_wof_collectors_edition_template.sql`**. **Ryan:** slot-guide-form → **`wheel-of-fortune-4d-collectors-edition`** → **`has_calculator`** + **`calculator_slug`** = **`wof-collectors-edition`**; replace placeholder icon **`public/calculators/wof-collectors-edition.webp`**.
- 2026-06-25: **Guide card polish shipped on test (`75ea4f5`):** light-mode expanded h2 (**`guide-section-heading`** + **`--gca-light-accent`**), expanded card tap-to-collapse (**`guide-card-expanded-tap-collapse`**), Ask Community modal inputs (**`data-ask-community-modal`** / auth / profile-gate), caption **`useState`** crash fix (**`3e4eae2`**), redundant dotlottie WASM prefetch removed (**`9c27cec`**). **Next phase:** Ryan bug hunt on guide cards + rest of app (light/dark).
- 2026-06-25: **Release year backfill complete (test):** all **310** published guides have **`machines.release_year`** via **`scripts/ap-guide-backfill-release-years.mjs`** (+ Ryan manual **`payday`**). Script not wired to **`package.json`** yet ... invoke with **`node scripts/ap-guide-backfill-release-years.mjs --target=test`**.
- 2026-06-25: **Guide card accent backfill run (test):** after migration **`20260610240000`**, **`npm run ap-guide:backfill-accents`** populated **`guides.card_accent_color`** from hero thumbnails (NULL-only; legacy pilot slugs skipped unless **`--include-legacy-pilots`**). Commits **`e88510c`** … **`75ea4f5`** on **`test`**.
- 2026-06-24: **Guide card accent from hero (test):** additive `guides.card_accent_color` column (`supabase/migrations/20260610240000_guides_card_accent_color.sql`). UI resolves **stored hex → legacy slug map → amber default** (`src/utils/guideCardAccent.js`). Hero upload in form + ingest extracts saturated dominant color; **text-only saves and re-ingest without hero never touch accent**. Backfill: `npm run ap-guide:backfill-accents:dry` then `npm run ap-guide:backfill-accents` (NULL-only; skips 13 legacy pilot slugs unless `--include-legacy-pilots`). Apply migration on test before backfill.
- 2026-06-24: **Desolator PDF v1.14 gaps ingested (test):** 10 guides from **All AP References 1.14** missing slugs — **`barnyard-poker`**, **`fortune-x-poker`**, **`moving-multipliers-poker`**, **`multipliers-rising-poker`**, **`multi-streak-poker`**, **`pay-upgrade`**, **`pick-a-multiplier-poker`**, **`quick-hit-platinum`** (separate from **`quick-hit-ultra-pays`**), **`super-hot-roll-poker`**, **`ultimate-x-bonus-streak-poker`**. Payloads **`scripts/lib/apGuideDesolatorGapPayloads.mjs`** · ingest **`scripts/ap-guide-ingest-desolator-gaps.mjs`**. Pre-ingest backup **`2026-06-24T12-50-27-604Z-all-published.json`** (300 → **310** published). Compare script **`scripts/ap-guide-compare-desolator-pdf.mjs`** → **MISSING: 0**. VP family cross-links in Skins (UX / Multi-Streak / Quick Hit Platinum). Ryan form pass pending (Where to find, heroes).
- 2026-06-24: **Ultimate X Poker ingested (test):** slug **`ultimate-x-poker`** — batch 25 VP skip reversed (AP slot players treat UX as a slot). Payload **`scripts/lib/apGuideUltimateXPokerPayload.mjs`** · ingest **`scripts/ap-guide-ingest-ultimate-x-poker.mjs`**. Sources: workspace **`advantageslots-export`** HTML + Desolator **All AP References v1.14** entry (next-hand multiplier scavenger). Pre-ingest backup **`2026-06-24T11-59-38-480Z-all-published.json`** (298 → **299** published). Folder → **`___DONE/`**. Ryan form pass pending (Where to find, hero).
- 2026-06-24: **Em dash scrub (test):** replaced Unicode em dash (U+2014) with ASCII hyphen in **23** live guides (**61** occurrences). Script **`scripts/ap-guide-replace-em-dashes.mjs`**. Repo batch payloads + sister scripts updated so re-ingest does not reintroduce. Pre-patch backup **`2026-06-24T11-49-55-614Z-all-published.json`**.
- 2026-06-24: **DragonSphere catch-up ingest (test):** **`dragon-sphere`** from batch 6 payload (`scripts/lib/apGuideBatch6Payloads.mjs`) ... batch 6 had marked completed but slug was missing on test (voice rules blocked re-run). Bankroll/risk tightened to pass current synth rules. Pre-ingest backup **`2026-06-24T10-57-31-098Z-all-published.json`** (297 → **298** published). Workspace already in **`___DONE/dragon-sphere/`**. Ryan form pass pending (hero image).
- 2026-06-24: **WoF High Roller Respin sister card (test):** created **`wheel-of-fortune-high-roller-respin`** from live **`wheel-of-fortune-high-roller`** (same AP copy + Ryan Where to find; cross-linked Skins). Script **`scripts/ap-guide-create-wof-high-roller-respin-from-high-roller.mjs`**. Pre-ingest backup **`2026-06-24T02-54-40-403Z-all-published.json`** (296 → **297** published).
- 2026-06-24: **AP deferred catch-up ingested (test):** 3 guides wrongly skipped in batches 27–28 (nested workspace HTML missed at synth). Slugs: **`wo-shu-sky-spin`**, **`wish-mistress`**, **`wild-mermaid`**. Payloads **`scripts/lib/apGuideDeferredCatchupPayloads.mjs`** · ingest **`scripts/ap-guide-deferred-catchup-ingest.mjs`**. Pre-ingest backup **`2026-06-24T00-05-29-841Z-all-published.json`** (293 → **296** published). Folders moved to **`___DONE/`**. Ryan form pass pending.
- 2026-06-23: **AP batch 30 ingested (test):** 3 guides — **final planned batch**. Slugs: `zodiac-lion-zodiac-dragon`, `zorro-power-of-z`, `zorros-wild-ride`. Payloads **`scripts/lib/apGuideBatch30Payloads.mjs`**. Pre-ingest backup **`2026-06-23T13-11-19-696Z-all-published.json`** (290 → **293** published). **`zorros-wild-ride`** sister to **`miss-kitty-wild-ride`** (batch 16). Ryan form pass pending. Planned workspace batch ingest **complete** (batches 1–30).
- 2026-06-23: **AP batch 29 ingested (test):** 7 guides (+ skips below). Slugs: `wolf-ridge`, `wonder-4-collection`, `wu-jin-pen-fuyu-phoenix-panda`, `wu-wang-zhe`, `ying-cai-shen`, `zhao-cai-zhu-gettin-piggy-with-it-yo-ho-hog`, `zodiac-dragon-zodiak-dragon-cash-on-reels`. Skipped: **`wu-da-jiang`** (AP stub), **`wu-jin-pen-parade`** (Parade skin on Wu Jin Pen card), **`wolf-run-eclipse`** (batch 3). Payloads **`scripts/lib/apGuideBatch29Payloads.mjs`**. Pre-ingest backup **`2026-06-23T13-09-40-877Z-all-published.json`** (283 → **290** published). Ryan form pass pending.
- 2026-06-23: **AP batch 28 ingested (test):** 7 guides (+ skips below). Slugs: `wild-pile-up-cutie-kitty-tiger-lee`, `wild-pirates-guardians-of-egypt`, `winning-wings-butterflies-fairies`, `wizard-of-oz-follow-the-yellow-brick-road`, `wizard-of-oz-over-the-rainbow`, `wizard-riches`, `wizard-strike`. Skipped: **`wish-mistress`**, **`wo-shu-sky-spin`** (empty workspace / no HTML source), **`wolf-peak-cat-peak-fu-ren-wu`** (batch 3). **`wild-pirates-guardians-of-egypt`** closes batch 11 deferral for corrupted **`guardians-of-egypt`**. Payloads **`scripts/lib/apGuideBatch28Payloads.mjs`**. Pre-ingest backup **`2026-06-23T13-07-36-274Z-all-published.json`** (276 → **283** published). Ryan form pass pending.
- 2026-06-23: **AP batch 27 ingested (test):** 7 guides (+ skips below). Slugs: `wheel-of-fortune-4d-more-money`, `wheel-of-fortune-high-roller`, `wheel-of-fortune-wild-boost-silver-gold`, `wheel-of-fortune-wild-spin-live`, `wheel-of-fortune-wild-spin-vacation-night-life`, `wild-explosion-get-cha-gold-get-cha-money-get-cha-reward-get-cha-treasure`, `wild-force-bison-sunrise`. Skipped: **`wheel-of-fortune-wild-spin`** (no MP export ... Live + Vacation/Night Life cover it), **`white-wizard`** (live on **`red-empress-the-white-wizard`** batch 20), **`wild-mermaid`** (no HTML source). Payloads **`scripts/lib/apGuideBatch27Payloads.mjs`**. Pre-ingest backup **`2026-06-23T13-06-01-286Z-all-published.json`** (269 → **276** published). Ryan form pass pending.
- 2026-06-23: **Money Hits sister card (test):** refreshed **`money-hits`** from Ryan-edited **`volcanic-sevens`** (same SAP ladder; cross-linked Skins both ways). Script **`ap-guide-create-money-hits-from-volcanic-sevens.mjs`**. Pre-split backup **`2026-06-23T11-16-54-958Z-all-published.json`**. Hero pending in form if needed.
- 2026-06-23: **AP batch 26 ingested (test):** 10 guides, no skips. Slugs: `ultra-rush-gold-african-adventure-midnight-ice-mythical-phoenix-tiger-run`, `ultra-rush-gold-x-bingwen-wei-yi`, `upshot-prosperity-rising-brilliant-7s`, `volcanic-sevens`, `voodoo-jackpots-jack-s-gol`, `whales-of-cash-ultimate-jackpots`, `what-the-duck-dusty-snowy`, `wheel-frenzy-frights-n-delights-genie-unleashed`, `wheel-of-fortune-4d`, `wheel-of-fortune-4d-collectors-edition`. Payloads **`scripts/lib/apGuideBatch26Payloads.mjs`**. Pre-ingest backup **`2026-06-23T10-02-19-704Z-all-published.json`** (258 → **268** published). **`whales-of-cash-ultimate-jackpots`** needed risk copy fix (voice: no `free games` + `trigger` in Risk). Ryan form pass pending.
- 2026-06-22: **AP guide section order:** **Skins** now renders **above Where to find** (form, `buildGuideMarkdown`, and display-time reorder in `guideMarkdownForDisplay` for legacy `content_markdown`). No DB migration ... existing rows unchanged until re-saved.
- 2026-06-23: **AP batch 25 ingested (test):** 7 guides (+ skips below). Slugs: `treasure-blast-balloon-fleet`, `treasure-box-kingdom-dynasty`, `treasure-hunter`, `treasure-shot-pirate-ship-robin-hood`, `trials-of-atlantis`, `ultimate-fire-link-cash-falls-china-street-olvera-street`, `ultimate-screaming-links`. Skipped: **`triple-double-diamond`** (progressive-free-games skin), **`triple-treasure-pot`** (not AP), **`ultimate-x-poker`** (video poker). Payloads **`scripts/lib/apGuideBatch25Payloads.mjs`**. Pre-ingest backup **`2026-06-23T07-57-05-525Z-all-published.json`** (251 → **258** published). Ryan form pass pending.
- 2026-06-23: **AP guide em dash scrub (test):** **`ap-guide-replace-em-dashes.mjs --all-published`** — **19** guides, **60** em dashes → hyphens (**59** in Where to find, **1** in hunt copy on **`tic-tac-go`**). Pre-scrub backup **`2026-06-23T07-34-08-299Z-all-published.json`**. **0** em dashes remain in published `title`, `card_ev_threshold`, `content_markdown`.
- 2026-06-23: **AP batch 24 form pass (Ryan):** batch complete. 9 live (+ **`tiki-fortune`** skipped).
- 2026-06-23: **AP batch 24 ingested (test):** 9 guides (+ **`tiki-fortune`** skipped — shipped as **`captain-riches-tiki-fortune`** batch 2). Slugs: `temple-falls-boost-blast-jungle-adventure`, `the-brave-spirit-the-great-tiki`, `thors-thunder`, `thunder-cash`, `tian-ci-jin-lu-emperor-phoenix`, `tic-tac-go`, `tigers-throne`, `timberwolf-diamond`, `top-up-fortunes-flame-ocean`. Payloads **`scripts/lib/apGuideBatch24Payloads.mjs`**. Pre-ingest backup **`2026-06-23T05-51-39-145Z-all-published.json`** (244 → **253** published).
- 2026-06-23: **AP batch 23 form pass (Ryan):** batch complete. 9 ingested + sister splits **`star-goddess`** / **`wu-dragon`**, **`sure-fire-frenzy-link`** from **`sure-fire-jackpot-link`** (+ **`sun-of-ra`** skipped).
- 2026-06-23: **AP batch 23 ingested (test):** 9 guides (+ **`sun-of-ra`** skipped — already live as **`dawn-of-ra-sun-of-ra-wild-pyramid-respins`** batch 4). Slugs: `sphinx-4d`, `spy-vs-spy`, `star-goddess`, `sumo-kitty-lucha-kitty`, `super-bowl-jackpots`, `super-colossal-reels-spartacus-lil-red-the-red-riders-mysteries-of-ra`, `super-lit-vegas-fortune-spin`, `super-winning-streak-lion-eyes-wolf-eyes`, `sure-fire-jackpot-link`. Payloads **`scripts/lib/apGuideBatch23Payloads.mjs`**. Pre-ingest backup **`2026-06-23T02-05-59-261Z-all-published.json`** (233 → **242** after ingest; **244** after sister splits).
- 2026-06-23: **Sure Fire Frenzy Link sister card (test):** created **`sure-fire-frenzy-link`** from **`sure-fire-jackpot-link`** (Ryan copy + Where to find, cross-linked Skins). Script **`ap-guide-create-sure-fire-frenzy-from-jackpot.mjs`**. Pre-split backup **`2026-06-23T05-38-29-608Z-sure-fire-jackpot-link.json`**.
- 2026-06-23: **Star Goddess / Wu Dragon split (test):** renamed **`star-goddess-wu-dragon`** → **`star-goddess`**; created sister **`wu-dragon`** (same AP copy + Ryan Where to find, cross-linked Skins). Script **`ap-guide-create-wu-dragon-from-star-goddess.mjs`**. Pre-split backup **`2026-06-23T02-53-17-110Z-all-published.json`**.
- 2026-06-22: **AP batch 22 ingested (test):** 7 guides (+ skips above). Slugs: `scarab-grand`, `scarab-link`, `scared-deer`, `screaming-mansion`, `sea-story-fluffy-treasure`, `silver-dollar-shootout`, `spartacus`. Payloads **`scripts/lib/apGuideBatch22Payloads.mjs`**. Pre-ingest backup **`2026-06-22T14-15-34-765Z-all-published.json`** (227 → **234** published).
- 2026-06-22: **AP batch 22 plan:** **`show-me-the-piggy`** skipped — AP Club stub, no thresholds. **`spells-n-whistles`** removed — covered under **`bubble-blast`** (batch 1). **`sea-story`** removed — same as **`sea-story-fluffy-treasure`** (7-card batch).
- 2026-06-22: **AP batch 21 form pass (Ryan):** batch complete. 8 live (+ **`samurai-destiny`** skipped — misspelling of **`samurai-dynasty`**; **`scarab`** skipped — already live).
- 2026-06-22: **AP batch 21 ingested (test):** 8 guides (+ skips above). Slugs: `rich-little-piggies-hog-wild-meal-ticket`, `rich-little-piggies-world-class-advantage-play`, `rich-little-sheep-on-the-lamb-wool-street-riches`, `rising-diamonds`, `rising-phoenix`, `rocket-rumble`, `rubies-instant-hit`, `samurai-dynasty`. Payloads **`scripts/lib/apGuideBatch21Payloads.mjs`**. Pre-ingest backup **`2026-06-22T10-56-56-293Z-all-published.json`** (219 published → **227** after ingest).
- 2026-06-22: **AP batch 20 form pass (Ryan):** batch complete. 10 ingested + **Regal Riches / Prosperity Pearl** sister split (`regal-riches`, `prosperity-pearl`).
- 2026-06-22: **Regal Riches / Prosperity Pearl split (test):** renamed **`regal-riches-prosperity-pearl`** → **`regal-riches`**; created sister **`prosperity-pearl`** (same AP copy, cross-linked Skins). Script **`ap-guide-create-prosperity-pearl-from-regal-riches.mjs`**. Pre-split backup **`2026-06-22T09-43-11-049Z-all-published.json`**.
- 2026-06-22: **AP batch 20 ingested (test):** 10 guides. Slugs: `quick-spin-mai-tai-money`, `raise-the-sails-san-xing-riches`, `really-wicked-winnings`, `red-empress-the-white-wizard`, `red-silk-aztec-chief`, `reel-climb-celestial-mountain-prosperity`, `regal-link-lion-raven`, `regal-riches-prosperity-pearl`, `rich-little-hens`, `rich-little-hens-world-class`. Payloads **`scripts/lib/apGuideBatch20Payloads.mjs`**. Pre-ingest backup **`2026-06-22T06-54-42-428Z-all-published.json`** (209 published).
- 2026-06-22: **AP batch 19 form pass (Ryan):** batch complete. 10 live.
- 2026-06-22: **AP batch 19 ingested (test):** 10 guides. Slugs: `pirates-treasure`, `plants-vs-zombies-3d`, `potion-pays`, `pots-o-luck`, `power-push-jin-gou-long-de-xiyue`, `power-push-shiseijuu-fortunes`, `prize-pool-cactus-cash-fierce-dragon`, `progressive-free-games`, `pub-series-anastasia-s-tavern-isabella-s-tequileria-kaleigh-s-pub-sofia-s-cellar`, `quick-hit-ultra-pays`. Payloads **`scripts/lib/apGuideBatch19Payloads.mjs`**. Pre-ingest backup **`2026-06-22T02-22-43-226Z-all-published.json`** (201 published). Ryan form pass pending.
- 2026-06-21: **AP batch 18 form pass (Ryan):** batch complete. 9 live (+ **`pandas-treasure`** skipped).
- 2026-06-21: **AP batch 18 ingested (test):** 9 guides (+ **`pandas-treasure`** skipped — AP Club stub, empty Short Description). Slugs: `panther-s-throne-tiger-s-throne`, `payday`, `pharaoh-link`, `phoenix-888-dragon`, `piggy-bankin`, `piggy-blessings`, `piggy-parade`, `pillars-of-cash-celestial-fortune-festive-fortune`, `pinwheel-prizes-cat-tiger-majestic-oasis`. Payloads **`scripts/lib/apGuideBatch18Payloads.mjs`**. Pre-ingest backup **`2026-06-21T13-25-40-866Z-all-published.json`** (192 published).
- 2026-06-21: **AP batch 17 redo (test):** tightened voice on 6 guides (`ocean-magic-grand`, `ocean-magic-reels`, `ocean-song`, `olympus-awakening-ra-s-awakening`, `orb-lock-dragon`, `palace-of-wonders`). Left Ryan-edited **`ocean-magic-4d-ocean-magic-ultra`** + **`ocean-magic-bubble-boost`** untouched. Pre-redo backup **`2026-06-21T12-12-23-037Z-all-published.json`**.
- 2026-06-21: **AP batch 17 ingested (test):** 8 guides (+ **`ocean-magic`** skipped — Ryan live sister card; **`ocean-magic-ultra`** merged into 4D card). Slugs: `ocean-magic-4d-ocean-magic-ultra`, `ocean-magic-bubble-boost`, `ocean-magic-grand`, `ocean-magic-reels`, `ocean-song`, `olympus-awakening-ra-s-awakening`, `orb-lock-dragon`, `palace-of-wonders`. Payloads **`scripts/lib/apGuideBatch17Payloads.mjs`**. Pre-ingest backup **`2026-06-21T11-37-17-309Z-all-published.json`** (183 published). Ryan form pass pending.
- 2026-06-21: **AP batch 16 ingested (test):** 8 guides (+ **`mine-blast`** skipped — **`captain-riches-tiki-fortune`** batch 2 skin; **`new-years-parade`** skipped — AP flags not AP). Slugs: `mighty-cash-spins`, `mining-mayhem-gold`, `miss-kitty-wild-ride`, `money-hits`, `money-in-the-bank`, `money-island`, `moon-spirit`, `nights-dream-wheel`. Payloads **`scripts/lib/apGuideBatch16Payloads.mjs`**. Pre-ingest backup **`2026-06-21T09-38-50-809Z-all-published.json`** (176 published). Ryan form pass pending.
- 2026-06-21: **AP batch 15 ingested (test):** 9 guides (+ **`lunar-disc`** skipped — already live as **`fortune-disc`** sister). Slugs: `lucky-pick-bumble-bee-leprechaun`, `madonna-mighty-cash`, `magic-of-the-nile`, `magic-rockets`, `magic-treasures-dragon-tiger`, `magic-treasures-gold-emperor-empress`, `magic-wishes`, `mammoth-legend`, `master-da-dang-jia-fine-fortunes-vivid-diamonds`. Payloads **`scripts/lib/apGuideBatch15Payloads.mjs`**. Pre-ingest backup **`2026-06-21T07-06-36-901Z-all-published.json`** (166 published). Ryan form pass pending.
- 2026-06-21: **AP batch 14 ingested (test):** 9 guides (+ **`lightning-and-the-thunder`** skipped — AP stub, storm mode only). Slugs: `lets-spin-lets-spin-vegas`, `life-of-luxury-hot-diamonds-far-east-fortunes-great-eagle-jungle-cats-mermaid-s-gold`, `lil-red`, `lucky-buddha-lucky-wealth-cat`, `lucky-coin-link-asian-dreaming-atlantica`, `lucky-empress-inca-empress`, `lucky-haul-march-of-the-zombies`, `lucky-larrys-lobstermania-4-link-super-sallys-shrimpmania-4-link`, `lucky-lemmings-stampede`. Payloads **`scripts/lib/apGuideBatch14Payloads.mjs`**. Pre-ingest backup **`2026-06-21T00-24-14-704Z-all-published.json`** (157 published). Ryan form pass pending.
- 2026-06-20: **Jade Monkey / Diamonds & Devils split (test):** **`jade-monkey-diamond-devils`** removed; sister cards **`jade-monkey-deluxe`** + **`diamonds-devils-deluxe`** (same AP copy, cross-linked). Script **`ap-guide-split-jade-monkey-diamond-devils.mjs`**. Backup **`2026-06-20T21-02-08-715Z-all-published.json`**.
- 2026-06-20: **AP batch 13 ingested (test):** 9 guides (+ **`ji-ji-fu`** skipped — AP stub). Slugs: `jade-monkey-diamond-devils`, `jewel-collection-dragon-vault`, `jie-jie-gao-sheng`, `jin-ji-bao-xi-grand-phoenix-tiger`, `joe-blow-diamonds-joe-blow-gold`, `jurassic-park-trilogy`, `knock-knock-guardians-queen-raider`, `kraken-unleashed-lobster-bay-wild-vikings-dive-for-five`, `legends-of-fire-and-water`. Payloads **`scripts/lib/apGuideBatch13Payloads.mjs`**. Pre-ingest backup **`2026-06-20T11-26-58-394Z-all-published.json`**. Ryan form pass pending.
- 2026-06-20: **AP batch 12 form pass (Ryan):** batch complete. **`fa-cai-long`** split from Icy Wilds (sister card). **`igt-classic-hits-coyote-moon-deluxe-money-storm-deluxe-lucky-larry-s-lobstermani`** deleted — duplicate of canonical **`igt-must-hit-by`**. Net batch 12 live: hyper-orbs, icy-wilds, imperial-fortunes, indian-motorcycle, inferno-wheel, jackpot-catcher, + **fa-cai-long**.
- 2026-06-20: **Fa Cai Long sister card (test):** cloned from **`icy-wilds-icy-wilds-deluxe-fa-cai-long`** — same AP copy, cross-linked skins both ways. Script **`ap-guide-create-fa-cai-long-from-icy-wilds.mjs`**. Pre-ingest backup **`2026-06-20T09-45-02-548Z-all-published.json`**. Icy Wilds card title trimmed to **Icy Wilds / Icy Wilds Deluxe**. Hero pending in form.
- 2026-06-20: **AP batch 12 ingested (test):** 7 guides (+ **`hong-hong-huo-huo`**, **`hoodoo-link`**, **`inca-empress`** skipped — AP stubs / defer **`lucky-empress-inca-empress`** batch 14). Slugs: `hyper-orbs-king-of-the-seas-dragon-sense`, `icy-wilds-icy-wilds-deluxe-fa-cai-long`, `igt-classic-hits-coyote-moon-deluxe-money-storm-deluxe-lucky-larry-s-lobstermani`, `imperial-fortunes-penguin-palace`, `indian-motorcycle`, `inferno-wheel-aztec-awards-polynesian-pays`, `jackpot-catcher-sun-moon`. Payloads **`scripts/lib/apGuideBatch12Payloads.mjs`**. Pre-ingest backup **`2026-06-20T08-44-33-189Z-all-published.json`**. Ryan form pass pending.
- 2026-06-20: **AP Guide form — Duplicate:** **`/slot-guide-form`** **Duplicate** in picker + edit header copies machine/guide fields into **New guide** mode (slug cleared; unsaved edit-mode values included). Sister-card splits without agent scripts.
- 2026-06-20: **AP voice — Risk & How to check audit (batch synth):** `findRiskSuperfluity` + `findHowToCheckSuperfluity` in `apGuideVoiceRules.mjs`; batch runner + ingest validation enforce. Risk = one gotcha (~280 chars, 1–2 sentences), no mechanics recap / RTP filler. How to check = 1–3 scout steps, no play filters or feature rules. Audit: `npm run ap-guide:voice-audit` / `:strict`. Batch 11 payloads trimmed as template; Ryan-edited live cards untouched.
- 2026-06-20: **AP batch 11 ingested (test):** 9 guides (+ **`guardians-of-egypt`** skipped — AP Club source corrupted; ship **`wild-pirates-guardians-of-egypt`** in batch 28). Slugs: `golden-messenger`, `grand-buddha-link-grand-cat-link`, `green-machine-bingo`, `guardians-of-the-aztec-guardians-of-giza`, `happy-8s-jolly-8s`, `happy-blessings-happy-blossoms`, `hexbreak3r`, `hold-n-gold-acorn-falls-hot-spell`, `honey-bucks`. Payloads **`scripts/lib/apGuideBatch11Payloads.mjs`**. Pre-ingest backup **`2026-06-20T05-30-22-386Z-all-published.json`**. Bankroll = bold units only (`**N units**`). Ryan form pass pending.
- 2026-06-20: **AP batch 10 ingested (test):** 8 guides (+ **`golden-egypt-dancing-phoenix-soaring-dragon`** skipped — **`golden-egypt`** batch 4; **`golden-elements`** merged into beasts card). Slugs: `god-of-winning-great-hammer-super-spear`, `golden-beasts-golden-elements-brilliant-fortunes`, `golden-dragon`, `golden-egypt-grand`, `golden-gecko`, `golden-guardian`, `golden-jungle`, `golden-jungle-grand`. Payloads **`scripts/lib/apGuideBatch10Payloads.mjs`**. Pre-ingest backup **`2026-06-20T01-14-08-484Z-all-published.json`**. Bankroll = units only. Ryan form pass pending.
- 2026-06-19: **AP voice — bankroll units only:** batch synth `risk_bankroll` = bold unit count only (`**15–30 units**`, `**100 units**`) ... no trailing prose; validated via `findBankrollExtraProse`.
- 2026-06-19: **Ocean Magic guide (test):** sister card cloned from Ryan-edited **`fu-ru-dong-hai`** — same bubble thresholds, Where to find adapted for OM footprint, skins cross-link both ways. Script **`ap-guide-create-ocean-magic-from-fu-ru-dong-hai.mjs`**. Pre-ingest backup **`2026-06-19T23-52-37-258Z-all-published.json`**. Hero pending in form.
- 2026-06-19: **AP voice — card_ev_threshold plain text:** UI renders threshold as plain text (no markdown). Voice rules + ingest validation reject `**`, links, etc. in `guide.card_ev_threshold` (`findMarkdownInEvThreshold`). Ryan fixes live cards in form; no bulk re-ingest.
- 2026-06-19: **AP batch 9 ingested (test):** 8 guides (+ **`gift-of-the-nile-dragon-flame`** skipped — **`gift-of-the-nile`** + **`dragon-flame`** already live from batch 5). Slugs: `frankenstein`, `frankenstein-returns`, `freedom-luck`, `fu-dai-lian-lian-boost-peacock-boost-tiger`, `fu-ru-dong-hai`, `fu-stacks-jade-crimson`, `fuse-blast-caifu-zhi-wu`, `genie-unleashed`. Payloads **`scripts/lib/apGuideBatch9Payloads.mjs`**. Pre-ingest backup **`2026-06-19T12-47-48-457Z-all-published.json`**. Ryan form pass pending.
- 2026-06-19: **Lunar Disc guide (test):** sister card cloned from Ryan-edited **`fortune-disc`** — same AP thresholds (**5 rings** / **4 @ 300**), Where to find mirrored, skins cross-link both ways. Scripts **`ap-guide-create-lunar-disc-from-fortune-disc.mjs`**, **`ap-guide-patch-lunar-disc-from-fortune-disc.mjs`**. Hero pending in form.
- 2026-06-19: **AP batch 6 catch-up ingested (test):** 2 guides deferred from batch 6 skip list — `easy-money-deluxe` (Slot Farmers money-roll thresholds), `egyptian-gems-rise-of-pharoah-rise-of-queen` (Gaming Arts orb queue). Payloads **`scripts/lib/apGuideCatchupBatch6Payloads.mjs`**; runner **`scripts/ap-guide-catchup-batch6-ingest.mjs`**. Pre-ingest backup **`2026-06-19T09-46-54-785Z-all-published.json`**. Folders → **`___DONE/`**. Ryan form pass pending.
- 2026-06-19: **AP batch 8 ingested (test):** 9 guides (+ **`fortune-link`** skipped — no AP thresholds in sources). Slugs: `firecano-freeze-firecano-glory`, `firelight-eruption`, `fortune-disc`, `fortune-finders-mermaid-s-pearl-hidden-riches`, `fortune-garden-fu-blossom`, `fortune-lanterns`, `fortune-magnet`, `fortune-owl`, `fortune-rooster`. Payloads **`scripts/lib/apGuideBatch8Payloads.mjs`**. Pre-ingest backup **`2026-06-19T09-34-50-678Z-all-published.json`**. Ryan form pass pending.
- 2026-06-19: **Guide backup/restore scripts:** **`npm run ap-guide:backup`** + **`npm run ap-guide:restore`** (`scripts/ap-guide-restore-test-guides.mjs`) — full DB snapshot undo after bad ingest.
- 2026-06-19: **AP batch 7 ingested (test):** 10 guides — `egyptian-stars`, `electro-max`, `elephant-king`, `epic-fortunes-blast-chance-power-peach`, `extreme-wild-lanterns`, `extreme-wild-stars`, `fairy-hollow`, `farmville`, `farmville-golden-harvest`, `fat-fortunes-fat-cat-puffy-penguin-jelly-jams`. Payloads **`scripts/lib/apGuideBatch7Payloads.mjs`** (no Where to find; plain **How to check** header). Pre-ingest backup **`2026-06-19T04-50-01-247Z-all-published.json`**. Ryan form pass pending.
- 2026-06-19: **AP guide voice audit (91 published on test):** full slug list + **`RYAN_EDITED_VOICE_AUDIT`** in **`scripts/lib/apGuideVoiceRules.mjs`** — distilled from live form edits (Primary play / heuristic / sister-card skins, no 3oak, WTF omit rules). **How to check** header = plain **`## 🔍 How to check`** (no `(quick/easy)`). Snapshot: **`ap-guide-workspace/_guide-backups/*-ryan-voice-audit-all-published.json`**. No ingest.
- 2026-06-17: **Test = prod (guides):** **`AGENT_RULE_TEST_IS_PROD`** in **`AGENTS.md`** — no agent ingest/batch/patch to test without Ryan's explicit ask; backup script before approved batches. **`runSlotGuideIngest`** preserves existing **`thumbnail_url`** when no new hero file (fixes silent hero wipe on re-ingest).
- 2026-06-17: **AP batch synth — omit Where to find:** batch payloads leave **`where_to_find`** empty; Ryan fills via **`/slot-guide-form`**. Card hides empty section (**`guideMarkdownForDisplay`**). Voice rules + **`_batch-progress.json`** updated.
- 2026-06-10: **Slot-guide-form Delete:** admin **Delete guide** in edit mode (confirm modal; removes **`guides`** + **`machines`** + optional **`content_access_gates`**; R2/Storage untouched). Requires **`20260610180000_guide_admin_delete_rls.sql`** on test.
- 2026-06-10: **Drop legacy IGT MHB guide:** migration **`20260610230000_drop_legacy_must_hit_by_igt.sql`** removes duplicate **`must-hit-by-igt`** guide + machine (canonical **`igt-must-hit-by`**). Apply on test.
- 2026-06-10: **Slot-guide-form Save (machines RLS):** migration **`20260610220000_guide_admin_write_rls.sql`** — admin INSERT/UPDATE on **`machines`** + **`guides`**, SELECT unpublished guides. Required on test before **Save changes** (DELETE was **`20260610180000`** only). **`supabase/guide_admin_rls.sql`** updated to match.
- 2026-06-10: **Content lock switches + guide Delete — admin only:** **`App.jsx`** **`isAdminRole`** is **`admin`** only (moderators no longer see calc/guide lock toggles or guide Delete). **`content_access_gates`** write RLS stays admin-only (**`20260526150000_content_access_gates.sql`**).
- 2026-06-10: **Play Logbook — Buffalo Diamond primary template:** migration **`20260610190000_play_log_buffalo_diamond_template.sql`** — system template **`buffalo-diamond`** (`green_fg` / `blue_fg` / `gold_fg` + calc snapshot fields); **`playLogMetrics.js`** fallbacks; **Log play in Logbook** pre-fill from **`BuffaloDiamond.jsx`**. Apply on test before smoke.
- 2026-06-10: **Public guide heroes → R2 (test):** **`scripts/backfill-public-guide-heroes-to-r2.mjs`** uploaded 12 fallback heroes + 3 inline **`/guides/`** assets to R2; all test **`guides.thumbnail_url`** now remote (no code-fallback heroes left except global buffalo placeholder).
- 2026-06-09: **Guide Bankroll section:** **`## 💰 Bankroll on hand`** is its own markdown block (between How to check and Risk & Warnings); form field split out of Risk summary. Legacy inline **`**Bankroll on hand:**`** in Risk still parses on Load. Migration: **`node scripts/migrate-guide-bankroll-section.mjs`** on test. All test guides verified R2 heroes + inline URLs; calculator icons at **`public/calculators/`**; hero fallbacks removed from **`GuidesScreen`** / **`GuideCardPreview`**. Docs updated (**`README.md`**, backlog, **`AGENTS.md`**, **`WAKEUP`**). Legacy **`npm run slots:sync:*`** scripts remain for local manifest replay only.
- 2026-06-10: **AP Guide form-first workflow:** **`/slot-guide-form`** is primary editor — Supabase + R2/Storage source of truth; **`parseGuideMarkdown`** keeps embedded images on Load; shared **`buildGuideMarkdown`** + WebP uploads on Save/Ingest; **Diagrams** on edit.
- 2026-06-08: **AP Guides admin Delete (`GuidesScreen`):** admin-only **Delete** on guide card hero + confirm modal removes **`guides`** + **`machines`** (+ optional **`content_access_gates`**) on test; does not delete R2/Storage assets. Apply **`20260610180000_guide_admin_delete_rls.sql`** on test before use.
- 2026-06-08: **AP guide docx pilot + sync workflow (on `test`):** drop **`AP-*.docx`** + **`Review-*.docx`** in **`Slots/_ingest/`** → synthesize **`Slots/<slug>/guide.md`** + **`card.meta.json`** → **`npm run slots:sync:test -- --slug=<slug>`** publishes **`guides.content_markdown`** (app reads DB; git commit for source of truth, not required for test copy). **`coin-kingdom-aztec`** first pilot @ **`132ec95`** / **`102cec1`**. See backlog **AP Guide editor** § docx workflow.
- 2026-06-08: **Guide card popularity display (`test`, `a3a20b7`):** collapsed tile always shows **`machines.popularity`** tier; **`popularity_summary`** no longer overrides label.
- 2026-06-08: **Voice rule — no em dashes (`a3a20b7`):** `.cursor/rules/no-em-dashes.mdc` + **`AGENTS.md`**; prefer **`...`** over spaced hyphens for breaks.
- 2026-06-08: **Guide Where to find section (`102cec1`):** optional **`## 📍 Where to find`** markdown block after Risk & Warnings (before Skins) in **`buildGuideMarkdown`** / slot-guide-form; Coin Kingdom Aztec seeded with Vegas + regional table.
- 2026-06-08: **Guide cards — `vegas_availability` → `popularity` (`132ec95`):** migration **`20260610170000_machines_popularity_rename.sql`** renames column; all **`Slots/*/card.meta.json`**, sync/ingest, **`GuidesScreen`**, **`GuideCardPreview`**, **`slot-guide-form`** updated. **Apply SQL on test/prod before client that selects `popularity`.**
- 2026-06-08: **Slot-guide-form scroll fix (`132ec95`):** **`LoginGate`** **`h-dvh overflow-y-auto`** scroll shell — expanded live card preview no longer traps page scroll under global **`html/body overflow:hidden`**.
- 2026-06-08: **Lounge market idle poll + cashtag cleanup (`132ec95`, client):** **`loungeMarketPollActivity.js`** gates feed/modal polls when idle; removed inline **`$`** cashtag autocomplete; stocks **`batch_rolling`** only during US regular session.
- 2026-06-07: **Lounge market instrument registry (`e85bf97`, pending deploy/smoke):** migration **`20260610160000`** — **`market_instruments`**, **`coin_id`**, client embed batch + live modal mcap. **Apply SQL + redeploy `lounge-market-data` + client.**
- 2026-06-07: **Lounge market idle poll gate (client, `test`):** feed **`batch_rolling`** (90s) and quick modal rolling **`modal_series`** (60s) skip while user idle (~90s no pointer/scroll/key), tab hidden, or Lounge tab inactive; one refresh on next interaction. **`loungeMarketPollActivity.js`**. Client-only.
- 2026-06-07: **Lounge cashtag inline autocomplete removed (client, `test`):** dropped **`$` typeahead** (`loungeCashtagAutocomplete.js`, **`LoungeCashtagDropdown.jsx`**) — charts via caption **`$TICKER`** auto-attach on post/save or **composer toolbar chart sheet** + pills. Client-only.
- 2026-06-07: **Lounge feed stock poll gated to regular session (client, `test`):** **`LoungeMarketFeedContext`** skips **`batch_rolling`** for stocks whenever US regular session is closed — mount + 90s interval (removed **`includeStocksWhenClosed`**). After-hours stock minis use attach embed snapshot only. Client-only deploy.
- 2026-06-07: **Lounge market mcap hot/cold split (code on `test`, pending deploy):** registry 7-day cache serves **cold** metadata only (name, logo, exchange, `coin_id`) — **`market_cap_usd` not used** from registry on modal. **`modal_series`** returns live **`market_cap`** (`fetchLiveMarketCapUsd`: CG `simple/price` + `coin_id` for crypto, Yahoo for stocks). **`LoungeMarketChartModal`** shows **`liveMarketCap`** from series response. Redeploy **`lounge-market-data`** + client with registry pack.
- 2026-06-07: **Lounge market instrument registry + coin_id (code on `test`, pending deploy):** migration **`20260610160000`** — **`market_instruments`** table (seed top crypto `coin_id`, lazy upsert on attach). Embeds store **`coin_id`** + **`metadata_as_of`**; **`batch_rolling`** / **`modal_series`** accept **`coin_id`**; registry metadata cache (&lt;7d) skips profile on modal; static **`COINGECKO_COIN_ID_BY_TICKER`** map skips CG **`/search`** on OHLC. Client reconciles legacy `$BTC`-as-stock embeds. **Apply SQL + redeploy `lounge-market-data` + client.**
- 2026-06-07: **Lounge market CoinGecko P0 quota cut (code on `test`, pending deploy):** **`buildRollingBatchPayload`** skips **`finnhubProfile`** on rolling refresh (quote + mini bars only; attach embed keeps name/logo/mcap). **`coingeckoCryptoOhlcCandles`** / Advanced OHLC skip **`interval=hourly`** when **`days=1`** (stops guaranteed 400 + retry on 24h mini). Client **`LoungeMarketFeedContext`** — mount uses **`includeStocksWhenClosed`** without **`forceRefresh`** so **`market_quote_cache`** applies on poll 2+. **Redeploy `lounge-market-data` + client on test**; re-smoke with Console log HUD (`batch_rolling` CG calls should drop ~4→~2 per crypto symbol per refresh).
- 2026-06-07: **Ryan sign-off (test) — Lounge market + thread batch:** **`lounge-market-data`** redeployed + smoked — `$AAPL` auto-attach → real Apple chart (not Ondo); Advanced snapshot PNG (EDGE wordmark left, company centered, floating legend). **Thread SQL** **`20260608140000`**–**`20260608210000`** applied on test. **Thread compose UX** (`8b7d1d2`→`8b32619`) — keyboard toolbar, split image/video, retry restores all part media, no load crash — **PASSED**. **Deferred:** thread compose iOS — options bar behind keyboard after media pick (parked).
- 2026-06-09: **Lounge market snapshot EDGE branding snapshots-only (code on `test`, `7dd4d3e`):** PNG header keeps **EDGE wordmark left** + centered company logo/name/ticker + price/% right; **removed** EDGE from live **Advanced** + Quick sheet headers (`LoungeMarketChartModal.jsx`). Client-only.
- 2026-06-09: **Lounge auto cashtag → real stock (code on `test`, `1ff6262`):** **`resolveCashtagTicker`** tries **`yahooResolveUsEquityCashtag`** before search; fallback **`pickBestCashtagSearchResult`** deprioritizes Ondo/xStock tokenized rows. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market Advanced visible-window quote (code on `test`, `4b91201`):** header price = close of rightmost visible candle; **% change** vs open of leftmost visible candle; updates on pan/zoom + pan-release refresh (`loungeMarketChartPriceRange.js`, `loungeMarketChartTypes.js`). Client-only.
- 2026-06-09: **Lounge market snapshot legend + modal logos (code on `test`, `fa7e3e9`):** snapshot uses **floating on-chart indicator legend** (matches Advanced); **`MarketEmbedLogo`** drops `crossOrigin` on modal `<img>` (fixes broken Finnhub/Yahoo logos); wider snapshot company name. Client-only.
- 2026-06-09: **Lounge market draggable annotation text + snapshot logo proxy (code on `test`, `7ba93ec`):** text labels draggable before/after commit, double-click edit; snapshot company logo via Edge **`logo_image`** + **`loungeMarketLogoImageBlob`**. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market chart annotation text + snapshot header (code on `test`):** Annotate **Text** — live preview, drag before/after commit, double-click edit; snapshot header drops centered date range, adds visible-window price/%, **company logo** via Edge **`logo_image`** proxy (`loungeMarketChartSnapshot.js`, `LoungeMarketChartAnnotationOverlay.jsx`, `lounge-market-data`). **Redeploy `lounge-market-data` on test** before logo smoke.
- 2026-06-09: **Lounge market modal Advanced toolbar layout (code on `test`):** chart controls docked to **bottom** of Advanced fullscreen (menus open upward); indicator **Legend** reverts to floating on-chart card (replaces full-width legend sub-row). Client-only (`LoungeMarketChartModal.jsx`).
- 2026-06-09: **Lounge market modal snapshot branding (code on `test`):** Snapshot PNG header — **EDGE wordmark left**, company logo + name + `$TICKER` **centered**, price/% **right**; floating **indicator legend** composited on chart (`loungeMarketChartSnapshot.js`). Live modal headers unchanged (no EDGE). Client-only.
- 2026-06-09: **Lounge market modal snapshot save (code on `test`):** Advanced **Snapshot → Save to Photos** (iOS/Android native share sheet → **Save Image**) or **Save image** download on desktop; replaces clipboard PNG copy (unreliable on mobile). **Add to post** unchanged. Client-only (`loungeMarketChartSnapshot.js`).
- 2026-06-09: **Lounge market modal Advanced chart annotation (code on `test`):** **Annotate** toolbar — **Pen** + **Text** pins, **Undo** / **Clear**, **Done** exits; chart pan/zoom frozen while annotating; ink merged into **Snapshot** PNG (save / Add to post). Client-only.
- 2026-06-09: **Lounge market modal snapshot ticker header (code on `test`):** Advanced **Snapshot → Capture image** PNG composites **company name + $ticker** band above LWC chart canvas (theme-aware). Client-only.
- 2026-06-09: **Lounge market modal chart capture (code on `test`):** **Capture image** menu on **Advanced** chart toolbar — **Copy image** (clipboard PNG via LWC `takeScreenshot`) or **Add to post** (composer image attach). Client-only.
- 2026-06-09: **Lounge market modal chart types expanded (code on `test`):** Advanced chart-type dropdown adds **Line**, **Hollow candles** (outline bodies), and **Heikin Ashi**; prefs still **`loungeMarketChartType:v1`**. Client-only.
- 2026-06-09: **Lounge market modal Advanced time axis (code on `test`):** resolution-aware tick labels (1H/2H/4H date-only; 1m/5m/15m stepped intraday + day switchover); **30m** resolution removed. Client + Edge README.
- 2026-06-09: **Lounge market modal Advanced 1m RTH fix (code on `test`):** stock **1m/5m/15m/30m** resolution loads **Yahoo RTH sessions** (not truncated Finnhub ~75 bars); pan-back walks prior sessions; Yahoo **`maxBars` 500** for resolution fetch. **Redeploy `lounge-market-data`**. Client + Edge.
- 2026-06-09: **Lounge market modal Advanced resolution loading (code on `test`):** Advanced drops timeframe pills — **resolution picker** only (`1m`…`Weekly`, default **Daily ~280 bars**); **`modal_series` + `resolution` + `bar_limit`** with **200-bar** pan-back chunks and per-resolution max lookback; Quick sheet keeps **1H/1D/1W/…** pills. **Redeploy `lounge-market-data`**. Client + Edge.
- 2026-06-09: **Lounge market modal CoinGecko crypto OHLC (code on `test`):** crypto Finnhub miss → CoinGecko **`/coins/{id}/ohlc`** (hourly when **`COINGECKO_API_KEY`** set); close-only **`market_chart`** fallback if OHLC fails. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market modal real OHLC candles (code on `test`):** Yahoo + Finnhub parsers keep **o/h/l/c/v** on **`MarketBar`**; bucket aggregation preserves OHLC; client uses real wicks when present (synthetic fallback for quote-only / close-only bars). **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge Admin utils Console log HUD (code on `test`):** Settings toggle → floating bottom-right log window (like Video debug HUD). Client-only.
- 2026-06-09: **Lounge market modal Advanced pan history overlap (code on `test`):** stock 1H/1D pan-back uses prior **RTH session** (not calendar 24h); client filters duplicate bars + **`history overlap exhausted`**. **Redeploy `lounge-market-data`**. Client-only.
- 2026-06-09: **Lounge market modal Advanced pan freeze fix (2) (code on `test`):** history loader **ack** after prepend stops immediate re-fetch loop; skip history while panning; defer heavy apply off pointer-up. Pan/history **`[marketChartPan]`** logs when HUD on. Client-only.
- 2026-06-09: **Lounge market modal Advanced pinch zoom (code on `test`):** Advanced fullscreen enables LWC **pinch** on time scale (pan unchanged); double-tap plot resets time zoom; price axis keeps custom drag/wheel zoom. Client-only.
- 2026-06-09: **Lounge market modal Advanced pan + history (code on `test`):** Advanced chart **drag-to-pan** (no scrub); panning left loads older bars via **`modal_series` + `before_sec`**. **Redeploy `lounge-market-data`**. Client + Edge.
- 2026-06-09: **Lounge market modal Advanced fullscreen (code on `test`):** **Advanced** opens landscape fullscreen — defaults to **Candles** + **volume** histogram pane; modal sheet keeps gradient **area** + **H/L/current** gutter. **Redeploy `lounge-market-data`** for Yahoo **`volume`** on bars. Client + Edge.
- 2026-06-09: **Lounge market modal Quick / Advanced view (code on `test`):** **`LoungeMarketChartModal`** **Advanced** fullscreen — grid, **LWC time + price axes** (timeframe-aware tick labels), Area/Candles, indicators, timeframe dropdown, pan, true crosshair, TV logo. Client-only.
- 2026-06-09: **Lounge market modal chart pan (code on `test`):** long-press ~450ms on plot then horizontal drag **pans** time scale; tap/slide keeps **scrub** (header price + crosshair). Client-only.
- 2026-06-09: **Lounge market modal indicator legend (code on `test`):** Indicators dropdown + on-chart overlay show color legend (BB/MACD sub-lines); selector rows include swatches. Client-only.
- 2026-06-09: **Lounge market modal chart types (code on `test`):** modal **Area / Candles** dropdown (prefs **`loungeMarketChartType:v1`**); feed minis unchanged sparkline. Candles use synthetic OHLC from close-only bars. Client-only.
- 2026-06-09: **Lounge market modal 3M daily (code on `test`):** modal **3M** pill → **`window_key: 3m`**; Edge **`resolveStockQuarterlyBars`** — Yahoo **`range=3mo`** daily (~64 bars). **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market modal 1W/1M intraday (code on `test`):** **1W** locked at **15m** (`resolveStockWeeklyBars`); **1M** uses **2h** candles aggregated from Yahoo **1h**/`1mo` (`resolveStockMonthlyBars`) — rejects sparse daily fallbacks. **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge market modal chart indicators (code on `test`):** **`LoungeMarketChartModal`** — toggle pills for **SMA 20/50/200**, **EMA 9/21**, **Bollinger 20**, **RSI 14**, **MACD** (Lightweight Charts overlays + oscillator panes); prefs in **`localStorage`** **`loungeMarketChartIndicators:v1`**. Client-only — no Edge redeploy.
- 2026-06-06: **Lounge stock charts cache + modal sync (code on `test`):** reject synthetic diagonal **`market_quote_cache`** payloads for stocks; feed initial load sends **`refresh: true`**; minis + modal share **`pickRollingMarketPayload`** / **`isUsableStockIntradayBars`** (RTH span check); modal 1D reads feed live quotes + **`modal_series`**; Edge walks back prior sessions on Yahoo miss. **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge stock charts on closed market days (code on `test`):** rolling **1D** no longer synthesizes a diagonal line when Finnhub/Yahoo return sparse calendar-24h data — Edge **`resolveMarketBars`** serves **last regular session** (9:30–16:00 ET) bars for stocks when RTH is closed; **`synthesizeBarsFromQuote`** remains crypto-only fallback. Feed/modal **skip stock polling** when session closed; **`market_quote_cache`** uses 7d TTL for stock rolling payloads off-hours. Shared **`usEquityMarketSession`** (holidays deferred). **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge market modal posts + market embeds (code on `test`):** **`lounge_search_cashtag_posts`** now matches posts with **`market_embeds`** for the ticker (picker-only charts without `$TICKER` in caption) plus caption cashtags; modal surfaces RPC errors instead of silent empty. Migration **`20260609150000_lounge_search_cashtag_market_embeds.sql`** (requires **`20260609140000`**). **Apply both on test if modal Top/Latest is empty.**
- 2026-06-06: **Lounge market chart light mode (code on `test`):** mini cards + modal sheet use **inverted zinc tokens** (`text-zinc-50`, `bg-zinc-950`) so titles/prices/news read on white; fixes washed-out `text-zinc-900` / dark mini cards from wrong literal light classes.
- 2026-06-06: **Lounge market picker search enrich fix (code on `test`):** restore **Finnhub logo** fallback when Yahoo chart omits it; compute **% change** from `chartPreviousClose`; cap duplicate foreign listings (max 2 per root ticker). **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge market picker search sort (code on `test`):** `$AAPL` exact US stock ticker ranks first — removed crypto-first merge for 1–6 letter queries; relevance score deprioritizes Ondo/xStock/tokenized crypto. **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge market picker rich search rows (code on `test`):** cashtag dropdown + symbol sheet show **name, ticker · exchange · mcap, price, % change** on `search` — stocks via **Yahoo chart** (no Finnhub quote/profile per row), crypto via **CoinGecko batch `/simple/price`**, 45s Edge cache. **Redeploy `lounge-market-data`.**
- 2026-06-06: **Lounge crypto market cap on embeds (code on `test`):** CoinGecko **`/simple/price`** USD market cap on crypto attach/preview/modal; stocks fall back to Yahoo **`marketCap`** when Finnhub profile omits cap. **Redeploy `lounge-market-data`; re-post to refresh existing embeds.**
- 2026-06-06: **Lounge market historical mini-chart date labels (code on `test`):** caption windows like "last week" show **UTC date range** on feed mini charts (e.g. `May 24 – 30` same month, `May 30 – Jun 6` cross-month) instead of `1W` or a single day — uses caption window span when bar data is same-day; client + server. **Redeploy `lounge-market-data` for new attaches.**
- 2026-06-06: **Lounge market modal strict cashtag posts (code on `test`):** modal Top/Latest uses **`lounge_search_cashtag_posts`** (literal `$TICKER` word boundaries) instead of fuzzy **`lounge_search`** — fixes `$AMD` matching unrelated sector posts / `$ASMLON` matching gibberish via pg_trgm. Migration **`20260609140000_lounge_search_strict_cashtag.sql`**. **Apply on test.**
- 2026-06-06: **Lounge market modal news fallback (code on `test`):** Finnhub `/company-news` failures (403/empty on major tickers like AMD) no longer show a false empty state — try/catch + **30d** window + newest-first sort, then **Yahoo search news** fallback. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market attach Finnhub 403 fix (code on `test`):** Edge **`yahooMarket.ts`** now falls back for stock **quote/profile/FX** when Finnhub returns **403** (e.g. `$TSM`); **`attach`** skips failed tickers (partial embeds + `warnings`) instead of 502; client **`syncMarketEmbedsAfterPostSave`** no longer fails publish when charts fail. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market embed max 12 (code on `test`):** per-post chart/cashtag attach cap **6 → 12** — **`LOUNGE_MARKET_EMBED_MAX`**, Edge **`MARKET_EMBED_MAX`**, migration **`20260609130000_lounge_market_embeds_max_12.sql`**. **Apply migration on test; redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge market chart modal bottom sheet (code on `test`):** **`LoungeMarketChartModal`** — rounded sheet (~92vh), logo/name/MC header, large price + change line, gradient area chart, **1D/1W/1M/1Y/ALL** pills, **Latest news** bullet (Edge **`modal_news`** → Finnhub company-news / crypto news), **Top/Latest** Lounge posts via **`lounge_search`**. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge auto market charts from cashtags (code on `test`):** on attach, Edge resolves `$TICKER` in caption via search (max 6); explicit picker rows override auto for same ticker. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge stock sparklines via Yahoo fallback (code on `test`):** Finnhub free tier blocks many **`/stock/candle`** calls → **`yahooMarket.ts`** daily/intraday OHLC for 1W/historical embeds; quote/% synced from bar series. **Redeploy `lounge-market-data`; re-post to refresh frozen embeds.**
- 2026-06-09: **Lounge market attach hardening (code on `test`):** attach errors surface Finnhub/DB message (not generic); **`market_embeds` migration hint**; chart attach moved **after** thread/link publish so a chart failure no longer rolls back the post; empty candle fallback from quote. **Apply `20260609120000` on test if attach 502s.**
- 2026-06-09: **Lounge crypto search via CoinGecko (code on `test`):** Finnhub `/search` is stock-heavy — **`marketSearch`** merges CoinGecko crypto rows (`BINANCE:BTCUSDT`, logos) with Finnhub stocks for cashtag + picker. **Redeploy `lounge-market-data`.**
- 2026-06-09: **Lounge crypto logos via CoinGecko (code on `test`):** Edge **`coingeckoMarket.ts`** — `/search` by base ticker (BTC from `BINANCE:BTCUSDT`); logos on cashtag dropdown, picker preview, and **`market_embeds.logo_url`**. Secret **`COINGECKO_API_KEY`** (demo API header) optional but recommended on test. **Redeploy `lounge-market-data` after pull.**
- 2026-06-09: **Lounge cashtag chart autocomplete (code on `test`):** feed composer + post edit — type `$AAPL` → Finnhub search dropdown (same attach list as chart picker); pick completes cashtag + adds cyan **`$TICKER`** pill (max 6); still requires Post/save for Edge attach. Files: **`loungeCashtagAutocomplete.js`**, **`LoungeCashtagDropdown.jsx`**, **`LoungeComposerMarketSymbolPills.jsx`**, **`SocialFeed.jsx`**.
- 2026-06-09: **Lounge market chart embeds (code on `test`, validated):** migration **`20260609120000_lounge_market_embeds.sql`** — `community_feed_posts.market_embeds jsonb` (max 6) + **`market_quote_cache`**. Edge **`lounge-market-data`** (Finnhub proxy: search, preview, attach, batch rolling, modal series) + **`FINNHUB_API_KEY`**; crypto logos via **CoinGecko** + optional **`COINGECKO_API_KEY`**. Client: composer **chart** picker (**`LoungeMarketSymbolPickerSheet`**), feed mini strip (**`LoungeMarketChartStrip`** + **`LoungeMarketFeedContext`** ~90s rolling refresh), full-screen modal (**`LoungeMarketChartModal`** + Lightweight Charts), post submit/edit attach via **`loungePostSubmitJob.js`**. OG: **`api/lounge-market-og.js`** + **`lounge-post-og.js`** prefers market SVG when embeds present. Ryan sign-off **PASSED** on **test** (2026-06-07) — see smoke **§22**.
- 2026-06-05: **Chat dark-mode glass neutralized (code on `test`, `a9a936c`):** **`index.css`** — dark chat glass/gradients from navy tint to zinc-950/900. **Blast radius:** **`chat-header-glass`** also styles lounge **image/GIF** lightbox nav (**`LoungeStreamVideoLightboxChrome.jsx`**); Stream video hero pills unchanged (`bg-black/40`). Light mode untouched. Smoke: dark chat composer/header/menus; lounge image lightbox back/carousel buttons — no blue cast.
- 2026-06-05: **Chat YouTube embed polish (code on `test`, `41e0f4c`):** **`YouTubeChatEmbed.jsx`** — always-on iframe (no thumbnail double-tap), no duplicate URL row; short caption + YouTube keeps full card width (**`CHAT_YOUTUBE_EMBED_WIDTH_CLASS`** in **`youtubeEmbed.js`**, column widen in **`ChatBubble.jsx`**).
- 2026-06-05: **Chat video prep chasing-arc spinner (code on `test`, `92af3d3` → `940185b`):** **`ChatVideoPrepBubble.jsx`** + **`chatRouletteChasingArc.js`** — roulette wheel + two-lap forward-only chasing arc (rAF, no per-frame React state); **`906ae34`** keeps optimistic bubble at pick time (`clientCreatedAt` — redeploy **`lounge-chat`** if peer order wrong). Asset **`public/roulette-spinner.png`**. Reference GIFs local-only (not committed).
- 2026-06-05: **Fix publish-from-draft deletes live Stream videos (code on `test`):** after successful publish, **`deleteLoungePostDraft(..., { retainStreamAssets: true })`** — was calling **`deleteCfStreamOrphanAsset`** for every uid on the draft row, including uids just inserted into **`community_feed_posts`** / **`feed_comments`**, so thread part videos showed black tiles. User-initiated draft delete still cleans orphans. Smoke: multi-part thread draft with videos → **Post all** → playback in post detail.
- 2026-06-05: **GIF-only reply blocked on test (Ryan):** `feed_comments_body_len` — **`20260608140000`** requires `body >= 1` char; GIF-only replies insert empty `body` + `media_url`. **Fix:** apply **`20260608180000_feed_comments_thread_part_media_body.sql`** on test (restores media-or-body check). Client now surfaces migration hint in **`loungeCommentSubmitJob.js`** on this constraint. Smoke: post-detail reply with GIF only, no text → succeeds after `180000`.
- 2026-06-05: **Lounge thread post-detail display (code on `test`, Ryan sign-off):** **`LoungePostThreadPartsHierarchy.jsx`** — compose-style avatar rail; measured badge-bottom → next-avatar-top connectors (8px pad); no OP→part-2 line; final part **lv-red** digit+ring on gray pill; **`LoungePostCommentThread.jsx`** `hideAvatar` + thread parts removed from root comment list. **`bodyTextWithLinkPreview`** — strip URL text from caption/body whenever link preview card shows (feed, detail, chat). Smoke **PASSED** on test (Ryan).
- 2026-06-09: **Lounge thread compose UX polish (code on `test`, `8b7d1d2` → `8b32619`):** **`LoungeThreadComposeSheet.jsx`** — X-style mobile UI (category pills, avatar connector lines, part numbers, gray past parts, keyboard-docked glass toolbar + **glass title bar** in **`index.css`**); active part pinned above toolbar on scroll/keyboard (`useLoungeKeyboardOverlapPx` + ResizeObserver). **`LoungeComposerMediaToolbar.jsx`** — **split image / video** pickers on **all** lounge composers (feed, thread, post edit, comment, comment edit, quote); image/video/GIF taps **blur** caption (thread compose does not re-open keyboard after media/GIF pick). **`loungePostSubmitJob.js`** + **`SocialFeed.jsx`** — preserve **all part media** on post failure + retry/resume; **`ad8b0ca`** fixes **`handleDetailCommentEditMediaInputChange`** TDZ crash on load; empty feed caption → thread opens with **2 parts** but focus stays on **part 1** (`8b32619`). Ryan sign-off **PASSED** on **test** (2026-06-07) — see smoke **§23**; iOS options-bar/keyboard overlap **deferred**.
- 2026-06-08: **Lounge thread failure recovery (code on `test`, `24dedcb`):** failed thread publish restores compose with images/GIF/video per part (not text-only draft); partial publish resume via submit-job snapshot. Smoke with mid-upload failure + **Retry**. *(Superseded 2026-06-09: **atomic thread publish** — prepare all parts first, then insert root + all `feed_comments` together; rollback root on publish failure; no partial feed state / no resume snapshot.)*
- 2026-06-09: **Lounge atomic thread publish (code on `test`):** **`loungePostSubmitJob.js`** — upload/prepare **all** thread parts (root + 2+) before any DB insert; publish phase inserts root then pre-built comment rows; deletes root (cascade) + CF orphans on publish failure. **`SocialFeed.jsx`** — failure always restores **full** thread in compose for Retry (no `threadPublishedParts` slice). Smoke: 3+ part thread with video on part 2 or 3 — kill network mid-encode → Retry → full thread intact; feed must show **no** partial thread.
- 2026-06-09: **Lounge thread parallel video prep (code on `test`):** **`prepareAllThreadContinuationParts`** — parts 2+ upload/encode **in parallel** (aligned with multi-post submit queue); starts alongside root part media prep. Upload bar: `Preparing parts 2–N (parallel)`. Smoke: 5-part thread with video on parts 2–4 — faster prepare vs serial; same videos succeed as when queued as separate feed posts.
- 2026-06-08: **Lounge thread polish (code on `test`):** GIF-only thread parts no longer double-render (`gif_url` only); thread parts editable via comment ⋯ menu; **Quote** repost on thread parts (`20260608190000_lounge_comment_quote_repost.sql` — apply on test); thread submit upload bar uses **`mediaPrep`** chrome with per-part **Encoding / Uploading / …** status. Smoke: 6-part thread with GIF on last part; edit a part; quote-repost a part.
- 2026-06-09: **Lounge thread draft full media persistence (code on `test`):** migration **`20260608210000_lounge_post_drafts_thread_part_media.sql`** — root **`stream_*`** + **`thread_part_media jsonb`** (per-part images/GIF/Stream for parts 2+). Client **`loungePostDraftApi.js`** uploads all part images + persists ready Stream UIDs/posters; **`deleteLoungePostDraft`** cleans CF orphans on **user discard** only (`retainStreamAssets` after publish — do not delete Stream uids now referenced by live feed rows); single-post drafts save video too. **Apply `210000` on test before smoke.** Smoke: 3-part thread with image on part 2 + video on part 3 → save draft → reopen → all media restored → **Post all** → videos play in post detail; delete draft from sheet (no publish) → Stream orphans removed.
- 2026-06-08: **Lounge thread per-section media (code on `test`):** **`LoungeThreadComposeSheet`** — images/GIF attach to whichever thread section is focused (footer media/GIF targets active part); carousel per section; **video on any section** with per-part inline prep bar + sequential encode queue (`loungeThreadComposeVideoPrep.js`). Submit: **`loungePostSubmitJob.js`** uploads images/Stream per part 2+ into **`feed_comments`**. Migration **`20260608180000_feed_comments_thread_part_media_body.sql`** — restores media-or-body check on **`feed_comments`** under 320 cap. **Apply `180000` on test before smoke.**
- 2026-06-08: **Lounge thread feed timeline repair (code + SQL on `test`):** migration **`20260608170000_lounge_thread_feed_timeline_repair.sql`** — deletes legacy **`community_feed_posts`** continuation rows; re-asserts **`lounge_feed_posts_page`** `thread_root_id is null` filter. Client **`filterLoungeFeedTimelinePosts`** in **`AppShell`** + profile posts query. **Apply `170000` on test and refresh feed** to collapse multi-row threads to one root card; open detail for parts 2+ as **`feed_comments`**.
- 2026-06-08: **Lounge thread drafts restore to thread compose (code on `test`):** migration **`20260608160000_lounge_post_drafts_thread_captions.sql`** — **`thread_captions text[]`** on **`lounge_post_drafts`**; save/load all parts; opening a thread draft launches **`LoungeThreadComposeSheet`**. **Apply after `20260608140000` on test before smoke.**
- 2026-06-08: **Lounge thread parts as feed_comments (code on `test`):** migration **`20260608150000_lounge_thread_parts_as_feed_comments.sql`** — parts 2+ insert into **`feed_comments`** with **`is_thread_part`** / **`thread_part_index`** (full like/repost/bookmark/reply per section); excluded from post **`comment_count`**; migrates legacy continuation **`community_feed_posts`** rows. Requires **`20260608140000`** first. Client: **`loungePostSubmitJob.js`** inserts thread parts as comments; **`LoungePostCommentThread.jsx`** renders thread parts as **`LoungeCommentCard`** rows above sorted roots. **Apply `20260608150000` on test before smoke.**
- 2026-06-08: **Lounge caption 320 chars + post threads (code on `test`):** client **`LOUNGE_CAPTION_MAX`** / **`LOUNGE_COMMENT_BODY_MAX`** = 320 in **`loungeCommentLimits.js`**; **`LOUNGE_POST_THREAD_MAX_PARTS`** = 25; feed composer **Start thread** → **`LoungeThreadComposeSheet`**; feed badge **Thread · N parts**; post detail thread parts via **`feed_comments`** (see **`20260608150000`**). Migration **`20260608140000_lounge_caption_320_post_threads.sql`** — cap 320 on posts/comments/drafts; **`thread_part_count`** on root; feed RPC hides legacy continuation posts. Supersedes **`20260608120000`** (1000-char cap) if applied. **Apply `20260608140000` then `20260608150000` on test before smoke.** *(Per-part media in compose — see **20260608180000** + **2026-06-09** UX row.)*
- 2026-06-08: **Lounge caption + comment body max 1000 chars (superseded by 320 + threads):** migration **`20260608120000_lounge_caption_comment_max_1000.sql`** — skip if **`20260608140000`** applied instead.
- 2026-06-04: **Chat R2 video pipeline smoke — Ryan sign-off:** encode + R2 upload + bubble render confirmed working on iPhone (iOS 18.7 Safari). 102 MB .mov → 6.6 MB MP4 in ~36 s; video landed in chat bubble; native `<video>` playback. Fix applied: `scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2` (ffmpeg.wasm in this build does not have expression evaluator for filter args — `min(720,ih)` caused instant exit). Commits `37a5865` (filter fix) + `c805610` (debug logging). **Deploy `lounge-chat-r2-video-upload` + `lounge-chat` + migration `20260608000000` on test before promoting to prod.**
- 2026-06-07: **Group info Links tab fix (code on `test`):** migration **`20260607150000_chat_shared_links_fix_v2.sql`** — `chat_room_shared_links` now unions `link_preview->>'url'`, all `https?://` body matches, and bare-domain body matches (prior fix blocked fallback when `link_preview` was set without `url`). Client: **`ChatGroupAuxSheets.jsx`** loads media/links/docs independently so links RPC errors surface on the Links/Docs tabs. **Apply migration on test before smoke** (also supersedes **`20260607140000`** if that was applied).
- 2026-06-06: **Chat reactions Realtime (code on `test`):** migration **`20260606150000_chat_message_reactions_realtime.sql`** — publication + **`REPLICA IDENTITY`** for DELETE payloads. Client: live pill counts + silent attribution sheet refresh when others react. **Apply with `20260606140000` on test before smoke.**
- 2026-06-06: **Chat group tap-to-react + attribution sheet (code on `test`):** migration **`20260606140000_chat_message_reactions_page.sql`** — RPC **`chat_message_reactions_page`**. Client: group messages — tap emoji on pill to toggle your reaction; tap pill → **`ChatMessageReactionsSheet`** (filter chips + member list). **Apply migration on test before smoke.**
- 2026-06-06: **Chat read receipts (code on `test`):** migration **`20260606120000_chat_read_receipts.sql`** — **`profiles.chat_read_receipts_enabled`** (default on; mutual privacy); RPC **`chat_room_read_receipts`**. Client: **Delivered** / **Read** on latest own message (DM + group); **Read receipts** toggle under **Privacy** in **Chat info** (DM pill) and **Group info** (group pill). **Apply migration on test before smoke.**
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
- 2026-06-07: **Fix: comment/reply push — feed comment trigger repair:** **`20260607200000_activity_events_feed_comment_trigger_repair.sql`** — recreate `trg_activity_events_feed_comment_insert` when comments land in `feed_comments` but no `comment_on_post` / `reply_to_comment` row (no push). Edge **`lounge-send-activity-push`**: `parent_id` not `parent_comment_id` for reply copy. Apply SQL on test; redeploy Edge if reply push wording matters. Smoke: comment on another user's post → `activity_events` + push (recipient backgrounded, fresh `push_subscriptions`).
- 2026-06-07: **Fix: comment/reply push — RLS on emit trigger (test PASSED):** **`20260607210000_activity_events_feed_comment_rls_fix.sql`** — `activity_events_on_feed_comment_insert` with `set row_security = off` + direct insert; without it post-owner lookup under RLS no-ops and no push. Ryan **PASSED** on test (comment → Edge Lounge push, @bfrizzle iOS PWA).
- 2026-06-07: **Fix: all Lounge activity emitters — RLS row_security off (test PASSED):** **`20260607220000_activity_events_emitters_row_security.sql`** — `activity_events_insert_safe`, `activity_events_emit_mentions`, like/bookmark/repost/follow triggers + trigger re-assert; drops legacy 5-arg `insert_safe` overload. Ryan **PASSED** on test (like, comment, follow, mention, repost, DM — recipient backgrounded, fresh `push_subscriptions` per device).
- 2026-06-07: **Fix: Lounge push enqueue + Vault anon (test PASSED):** **`20260607190000_activity_events_enqueue_push_restore.sql`** restores vault invoke after bad **`031900`** `current_setting` path; Vault **`lounge_activity_push_supabase_anon_key`** must be legacy **`eyJ…`** anon (not `sb_publishable_…`). Diagnostic: **`scripts/diagnose-lounge-push.sql`**. Ryan **PASSED** full push smoke on test (2026-06-07).
- 2026-06-07: **Lounge push toggle UX (client):** **`useWebPushNotifications`** verifies `push_subscriptions` row for the device endpoint (auto-upsert repair when browser sub exists); Settings toggle + “Alerts enabled” hint require pref + browser sub + server row (`pushActive`). Deploy client to test/prod with push SQL promotion.
- 2026-06-08: **Lounge post drafts (server):** migration **`20260608130000_lounge_post_drafts.sql`** — table **`lounge_post_drafts`** (caption, tribes, GIF URL, uploaded **`image_urls`**, max 20/user); client **`loungePostDraftApi.js`**, **`LoungePostDraftsSheet`**, composer **Save draft** + **Drafts (N)**; publish deletes linked draft. *(Video + per-part thread media: **`20260608210000`**.)*

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

### ✅ Chat image delivery overhaul (2026-06-03, code `868cc0e`)

| Item | What was done |
|---|---|
| **Stable bubble — no destroy/replace** | Optimistic bubble for image messages now has a stable `_key` (tempId) that never changes through the temp→real ID swap. Realtime INSERT handler preserves the existing `image_urls` (blob previews) when the server row arrives with an empty array (uploads still in-flight) — media grid never collapses mid-upload. `compactBubble` is locked to `false` while `isFinalizingMedia` is true so the `useLayoutEffect` can't shrink the bubble during the upload window. |
| **Send-then-patch flow** | `chatSendMessage` fires with `imageUrls: []` + `hasPendingImages: true` immediately. The message gets a real server ID before any uploads finish. Background: all upload promises resolve → `chatUpdateMessageImageUrls` patches `image_urls` on the server. Realtime UPDATE delivers real R2 URLs to other devices. New `update_image_urls` action added to `lounge-chat` Edge (redeployed). |
| **Zero-flash blob→R2 transition** | `ChatMediaImage` component keeps showing the blob URL until the R2 URL has fully preloaded in a hidden `new window.Image()`. Only after `onload` fires does it swap `src` and revoke the blob. Grid tile `key` is array index (stable through URL change) so React never unmounts the component. Composer no longer revokes blob URLs — `ChatMediaImage` owns revocation timing. |
| **Upload reliability** | Retry loop now wraps `uploadLoungeFeedPostImage` in `try/catch` so edge-function throws (not just returned errors) are retried. Concurrency capped at 4 simultaneous uploads (was uncapped, causing spurious failures at 12 parallel presign calls). Attempts raised to 5 with 1s/2s/3s/4s backoff. |
| **DB constraint + Edge** | `chat_messages_image_urls_len` raised to 12. `lounge-chat` `send_message` slice updated to 12. New `update_image_urls` action validates sender ownership before patching. |

**Test smoke (Ryan):** send 1 image, 4 images, 12 images; verify bubble never shrinks during upload; verify delivered images match sent; verify other device sees images after patch. **Redeploy `lounge-chat` on prod when promoting.**

### ✅ Chat R2 video pipeline (2026-06-04, code `c805610`)

| Item | What was done |
|---|---|
| **New encode function** | `encodeVideoForChat()` in `src/utils/loungeVideoFfmpegTrim.js` — same ffmpeg.wasm singleton as trim; fits within 1280×720 box (`scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2` — no expression evaluator required, handles portrait + landscape), CRF 30, 900 kbps cap, 64 kbps AAC, `+faststart`. Confirmed 102 MB .mov → 6.6 MB MP4 (~94% reduction) in ~36 s on iPhone. |
| **New Edge function** | `supabase/functions/lounge-chat-r2-video-upload` — presigned PUT URL for `video/mp4`; clone of `lounge-cf-r2-direct-upload`, reuses all `_shared/loungeCfR2.ts` helpers, no new secrets. |
| **Migration** | `20260608000000_chat_messages_video_url.sql` — adds `video_url TEXT` to `chat_messages`; rebuilds `chat_messages_page` + `chat_messages_window` to include it. |
| **lounge-chat Edge** | Imports `loungeCfR2DeleteObject` + `loungeCfR2ParseObjectKeyFromPublicUrl`. `send_message` accepts `video_url`; `delete_message` best-effort-deletes R2 video and R2 poster (if from our domain) in addition to CF Stream cleanup. `reply_to_preview` now checks `video_url` as well as `stream_video_uid`. |
| **ChatComposer** | `handleCropConfirm` replaces TUS/CF Stream pipeline: lazy-import `encodeVideoForChat`, then parallel R2 upload of video + poster via `src/utils/chatVideoR2Upload.js`. No manifest poll, no `waitForCfStreamManifestReady`. `videoMeta` now carries `videoUrl` (not `uid`). |
| **chatApi** | `chatSendMessage` gains `videoUrl` param forwarded as `video_url`. |
| **ChatConversation** | `handleSend` accepts `videoUrl`; optimistic message includes `video_url`; `reply_to_preview` checks both `stream_video_uid` and `video_url`. |
| **ChatBubble** | `compactBubble` init checks `message.video_url`; `allMedia` includes `videoUrl` alongside `videoUid`; `isLinkPreviewOnly` excludes `video_url` messages. |
| **ChatMediaViewer** | New `<video>` branch: when `item.videoUrl` is set and `item.videoUid` is null, renders native HTML5 `<video controls playsInline>` instead of CF iframe. |
| **Backward compat** | All existing `stream_video_uid` messages render via CF Stream iframe unchanged. New messages set `video_url` and leave `stream_video_uid = null`. |

**Deploy steps (test):**
1. Run `supabase/migrations/20260608000000_chat_messages_video_url.sql` in SQL editor.
2. `supabase functions deploy lounge-chat-r2-video-upload`
3. `supabase functions deploy lounge-chat`
4. Deploy client (Vercel test).

**Test smoke:** send a ≤60s video in chat; verify strip shows encode % → upload; bubble appears with poster; tap → native video plays; delete message → confirm R2 objects gone from dashboard.

### 🔜 Next priorities (chat)

- Promote R2 video pipeline to prod: run `20260608000000` migration + deploy `lounge-chat-r2-video-upload` + redeploy `lounge-chat` on prod.
- Ryan sign-off on link-preview + group-delete smoke after migrations/Edge deploy on test.

### ⏳ Deferred (monitor, implement when triggered)

| # | Item | Trigger to act |
|---|---|---|
| 3 | **`last_message_at` trigger hotspot** | Measure Postgres lock wait on `chat_rooms` in production at >500 msg/min per room. Fix: batch update with 1s delay, or move to Edge function write path. |
| 4 | **Realtime `postgres_changes` → Broadcast** | Supabase dashboard shows WAL lag, OR concurrent Realtime connections approach plan limit. Fix: Edge `send_message` also publishes to a Supabase Broadcast channel; client subscribes to Broadcast instead of `postgres_changes`. ~3h work. |
| 5 | **E2E encryption** | Schema already has `content_encoding`, `body_cipher`, `nonce`, `key_version` columns. Implement when product roadmap demands it. |
