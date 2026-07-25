# lounge-cf-stream-video-status

Authenticated Edge Function: returns Cloudflare Stream **`status.state`** (and error reason fields) for a video uid while the Lounge client polls during staged inline publish.

## Deploy (test)

```bash
supabase functions deploy lounge-cf-stream-video-status --project-ref kcosfvmreeiosdjdzycb
```

Reuses existing secrets: **`CLOUDFLARE_ACCOUNT_ID`**, **`CLOUDFLARE_STREAM_API_TOKEN`** (same as direct-upload / delete).

## Request

`POST` with JSON `{ "uid": "<32-hex stream uid>" }` and user JWT.

## Response

```json
{
  "uid": "…",
  "state": "inprogress",
  "pctComplete": "45.000000",
  "errorReasonCode": "",
  "errorReasonText": ""
}
```

When CF processing fails, `state` is **`error`** and `errorReasonText` is set (e.g. codec incompatible).
