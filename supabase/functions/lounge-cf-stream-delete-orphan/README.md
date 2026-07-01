# lounge-cf-stream-delete-orphan

Authenticated callers can delete a **Cloudflare Stream** asset by **uid** when a direct upload was minted but the post never succeeded (no `community_feed_posts` row yet). Used from **`deleteCfStreamOrphanAsset`** in `src/utils/loungeVideoUpload.js` after upload / manifest / insert failures.

This is separate from **`lounge-cf-stream-delete-video`**, which requires a `postId` and checks author/staff against the database.

## Secrets

Same as **`lounge-cf-stream-direct-upload`**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` (Stream:Edit includes delete).

## Deploy

**Test** project ref **`jtjgtucumuoswnbauxry`**:

```bash
supabase functions deploy lounge-cf-stream-delete-orphan --project-ref jtjgtucumuoswnbauxry
```

A **copy-paste deploy block** and **Supabase `pg_cron` schedule** (Vault + migration) are in **`lounge-cf-stream-purge-pending-uploads/README.md`**.

**Production** uses **`jtjgtucumuoswnbauxry`**. **Test sandbox:** **`kcosfvmreeiosdjdzycb`**.

## Security

Only a valid Supabase **user JWT** is required; the uid must match Cloudflare’s 32-character hex format. Uids are unguessable in practice; do not expose this endpoint to unauthenticated callers.
