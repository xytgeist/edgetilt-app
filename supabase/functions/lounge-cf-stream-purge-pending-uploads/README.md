# lounge-cf-stream-purge-pending-uploads

Deletes Cloudflare Stream videos in **`pendingupload`** that are older than a threshold (default **24 hours**). Use this as a **safety net** when clients never called orphan delete (crashed tab, killed app, etc.).

## Secrets (Edge Function env)

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | Same as other Stream functions |
| `CLOUDFLARE_STREAM_API_TOKEN` | Stream:Edit |
| `LOUNGE_CF_STREAM_PURGE_SECRET` | Shared secret; caller must send header `x-lounge-cf-stream-purge-secret` with the same value |

## Deploy

**Test** project ref **`jtjgtucumuoswnbauxry`** — copy-paste (also deploy **`lounge-cf-stream-delete-video`** if not already; set **`CLOUDFLARE_*`** secrets per **`lounge-cf-stream-direct-upload/README.md`**):

```bash
supabase secrets set LOUNGE_CF_STREAM_PURGE_SECRET="$(openssl rand -hex 32)" --project-ref jtjgtucumuoswnbauxry   # once per project
supabase functions deploy lounge-cf-stream-direct-upload --project-ref jtjgtucumuoswnbauxry
supabase functions deploy lounge-cf-stream-delete-video --project-ref jtjgtucumuoswnbauxry
supabase functions deploy lounge-cf-stream-delete-orphan --project-ref jtjgtucumuoswnbauxry
supabase functions deploy lounge-cf-stream-purge-pending-uploads --project-ref jtjgtucumuoswnbauxry
```

**Production** uses **`jtjgtucumuoswnbauxry`** (see `docs/edgetilt-production-cutover.md`). **Test sandbox:** **`kcosfvmreeiosdjdzycb`**.

## Schedule (Supabase `pg_cron` + `pg_net` — recommended)

Migrations:

1. **`supabase/migrations/20260509180000_lounge_cf_stream_purge_pg_cron.sql`** — defines **`invoke_lounge_cf_stream_purge_pending()`** and the daily **07:15 UTC** cron.
2. **`supabase/migrations/20260512120000_lounge_cf_stream_purge_normalize_vault_secrets.sql`** — fixes **`UNAUTHORIZED_INVALID_JWT_FORMAT`**: legacy **`eyJ…`** keys use `apikey` + `Authorization: Bearer`; **`sb_publishable_` / `sb_secret_`** keys use **`apikey` only** (never Bearer), per [Supabase API key docs](https://supabase.com/docs/guides/getting-started/api-keys).
3. **`supabase/migrations/20260515120000_lounge_cf_stream_purge_invoke_options.sql`** — overload **`invoke_lounge_cf_stream_purge_pending(integer, boolean)`** for manual tests (`maxAgeHours`, `dryRun`) without changing the cron’s zero-arg call.
4. **`supabase/migrations/20260701100000_lounge_cf_stream_purge_vault_project_url.sql`** — **`base_url`** from Vault **`lounge_cf_stream_purge_project_url`** (no hardcoded project ref; required per Supabase project after cutover).

**Edge deploy:** repo **`supabase/config.toml`** sets **`verify_jwt = false`** for this function only (required for **`sb_*`** gateway calls). Redeploy after any change:

```bash
supabase functions deploy lounge-cf-stream-purge-pending-uploads --project-ref jtjgtucumuoswnbauxry
```

Security: the endpoint stays gated by **`x-lounge-cf-stream-purge-secret`** matching **`LOUNGE_CF_STREAM_PURGE_SECRET`**; use a long random value.

### 1. Extensions

Supabase Dashboard → **Database** → **Extensions** → enable **`pg_cron`** and **`pg_net`** (if not already on).

### 2. Vault secrets (same project)

Dashboard → **SQL Editor**, **once per environment**:

- **`lounge_cf_stream_purge_http_secret`** — same string as Edge **`LOUNGE_CF_STREAM_PURGE_SECRET`**.
- **`lounge_cf_stream_purge_supabase_anon_key`** — either:
  - **Legacy JWT** **`anon` `public`** (`eyJ…`, **Legacy** tab in API keys), or  
  - **`sb_publishable_…`** publishable key (default tab) — **only** after **`verify_jwt = false`** deploy + migration **`20260512120000`** (SQL uses `apikey` only, no `Authorization` Bearer for `sb_*`).
- **`lounge_cf_stream_purge_project_url`** — this project’s API URL, no trailing slash (e.g. **`https://jtjgtucumuoswnbauxry.supabase.co`** on prod, **`https://kcosfvmreeiosdjdzycb.supabase.co`** on sandbox).

```sql
select vault.create_secret('PASTE_PURGE_SECRET_SAME_AS_EDGE', 'lounge_cf_stream_purge_http_secret');
select vault.create_secret('PASTE_EYJ_ANON_OR_SB_PUBLISHABLE', 'lounge_cf_stream_purge_supabase_anon_key');
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'lounge_cf_stream_purge_project_url');
```

If a name already exists: `delete from vault.secrets where name = '…';` then `create_secret` again.

### 3. Apply SQL migrations

Paste/run all three migrations in order, or with CLI linked to test: `supabase db push --linked`.

Manual test from SQL (same Vault as cron): `select public.invoke_lounge_cf_stream_purge_pending(1, true);` then inspect **`net._http_response`** for **`wouldDelete`**. Use **`(1, false)`** only when you intend real deletes.

### 4. Verify

```sql
select * from cron.job where jobname = 'lounge_cf_stream_purge_pending_daily';
select public.invoke_lounge_cf_stream_purge_pending();
```

Wait ~10s, then `select id, status_code, left(content, 200) from net._http_response order by id desc limit 3;` — expect **200**, not **401** / `INVALID_JWT`.

### Request body (cron)

The migration sends **`{"maxAgeHours": 24, "dryRun": false}`**. To change behavior, edit **`public.invoke_lounge_cf_stream_purge_pending`** in the migration (or a follow-up migration).

Optional JSON fields (same as HTTP API):

- **`maxAgeHours`** — integer 1–168, default `24` in our cron body.
- **`dryRun`** — `true` lists **`wouldDelete`** without DELETE.

## Schedule (manual curl)

Example (**test** host):

```bash
curl -sS -X POST \
  "https://jtjgtucumuoswnbauxry.supabase.co/functions/v1/lounge-cf-stream-purge-pending-uploads" \
  -H "x-lounge-cf-stream-purge-secret: $LOUNGE_CF_STREAM_PURGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"maxAgeHours":24,"dryRun":false}'
```

For curl through the gateway: use **`apikey`** (publishable or legacy anon). If you use **`Authorization: Bearer`**, it must be a **JWT** (`eyJ…`); **`sb_publishable_…` in Bearer** causes **`UNAUTHORIZED_INVALID_JWT_FORMAT`**. Or omit Bearer and rely on **`verify_jwt = false`** + **`apikey`** + purge header (same as pg_net for `sb_*`).

## Safety

Only **`pendingupload`** assets are listed. The function still filters by **`created`** vs `maxAgeHours` so very new minted uploads are not removed while a user might still be uploading.
