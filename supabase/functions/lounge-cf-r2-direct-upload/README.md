# Lounge Cloudflare R2 image uploads

Feed post images, comment images, and **Stream tile posters** upload to **Cloudflare R2** via presigned PUT URLs. Delivery uses your **public custom domain** with optional **`/cdn-cgi/image/`** transforms (WebP/AVIF, width, quality).

Video bytes stay on **Cloudflare Stream** — only the JPEG poster is stored here.

## Deploy (Supabase test / prod)

```bash
supabase functions deploy lounge-cf-r2-direct-upload
supabase functions deploy lounge-cf-r2-delete-object
supabase functions deploy lounge-cf-r2-delete-orphan
```

## Cloudflare setup

1. **R2 bucket** (e.g. `lounge-media`) — private bucket is fine; expose via custom domain.
2. **Custom domain** on the bucket (e.g. `media.yourdomain.com`) — must be on a Cloudflare zone you control.
3. **Image Resizing** enabled on that zone (Speed → Optimization → Image Resizing, or included on paid plans).
4. **R2 API token** with Object Read & Write on the bucket → Supabase secrets below.

Legacy **`lounge-feed`** Supabase Storage URLs remain readable; new uploads prefer R2 when secrets are set. Client falls back to Supabase upload if R2 returns **503**.

**One-off legacy migration (test):** deploy **`lounge-cf-r2-migrate-lounge-feed`**, then `node scripts/migrate-lounge-feed-to-r2.mjs --target=test` (dry-run: `--dry-run`; keep Supabase copies: `--keep-old`). Service role bearer only.

## Edge secrets (names only)

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Same as Stream (32 hex) |
| `LOUNGE_CF_R2_ACCESS_KEY_ID` | R2 S3 access key |
| `LOUNGE_CF_R2_SECRET_ACCESS_KEY` | R2 S3 secret |
| `LOUNGE_CF_R2_BUCKET` | Bucket name |
| `LOUNGE_CF_R2_PUBLIC_BASE_URL` | Public origin, no trailing slash (e.g. `https://media.yourdomain.com`) |

## Client env (Vite / Vercel)

| Variable | Purpose |
| --- | --- |
| `VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL` | Must match `LOUNGE_CF_R2_PUBLIC_BASE_URL` for resize URL building |
| `VITE_LOUNGE_CF_IMAGE_RESIZE` | Set `false` to serve stored URLs without `/cdn-cgi/image/` (debug) |

## Functions

| Function | Auth | Body |
| --- | --- | --- |
| `lounge-cf-r2-direct-upload` | User JWT | `{ contentType?, fileName? }` → `{ uploadURL, publicUrl, objectKey }` |
| `lounge-cf-r2-delete-object` | User JWT | `{ publicUrl \| objectKey }` — owner prefix or staff |
| `lounge-cf-r2-delete-orphan` | User JWT | `{ publicUrl \| objectKey }` — owner prefix only |

## Delivery URL shape

Stored in DB: `https://media.yourdomain.com/{userId}/{timestamp}-{rand}.jpg`

Feed tile (client): `https://media.yourdomain.com/cdn-cgi/image/width=960,quality=80,format=auto/{userId}/…`

Lightbox uses a wider transform; OG meta uses ~1200px width.
