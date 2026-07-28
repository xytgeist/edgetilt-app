# `chat-calls`

LiveKit-backed **DM audio/video**, **group audio/video**, and **manual call recording** for Edge Chat.

## Secrets (test + prod)

| Secret | Notes |
| --- | --- |
| `LIVEKIT_URL` | e.g. `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase |
| Lounge R2 (`CLOUDFLARE_ACCOUNT_ID`, `LOUNGE_CF_R2_*`) | RoomComposite egress output + public URL (same as Lounge/chat media) |

## Deploy

```bash
supabase functions deploy chat-calls --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy chat-calls --project-ref jtjgtucumuoswnbauxry
```

`verify_jwt = true` in `supabase/config.toml`.

Recording finalize webhook is a separate function: **`livekit-egress-webhook`**.

## Actions

| Action | Body | Notes |
| --- | --- | --- |
| `start_call` | `{ room_id, media_mode: 'audio'\|'video' }` | DM or classic group. Group kind stays `group_audio`; `media_mode` persisted. |
| `accept_call` / `join_call` | `{ call_id }` | Mints LiveKit token (camera when `media_mode = video`) |
| `decline_call` | `{ call_id }` | DM ringing only; stops active egress if any |
| `leave_call` | `{ call_id }` | Leave self. Group continues if **2+** remain after leave; DM / when ≤1 would remain ends + deletes LiveKit room. Stops active egress. |
| `end_call` | `{ call_id }` | Force-end for everyone + delete LiveKit room; stops active egress |
| `start_recording` | `{ call_id }` | Video calls only; first-starter claim; RoomComposite → R2; max 600s |
| `stop_recording` | `{ call_id }` | StopEgress; does **not** hang up the call |
| `token` | `{ call_id }` | Refresh for active participant |
| `get_call` | `{ call_id }` | Status poll (includes `recording_*`; auto-stops if past 10m) |

## SQL

Apply before deploy:

- `supabase/migrations/20260728000000_chat_calls.sql`
- `supabase/migrations/20260728050000_chat_calls_group_video.sql`
- `supabase/migrations/20260728060000_chat_calls_recording.sql`

## Product docs

See **`docs/chat-calling.md`**.
