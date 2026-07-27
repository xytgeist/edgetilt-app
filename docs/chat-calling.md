# Chat calling (LiveKit)

DM **audio/video** and group **audio** calls for Edge Chat.

## Product (v1)

| Surface | Media | UX |
| --- | --- | --- |
| DM (`chat_rooms.kind = dm`) | Audio or video | Ring / accept / decline / hangup |
| Classic group (`kind = group`) | Audio only | Start voice call; members join/leave |
| Topics / Private Subs | Out of scope | Fan Spaces later |

**Vendor:** LiveKit Cloud (managed SFU). Do not peer-mesh WebRTC.

## Architecture

- **Membership:** `chat_room_members` (Edge rejects non-members).
- **Call state:** `chat_calls` + `chat_call_participants` (migration `20260728000000_chat_calls.sql`).
- **Media:** LiveKit room name `edge-call:{call_id}` (never client-chosen).
- **Tokens:** Edge Function **`chat-calls`** mints JWTs (`LIVEKIT_*` secrets).
- **In-app ring:** Realtime `postgres_changes` on `chat_calls` + broadcast channel `chat-call-{roomId}`.
- **Offline ring:** `activity_events.event_type = chat_call_invite` → immediate push (not DM 60s batch). Deep link `/?tab=chat&room={uuid}&call={callId}`. Pref: `push_messages`.

## Edge actions

See [`supabase/functions/chat-calls/README.md`](../supabase/functions/chat-calls/README.md).

## Client

- `src/features/chat/calls/` — session UI, incoming overlay, API, controller.
- Header: DM Phone + Video; group Voice; options menu uses ⋯ (not the old camera glyph).

## Guardrails

- Max call duration **60 minutes**.
- Max **12** concurrent participants (group).
- Rate-limit starts (**8 / minute** / user).
- Bidirectional **blocks** gate DM calls.

## iOS / PWA limits

- **No CallKit** ... incoming = web push + in-app overlay only.
- `getUserMedia` only after user tap (Start / Accept).
- Keep Edge open during calls (background mic is best-effort on iPhone Safari/PWA).
- Call UI is owned at Chat tab level so room switches inside Chat do not tear down media.

## Setup checklist

1. Create LiveKit Cloud project; copy URL + API key/secret.
2. Apply SQL `20260728000000_chat_calls.sql` on test (then prod when promoting).
3. Set Edge secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on the project.
4. Deploy `chat-calls` + redeploy `lounge-send-activity-push`.
5. Smoke: DM video ring both devices; group audio join; push tap with `?call=` while app backgrounded on iPhone PWA.
