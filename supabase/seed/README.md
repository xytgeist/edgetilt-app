## Local Intel seeding (cities + casinos)

### Why this exists
The app treats **cities** and **casinos** as auto-created “groups”.
To seed data quickly, you can maintain simple CSV files and generate a single SQL file to paste into Supabase.

### Files
- `supabase/seed/cities.csv`: `name,region`
- `supabase/seed/casinos.csv`: `city_name,city_region,casino_name`
- `supabase/seed/seed_local_intel.sql`: generated output (paste into Supabase SQL editor)

### Steps
1) Fill in / replace the CSVs:
- `cities.csv`
- `casinos.csv` (every casino must reference a city row)

Optional: import Overpass Turbo GeoJSON
```bash
node scripts/import-overpass-geojson-to-local-intel-csv.mjs "Casinos/las-vegas-casinos.geojson"
```

2) Generate the seed SQL:
```bash
node scripts/generate-local-intel-seed-sql.mjs
```

3) Paste output into Supabase:
- Supabase → SQL Editor → New query
- paste `supabase/seed/seed_local_intel.sql`
- Run

### Notes
- The generated SQL uses `WHERE NOT EXISTS`, so it is safe to re-run.
- This does **not** delete anything.

### Poker tournament catalog (Live picker schedule)
- Region seeds under `supabase/seed/poker_tournament_catalog_*.json`:
  - **`lv`** Nevada · **`ca`** · **`az`** · **`fl`** · **`pa`** · **`nj`** · **`ct`** · **`ok`** · **`gulf`** · **`md`** · **`chi`** · **`midwest`** · **`in`** · **`wi`** · **`mttdb`** (MTTDB live + online lobby scrape at sync)
- Each file sets `_meta.timezone` (Pacific / Eastern / Central) for DST-aware `starts_at`.
- **Sync (recommended):** all region files + Wynn series JSON-LD + **MTTDB live + online lobbies** (`mttdbCatalogFetch.mjs`, `mttdbCatalogSites.mjs`) + **ClubWPT** guest lobby + **CoinPoker** marketing schedule tables (`coinpokerCatalogFetch.mjs` … series `/schedule/` pages + Sunday Specials/PKOs templates):
```bash
npm run poker:catalog:sync:test:dry
npm run poker:catalog:sync:test
npm run poker:catalog:sync:production
```
- **Production schedule:** GitHub Actions workflow `.github/workflows/poker-catalog-sync-production.yml` runs **`poker:catalog:sync:production` every ~3 days**. Secrets: `SUPABASE_URL_PRODUCTION`, `SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`. MTTDB is often behind Cloudflare Turnstile; a blocked scrape **keeps existing `mttdb:*` rows** and still upserts regional/ClubWPT. The job only fails if online catalog is actually empty. Set **`MTTDB_PLAYWRIGHT=1`** to retry headless Chrome.
- **Auto-map at sync:** unknown MTTDB **online sites** → `site_name` label; unknown **live venues** → Nominatim geocode + `casinos` insert (duplicate name → alias link on existing row).
- **Satellites:** included (same picker filters: today/tomorrow + GPS / Site).
- **Seed only** (no fetch): `npm run poker:catalog:seed:test`
- Single region: `--file=supabase/seed/poker_tournament_catalog_ca.json`
- New poker rooms need matching rows in `supabase/casino_seed.sql` for GPS venue match.
- **Picker display:** Live = catalog rows **today or tomorrow** + GPS venue match + `starts_at` buy-in window. Online = same date window filtered by **Site** dropdown (`venue_name` = network label).
- User soft events (`source=user`) unchanged ... day-of via Start/Log only

