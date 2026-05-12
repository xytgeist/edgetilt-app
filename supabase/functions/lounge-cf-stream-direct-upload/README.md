# lounge-cf-stream-direct-upload

Authenticated users receive a **one-time Cloudflare Stream direct upload URL** and asset **`uid`** so the browser can upload video **without** exposing your Cloudflare API token.

Used by **`src/utils/loungeVideoUpload.js`** via `supabase.functions.invoke('lounge-cf-stream-direct-upload')`.

## Required secrets (Supabase Edge Function)

Set in **Supabase Dashboard → Edge Functions → Secrets** (or CLI), per environment (test / production):

| Name | Description |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | **Account ID** only: 32 hex characters, no dashes/underscores. In [Cloudflare Dashboard](https://dash.cloudflare.com/) open your account and copy **Account ID** from the **right sidebar** (or Workers & Pages → your worker → account summary). **Do not** use a **Zone ID** (domain overview), API token string, or Stream video UID — the Stream API path is `/accounts/{account_id}/...` and wrong IDs produce “could not route … object identifier is invalid”. |
| `CLOUDFLARE_STREAM_API_TOKEN` | API token with **Stream → Write** or **Stream → Edit** (not the Global API Key). |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by Supabase to Edge Functions.

**Do not commit token values.** Rotate in Cloudflare if leaked.

**Stream storage quota:** Cloudflare Stream charges **stored video minutes** as a **prepaid** product. If your account has **no purchased stored minutes** (allocation = 0), the API can return “storage capacity / quota exceeded” even when the video library is empty. Open **Dashboard → Stream** (or **Billing**) and purchase stored minutes, or delete old videos / wait for abandoned direct-upload links to expire so reserved capacity is released. See [Stream pricing](https://developers.cloudflare.com/stream/pricing/).

## Database

Run **`supabase/lounge_feed_post_stream_video.sql`** on the same Supabase project so inserts can set **`community_feed_posts.stream_video_uid`**.

## Deploy

**Test** project ref for this workspace:

```bash
supabase functions deploy lounge-cf-stream-direct-upload --project-ref jtjgtucumuoswnbauxry
```

**Production** uses a different ref (see `docs/production-rollout-checklist.md` — currently **`wedrhwtsxifbnnbgxdkm`**).

## Product limits (enforced in app + upload token)

- **60 seconds** max duration (`maxDurationSeconds` on direct upload).
- **200 MB** max file size for the basic POST upload path (Cloudflare; see Stream direct upload docs).

## References

- [Cloudflare Stream — Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
