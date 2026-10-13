# Supabase prod dumps → private Cloudflare R2

Cheap **offsite** logical backups for **production** (`jtjgtucumuoswnbauxry` / edgetilt.com). Complements Supabase Pro **included daily backups**. Not a substitute for PITR if you need minute-level restore.

**Test sandbox** (`kcosfvmreeiosdjdzycb`): rely on Supabase included daily backups. No R2 cron. `--target=test` exists only for rare manual dumps.

## What this is

| Piece | Detail |
| --- | --- |
| Script | `scripts/db-dump-to-r2.mjs` |
| Object store | **Private** R2 bucket (`DB_BACKUP_R2_*`) … **not** the public Lounge media bucket |
| Format | `pg_dump --format=custom` (`.dump` … restore with `pg_restore`) |
| Keys | `db-backups/production/{cron\|ondemand}/edgetilt-production-… .dump` |
| Retention | **14 days** (prune after each successful dump) |
| Default cadence | **Daily prod** (Windows task) until dump size is measured |

## Setup (once)

1. Cloudflare account that should hold backups (usually **Investigence** for prod-adjacent ops, or Ops … pick one and stick to it).
2. Create an R2 bucket e.g. `edgetilt-db-backups`.
3. **Do not** attach a public custom domain. Keep the bucket private.
4. Create an R2 API token (Object Read & Write) scoped to that bucket.
5. Add to **`.env.master`** (the dump script reads `.env.master` directly for these keys):

```bash
DB_BACKUP_R2_ACCOUNT_ID=          # 32-char hex account id
DB_BACKUP_R2_ACCESS_KEY_ID=
DB_BACKUP_R2_SECRET_ACCESS_KEY=
DB_BACKUP_R2_BUCKET=edgetilt-db-backups
```

6. Ensure `.env.supabase.production` has `SUPABASE_DB_PASSWORD` (or `SUPABASE_DB_URL` session pooler) … same as `npm run db:query:production`.
7. Install **`pg_dump`** on the Windows machine that will run dumps (Postgres client tools).

## Commands

```bash
# First prod run (prints size + egress estimate)
npm run db:dump:r2:production

# Before scary SQL / migrations / mass deletes on prod
npm run db:dump:r2:production -- --tag=pre-migrate

# Config check only
npm run db:dump:r2:production -- --dry-run
```

## Cadence and egress

Each dump leaves Supabase as **egress** (Pro includes **250 GB/mo**, then **~$0.09/GB**). R2 storage for 14 days of dumps is usually cents. Only **prod** dumps count against the prod project’s egress meter.

| Compressed dump | Daily cron egress / mo | 4×/day egress / mo |
| --- | --- | --- |
| ≲2 GB | usually inside 250 GB | often still OK |
| ~5 GB | ~150 GB/mo | ~600 GB/mo → overage $$ |
| ~10 GB+ | overage likely | avoid |

**Rule:** keep the Windows task on **daily** until the first prod dump prints its `[egress-estimate]` lines. Only then consider 2× or 4×/day.

## Windows scheduled task

```powershell
npm run db:dump:r2:install-windows-task
```

Runs **daily 3:15 AM** local time for `--target=production` (needs interactive logon user with `.env.master` + `pg_dump` on PATH). Logs under `scripts/.db-dump-r2-sync.log`.

## Restore (outline)

1. Download the `.dump` from R2 (dashboard or `aws s3 cp` against the R2 S3 endpoint).
2. Prefer restore into a **new** Supabase project or local Postgres first (practice drill).
3. `pg_restore --no-owner --no-acl -d "$DATABASE_URL" path/to/file.dump`
4. Storage objects (Lounge media on the **public** R2 bucket) are **not** inside this dump … only Postgres.

Supabase dashboard daily backup restore remains the easiest “bring this project back to yesterday” path when the project still exists.

## Related

- Supabase included daily backups / PITR pricing: [Database Backups](https://supabase.com/docs/guides/platform/backups)
- Lounge public media R2 (`LOUNGE_CF_R2_*`) is a **different** bucket … never point `DB_BACKUP_R2_BUCKET` at it.
