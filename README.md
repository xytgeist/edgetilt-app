# LVSlotPro

React + Vite front end for slot guides, calculators, and related tooling. Supabase backs machines, guides, and other data.

**Where things live:** Auth and session bootstrap are in **`src/App.jsx`**. The logged-in app (tabs, Lounge, Offers, etc.) is **`src/features/shell/AppShell.jsx`**, with product areas under **`src/features/*`**. Slot EV calculators ship as **`src/features/calculators/games/*.jsx`**. See **`docs/frontend-architecture.md`** for the full map.

**Keeping docs current (humans + AI):** Follow **`AGENTS.md`** — which files are canonical, when to update them, and what to capture from decisions so future sessions do not rely on chat memory.

**Access:** The app shell loads for **anonymous** visitors (Supabase anon key); use **Log in** from the sticky strip or from a feature when something needs an account. Any **successful sign-in** uses the full member shell (freemium / subscribe rules live in product docs + UI). Details: **`docs/frontend-architecture.md`** (Access model).

**Subscriber UI:** Per-user flag **`profiles.has_active_subscription`** (run **`supabase/profiles_tier_testing.sql`** on your Supabase project). Optional: **`VITE_HAS_ACTIVE_SUBSCRIPTION=true`** in `.env.local` forces subscriber UI for **all** logged-in users. See **`docs/test-user-roles.md`** for role + flag recipes.

## Prerequisites

- Node.js (current LTS is fine)
- npm
- A Supabase project (for live data and optional sync scripts below)

## Local development

```bash
npm install
npm run dev
```

