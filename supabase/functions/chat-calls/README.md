# `chat-calls`

LiveKit-backed **DM audio/video** and **group audio** calling for Edge Chat.

## Secrets (test + prod)

| Secret | Notes |
| --- | --- |
| `LIVEKIT_URL` | e.g. `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase |

## Deploy

```bash
supabase functions deploy chat-calls --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy chat-calls --project-ref jtjgtucumuoswnbauxry
```

`verify_jwt = true` in `supabase/config.toml`.

## Actions

| Action | Body | Notes |
| --- | --- | --- |
| `start_call` | `{ room_id, media_mode: 'audio'\|'video' }` | DM: audio or video. Group: audio only. |
| `accept_call` / `join_call` | `{ call_id }` | Mints LiveKit token |
| `decline_call` | `{ call_id }` | DM ringing only |
| `leave_call` | `{ call_id }` | Leave self. Group continues if **2+** remain after leave; DM / when ≤1 would remain ends + deletes LiveKit room |
| `end_call` | `{ call_id }` | Force-end for everyone + delete LiveKit room |
| `token` | `{ call_id }` | Refresh for active participant |
| `get_call` | `{ call_id }` | Status poll |

## SQL

Apply `supabase/migrations/20260728000000_chat_calls.sql` before deploy.

## Product docs

See **`docs/chat-calling.md`**.
