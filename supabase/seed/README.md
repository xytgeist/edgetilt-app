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