**Lounge link previews (Open Graph):** Share URLs use **`/lounge/p/<post_uuid>`**. On **Vercel**, `vercel.json` rewrites that path to **`api/lounge-post-og.js`**, which returns HTML with `og:*` / Twitter Card meta (Supabase anon REST + RLS) and redirects browsers to **`/?tab=home&post=…`**. Plain `npm run dev` does not run that route; use **`vercel dev`** from the repo root to exercise it locally, and ensure **`VITE_SUPABASE_URL`** + **`VITE_SUPABASE_ANON_KEY`** are set (same as the Vite app on Vercel). **In-app link cards (chat + feed):** Edge **`lounge-link-unfurl`** + migrations **`20260604180000`** / **`20260604180100`** — see **`docs/test-buildout-backlog.md`** Update log (2026-06-04). **Group delete:** **`20260605120000_chat_group_delete.sql`** + **`ChatGroupSettingsSheet`** (2026-06-05).

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run slots:backfill-card-fields` | **Legacy** — backfill manifest JSON (repo no longer ships `Slots/`) |
| `npm run slots:sync:test` / `slots:sync:production` | **Legacy** — upsert from repo `Slots/<slug>/` (removed; use **`/slot-guide-form`**) |
| `npm run slots:sync:*:dry` / `*:dry:quiet` | Dry-run variants of legacy sync |

## Supabase: schema SQL vs app data

**Schema and one-off SQL** live under `supabase/`. How you apply them depends on your workflow:

- **Supabase Dashboard → SQL Editor**: paste and run a file when you need that change on a project (good for `ALTER TABLE`, policies, or small seeds).
- **Supabase CLI** (`supabase link`, `supabase db push`, migrations): use your team’s normal migration path so every environment stays aligned.

Run schema-related SQL when you add or change tables/columns/policies—not on every content edit. Examples:

- `supabase/lounge_feed_post_stream_video.sql` — adds **`community_feed_posts.stream_video_uid`** and optional **`stream_poster_url`** / **`stream_video_width`** / **`stream_video_height`** (stored tile poster in **`lounge-feed`** + layout) for **Lounge video** (Cloudflare Stream). Pair with deploying Edge **`lounge-cf-stream-direct-upload`** and **`lounge-cf-stream-delete-video`** and Supabase secrets **`CLOUDFLARE_ACCOUNT_ID`** / **`CLOUDFLARE_STREAM_API_TOKEN`** (see **`supabase/functions/lounge-cf-stream-direct-upload/README.md`**). If moderators staff-delete others’ posts, apply **`supabase/lounge_feed_posts_delete_moderator_align.sql`** (or use the updated block in **`feed_phase_a_profiles_public_read.sql`** on fresh installs).
- `supabase/guides_machine_card_fields.sql` — adds optional columns if missing (safe to re-run): **`machines`**: `volatility_index`, `popularity_summary`, **`release_year`** (year only); **`guides`**: **`card_ev_threshold`** (+EV threshold line on AP guide cards; renames legacy **`card_gist`** when present). The app falls back gracefully if older DBs omit some optional columns until you run this script.

Treat other files in `supabase/` the same way: run them when the file’s purpose matches what your database still needs (new tables, RLS, seeds).

**Important:** AP guide **content** lives in Supabase (`guides.content_markdown`, `machines.*`, cloud image URLs). Do **not** paste upsert SQL by hand for day-to-day edits. Use **`/slot-guide-form`**.

## AP guide updates (form-first)

**Source of truth:** Supabase + cloud storage (R2 preferred, or **`guide-assets`** bucket). The app reads **`guides.content_markdown`** at runtime — **not** repo markdown files.

**Repo cleanup (Jun 2026):** **`Slots/`** and **`public/guides/`** were removed from git. Guide heroes and inline images are R2/Storage URLs in the DB. Calculator tab icons remain at **`public/calculators/*.webp`** (`CALCULATOR_ICON_SRC` in **`calculatorAccess.js`**).

| Task | How |
| --- | --- |
| **New guide** | Sign in as admin → fill sections → upload hero/diagrams → **Ingest guide** |
| **Edit existing** | **Fetch guides** → **Load** → edit → **Save changes** |
| **Inline images** | **Insert image** in section fields (WebP upload to cloud, markdown URL at cursor) |
| **Placement diagrams** | **Diagrams** section (optional; embeds after a section header on save) |
| **Hero refresh after save** | Form cache-busts **`thumbnail_url`** on guides + machines after R2 upload |

**Always Fetch → Load before editing an existing guide.** Save compiles the full markdown from form fields — an empty **Where to find** field will wipe that section in the DB.

**Compiled markdown section order:** When to play → When to stop → How to check → **💰 Bankroll on hand** (optional) → Risk & Warnings → **📍 Where to find** (optional) → Skins → Gameplay Mechanics.

**Card collapsed tile:** **Popularity** = **`machines.popularity`** tier (`Common`, etc.). Migration **`20260610170000`** renamed **`vegas_availability`** → **`popularity`**. **Release year** = **`machines.release_year`** (form **Release year** field; shows on guide card — often needs web research on new ingests).

**+EV threshold defaults:** curated per slug / type fallbacks in **`src/constants/slotCardEvThreshold.js`** (used by form ingest and card UI when DB field is empty).

Details + smoke checklist: **`docs/test-buildout-backlog.md`** → **AP Guide editor**.

### AP Guide ingest form + API

Web form for complete guide cards (machine fields, emoji-section markdown, hero + diagrams):

| Surface | URL / command |
| --- | --- |
| Form (Vite dev) | `npm run dev` → `/slot-guide-form` |
| Form (deployed) | `/slot-guide-form` on the app host (or map a subdomain to the same path) |
| Vercel API | `POST /api/slot-guide-ingest` |
| Local API (repo writes) | `npm run slot-guide:serve` → `http://localhost:8787/ingest` |

**Auth (Vercel `/api/slot-guide-ingest`):** `Authorization: Bearer <supabase-session-token>`; caller must have **`profiles.role = admin`** on the test auth project (validated in **`api/slot-guide-ingest.js`**). Sign in on the form via **`LoginGate.jsx`** — no separate ingest secret on the deployed path.

**Auth (local `npm run slot-guide:serve`):** optional **`x-guide-ingest-secret`** header vs env **`GUIDE_INGEST_SECRET`** (see that server’s README / handler).

**Supabase:** API upserts `machines` + `guides` using **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`**.

| Where | Credentials |
| --- | --- |
| **Local scripts / `slot-guide:serve`** | Repo-root **`.env.supabase.test`** / **`.env.supabase.production`** (gitignored), selected by form **target** (same as `slots:sync`) |
| **Vercel serverless** | Dashboard env vars — **no** `.env.supabase.*` files on the server. **Test** ingest: **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`**. **Production** ingest: optional **`SUPABASE_URL_PRODUCTION`** + **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`** |

**Draft vs ingest vs save:** **Save draft** = browser **`localStorage`** only. **Ingest guide** / **Save changes** = Supabase + cloud storage (live on test). No repo markdown write on Vercel.

**Images:** converted to WebP client-side. Vercel ingest + **Save changes** upload to R2 (preferred) or Supabase Storage bucket **`guide-assets`**.

**Typical workflow (deployed):**

```bash
# npm run dev → /slot-guide-form — sign in as admin
# New: Ingest guide | Existing: Fetch → Load → Save changes
```

### Legacy repo sync scripts (optional)

**`scripts/sync-slot-forms-to-supabase.mjs`** and **`npm run slots:sync:*`** remain for emergencies if you recreate local **`Slots/<slug>/`** manifests (`guide.md`, `card.meta.json`). They are **not** the day-to-day path and the repo no longer ships those folders. Use **`.env.supabase.test`** / **`.env.supabase.production`** with **`SUPABASE_SERVICE_ROLE_KEY`** when running sync.

Local **`npm run slot-guide:serve`** can still mirror to disk when **`SLOT_GUIDE_WRITE_REPO=1`** (creates **`Slots/`** + **`public/guides/`** locally only).

## Further reading

- `docs/frontend-architecture.md` — `App` vs `AppShell`, feature folders, calculators layout, bundle notes.
- `scripts/generate-slot-card-manifests.mjs` — manifest shape and calculator overrides.
- `scripts/sync-slot-forms-to-supabase.mjs` — upsert columns and CLI flags.
- `src/constants/slotCardEvThreshold.js` — default card +EV threshold one-liners per type / slug for UI + manifests.
