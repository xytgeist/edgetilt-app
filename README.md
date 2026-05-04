# LVSlotPro

React + Vite front end for slot guides, calculators, and related tooling. Supabase backs machines, guides, and other data.

## Prerequisites

- Node.js (current LTS is fine)
- npm
- A Supabase project (for live data and optional sync scripts below)

## Local development

```bash
npm install
npm run dev
```

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run slots:backfill-card-fields` | Add `card_gist` + `release_year` to manifests missing them |

## Supabase: schema SQL vs app data

**Schema and one-off SQL** live under `supabase/`. How you apply them depends on your workflow:

- **Supabase Dashboard → SQL Editor**: paste and run a file when you need that change on a project (good for `ALTER TABLE`, policies, or small seeds).
- **Supabase CLI** (`supabase link`, `supabase db push`, migrations): use your team’s normal migration path so every environment stays aligned.

Run schema-related SQL when you add or change tables/columns/policies—not on every content edit. Examples:

- `supabase/guides_machine_card_fields.sql` — adds optional columns if missing (safe to re-run): **`machines`**: `volatility_index`, `popularity_summary`, **`release_year`** (year only); **`guides`**: **`card_gist`** (single-line cue shown on AP guide cards). The app falls back gracefully if older DBs omit some of these until you run this script.

Treat other files in `supabase/` the same way: run them when the file’s purpose matches what your database still needs (new tables, RLS, seeds).

**Important:** Row updates for machines/guides from the repo’s slot “forms” are **not** done by pasting upsert SQL by hand. Use the sync script below so `machines` and `guides` stay consistent with `Slots/<slug>/`.

## Slot manifests (`Slots/`) and upserts to Supabase

Each game has a **lowercase kebab-case** folder matching the machine `slug`, for example `Slots/buffalo-link/`. Inside:

- `card.meta.json` — machine fields (including optional **`release_year`**), **`guide_seed.card_gist`** (one phrase: when to play, e.g. Buffalo **Play any 1400+**), advantage-play **`ap`** blocks, asset hints.
- `guide.md` — markdown synced to `guides.content_markdown`.

**Gist defaults:** curated per slug / type fallbacks live in **`src/constants/slotCardGists.js`**. After adding machines, either edit each manifest’s `card_gist` or run **`npm run slots:backfill-card-fields`** once to populate missing **`card_gist`** / **`release_year`** from those defaults (`release_year` stays `null` unless listed in constants).

Legacy asset folders with mixed case or non-slug names are ignored by the sync script; keep the canonical slug folder for anything that should sync.

### When to regenerate manifests

After you change the **`INSERT INTO machines`** seed block in `supabase/machines_guides_schema.sql` (new slug, renamed game, calculator flags, etc.):

```bash
npm run slots:generate
```

That refreshes `card.meta.json` and `guide.md` stubs under `Slots/<slug>/` for every row in that insert. Edit the JSON and markdown afterward; re-run generate only when the SQL seed is the new source of truth for machine rows.

### When to sync to the database (upsert)

When you want Supabase `machines` and `guides` to match the repo:

1. Set environment variables (same shell session or `.env` loaded by your tooling):

   - `SUPABASE_URL` or `VITE_SUPABASE_URL` — project URL (`https://<ref>.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY` — **service role** key. The sync uses upserts; anon keys are usually blocked by RLS for these tables.

2. **Dry run** (no writes, prints what would be sent):

   ```bash
   npm run slots:sync:dry
   ```

3. **Apply upserts:**

   ```bash
   npm run slots:sync
   ```

Optional: sync a single game:

```bash
node scripts/sync-slot-forms-to-supabase.mjs --slug=buffalo-link
```

Run sync whenever you add games, change manifests, or update `guide.md` and want the database to reflect it.

### Windows note

On a case-insensitive drive, mixed-case legacy folders (for example `Phoenix-Link`) collide with canonical `phoenix-link`. The sync script only reads **lowercase kebab-case** directories (`a-z`, `0-9`, hyphens). Asset-only trees were renamed to match (e.g. `must-hit-by-igt`, `rich-little-hens`, `cash-falls`).

## Further reading

- `scripts/generate-slot-card-manifests.mjs` — manifest shape and calculator overrides.
- `scripts/sync-slot-forms-to-supabase.mjs` — upsert columns and CLI flags.
- `src/constants/slotCardGists.js` — default card one-liners (`gist`) per type / slug for UI + manifests.
