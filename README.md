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

**Lounge link previews (Open Graph):** Share URLs use **`/lounge/p/<post_uuid>`**. On **Vercel**, `vercel.json` rewrites that path to **`api/lounge-post-og.js`**, which returns HTML with `og:*` / Twitter Card meta (Supabase anon REST + RLS) and redirects browsers to **`/?tab=home&post=…`**. Plain `npm run dev` does not run that route; use **`vercel dev`** from the repo root to exercise it locally, and ensure **`VITE_SUPABASE_URL`** + **`VITE_SUPABASE_ANON_KEY`** are set (same as the Vite app on Vercel).

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run slots:backfill-card-fields` | Add `card_ev_threshold` + `release_year` to manifests missing them |
| `npm run slots:sync:test` / `slots:sync:production` | Upsert manifests to **test** or **prod** (see `.env.supabase.*`) |
| `npm run slots:sync:test:dry` / `slots:sync:production:dry` | Dry-run for those targets |
| `npm run slots:sync:test:dry:quiet` / `slots:sync:production:dry:quiet` | Same, without dumping every manifest JSON (short output) |

## Supabase: schema SQL vs app data

**Schema and one-off SQL** live under `supabase/`. How you apply them depends on your workflow:

- **Supabase Dashboard → SQL Editor**: paste and run a file when you need that change on a project (good for `ALTER TABLE`, policies, or small seeds).
- **Supabase CLI** (`supabase link`, `supabase db push`, migrations): use your team’s normal migration path so every environment stays aligned.

Run schema-related SQL when you add or change tables/columns/policies—not on every content edit. Examples:

- `supabase/lounge_feed_post_stream_video.sql` — adds **`community_feed_posts.stream_video_uid`** and optional **`stream_poster_url`** / **`stream_video_width`** / **`stream_video_height`** (stored tile poster in **`lounge-feed`** + layout) for **Lounge video** (Cloudflare Stream). Pair with deploying Edge **`lounge-cf-stream-direct-upload`** and **`lounge-cf-stream-delete-video`** and Supabase secrets **`CLOUDFLARE_ACCOUNT_ID`** / **`CLOUDFLARE_STREAM_API_TOKEN`** (see **`supabase/functions/lounge-cf-stream-direct-upload/README.md`**). If moderators staff-delete others’ posts, apply **`supabase/lounge_feed_posts_delete_moderator_align.sql`** (or use the updated block in **`feed_phase_a_profiles_public_read.sql`** on fresh installs).
- `supabase/guides_machine_card_fields.sql` — adds optional columns if missing (safe to re-run): **`machines`**: `volatility_index`, `popularity_summary`, **`release_year`** (year only); **`guides`**: **`card_ev_threshold`** (+EV threshold line on AP guide cards; renames legacy **`card_gist`** when present). The app falls back gracefully if older DBs omit some optional columns until you run this script.

Treat other files in `supabase/` the same way: run them when the file’s purpose matches what your database still needs (new tables, RLS, seeds).

**Important:** Row updates for machines/guides from the repo’s slot “forms” are **not** done by pasting upsert SQL by hand. Use the sync script below so `machines` and `guides` stay consistent with `Slots/<slug>/`.

## Slot manifests (`Slots/`) and upserts to Supabase

Each game has a **lowercase kebab-case** folder matching the machine `slug`, for example `Slots/buffalo-link/`. Inside:

- `card.meta.json` — machine fields (including optional **`release_year`**), **`guide_seed.card_ev_threshold`** (one phrase: +EV threshold / when to play, e.g. Buffalo **Play any 1400+**), advantage-play **`ap`** blocks, asset hints.
- `guide.md` — markdown synced to `guides.content_markdown`.

**+EV threshold defaults:** curated per slug / type fallbacks live in **`src/constants/slotCardEvThreshold.js`**. After adding machines, either edit each manifest’s `card_ev_threshold` or run **`npm run slots:backfill-card-fields`** once to populate missing **`card_ev_threshold`** / **`release_year`** from those defaults (`release_year` stays `null` unless listed in constants).

Legacy asset folders with mixed case or non-slug names are ignored by the sync script; keep the canonical slug folder for anything that should sync.

### When to regenerate manifests

After you change the **`INSERT INTO machines`** seed block in `supabase/machines_guides_schema.sql` (new slug, renamed game, calculator flags, etc.):

```bash
npm run slots:generate
```

That refreshes `card.meta.json` and `guide.md` stubs under `Slots/<slug>/` for every row in that insert. Edit the JSON and markdown afterward; re-run generate only when the SQL seed is the new source of truth for machine rows.

### When to sync to the database (upsert)

When you want Supabase `machines` and `guides` to match the repo:

**Quick copy-paste** (run from the repo root; use `.env.supabase.test` / `.env.supabase.production` with **`SUPABASE_SERVICE_ROLE_KEY`**, not the anon key):

```bash
npm run slots:sync:test                  # upsert → test project
npm run slots:sync:production            # upsert → production project

