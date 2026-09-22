# `lounge-cf-stream-tus-create`

Proxies the **tus creation** `POST` from the Lounge web app to Cloudflare Stream (`/stream?direct_user=true`). The browser then uploads chunks with `PATCH` directly to the `Location` URL from Cloudflare.

**Secrets:** same as `lounge-cf-stream-direct-upload` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, plus auto `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`).

**Deploy:** `supabase functions deploy lounge-cf-stream-tus-create`

Client: `uploadVideoToCfStreamResumableTus` in `src/utils/loungeVideoUpload.js`.

The function rejects `Upload-Length` above the caller's cap (free 512 MB, Edge Pro 8 GB) and rewrites `maxDurationSeconds` (free 155, Edge Pro 1215). Deploy this function with the cap change or the server still forwards whatever the client sends.
