# `livekit-egress-webhook`

Receives LiveKit Cloud egress webhooks and posts a **`call_recording`** chat message when a RoomComposite file lands on R2.

## Secrets

Same as `chat-calls` / R2:

- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (webhook signature)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`, `LOUNGE_CF_R2_*` (public URL build)

## Deploy

```bash
supabase functions deploy livekit-egress-webhook --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy livekit-egress-webhook --project-ref jtjgtucumuoswnbauxry
```

`verify_jwt = false` (LiveKit signs the request).

## LiveKit Cloud setup

Project → Settings → Webhooks → add:

`https://<project-ref>.supabase.co/functions/v1/livekit-egress-webhook`

Subscribe at least to **egress_ended**.