npm run slots:sync:test:dry              # preview test (no writes)
npm run slots:sync:production:dry       # preview production (no writes)

npm run slots:sync:test:dry:quiet        # dry-run, short output only
```

Single game only:

```bash
node scripts/sync-slot-forms-to-supabase.mjs --target=test --slug=buffalo-link
```

(`--target=production` works the same; use any folder slug under `Slots/`.)

1. **Pick the project:** test vs production.

   **Option A — explicit target (recommended with two Supabase projects)**  
   Add two repo-root env files (**gitignored**):

   | File | Use |
   | --- | --- |
   | `.env.supabase.test` | Test/staging project URL + **service_role** key |
   | `.env.supabase.production` | Production project URL + **service_role** key |

   Each file can contain the same variable names as `.env`:

   - `SUPABASE_URL` or `VITE_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   The script always loads **`.env`** first (optional shared defaults), then **overwrites** URL/key from the target file when you pass `--target=`.

   | Command |
   | --- |
   | `npm run slots:sync:test` / `npm run slots:sync:test:dry` |
   | `npm run slots:sync:production` / `npm run slots:sync:production:dry` |

   CLI equivalents: `--target=test`, `--target=production` (`prod` is accepted).

   **Option B — single `.env` only**  
   `npm run slots:sync` / `slots:sync:dry` behave as before: only `.env` (good if you temporarily point `.env` at one project).

2. **Dry run** (no writes, prints payloads and which host/target):

   ```bash
   npm run slots:sync:test:dry
   ```

3. **Apply upserts:**

   ```bash
   npm run slots:sync:test
   ```
   or `npm run slots:sync:production` when you intend production.

   The sync script reads **`Slots/...`** and prints **`Slots sync → <target> → <hostname>`** before writing so you can confirm which Supabase instance you hit.

  **`TypeError: fetch failed`** on upsert means the HTTP client couldn’t reach your project (wrong URL, paused project, DNS, firewall/VPN blocking `*.supabase.co`, TLS issues). Fix connectivity; the slug printed first (e.g. `buffalo-link`) is alphabetical, not broken data.

Optional: sync a single game:

```bash
node scripts/sync-slot-forms-to-supabase.mjs --target=test --slug=buffalo-link
```

Run sync whenever you add games, change manifests, or update `guide.md` and want the database to reflect it.

### AP Guide ingest form + API

Web form for complete guide cards (machine fields, emoji-section markdown, hero + diagrams):

| Surface | URL / command |
| --- | --- |
| Form (Vite dev) | `npm run dev` → `/slot-guide-form` |
| Form (deployed) | `/slot-guide-form` on the app host (or map a subdomain to the same path) |
| Vercel API | `POST /api/slot-guide-ingest` |
| Local API (repo writes) | `npm run slot-guide:serve` → `http://localhost:8787/ingest` |

**Auth:** request header `x-guide-ingest-secret` must match env **`GUIDE_INGEST_SECRET`** (set on Vercel per environment; use any strong secret locally).

**Supabase:** API upserts `machines` + `guides` using **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`**. For two-project workflow, local server loads `.env.supabase.test` / `.env.supabase.production` from the form **target** field (same as `slots:sync`).

**Images:** converted to WebP. Local server writes **`public/guides/<slug>/`** and **`Slots/<slug>/`**. Vercel API uploads to Supabase Storage bucket **`guide-assets`** (run **`supabase/guide_assets_storage.sql`** on test + prod first) and stores public URLs in `machines.thumbnail_url` + markdown when repo files are not written.

**Typical local workflow:**

```bash
# Terminal 1
npm run slot-guide:serve

# Terminal 2
npm run dev
# Open /slot-guide-form — API URL http://localhost:8787/ingest, paste GUIDE_INGEST_SECRET

git add Slots/ public/guides/
npm run slots:sync:test   # optional if ingest already synced Supabase
```

Deployed-only workflow: form → `/api/slot-guide-ingest` with Vercel env vars; commit returned `files.cardMetaJson` / `files.guideMarkdown` + pull storage assets into `public/guides/` when you want repo parity.

### Windows note

On a case-insensitive drive, mixed-case legacy folders (for example `Phoenix-Link`) collide with canonical `phoenix-link`. The sync script only reads **lowercase kebab-case** directories (`a-z`, `0-9`, hyphens). Asset-only trees were renamed to match (e.g. `igt-must-hit-by`, `rich-little-hens`, `cash-falls`).

## Further reading

- `docs/frontend-architecture.md` — `App` vs `AppShell`, feature folders, calculators layout, bundle notes.
- `scripts/generate-slot-card-manifests.mjs` — manifest shape and calculator overrides.
- `scripts/sync-slot-forms-to-supabase.mjs` — upsert columns and CLI flags.
- `src/constants/slotCardEvThreshold.js` — default card +EV threshold one-liners per type / slug for UI + manifests.
