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
- **In-app ring (any screen):** `ChatCallProvider` mounts in **`AppShell`** while signed in (not only inside `ChatTab`), so Lounge/Guides/etc. still get the overlay. Realtime `postgres_changes` on `chat_calls` + broadcast `chat-call-{roomId}`. Accept/deep link opens Chat via `pendingChatRoomId`.
- **Offline ring:** `activity_events.event_type = chat_call_invite` → immediate Edge push (not DM 60s batch). Payload includes `eventType` + `chatCallId`. Service worker suppresses OS call push only after a **visibility probe** (`document.visibilityState === 'visible'`)... never trust `client.focused` alone on iPhone PWA. Deep link `/?tab=chat&room={uuid}&call={callId}`; notificationclick **postMessage** includes `callId`/`roomId` and **skips** `client.navigate` for call invites **and** missed callbacks (PWA reload was wiping accept / Call back UI). Session stash: `edge_pending_chat_call_v1`. Pref: `push_messages`.
- **Missed replace:** unanswered hangup / timeout → status `missed` + `chat_call_missed` activity push with the **same** `chatCallId` tag → OS notification becomes “Missed call from {name}” (Android replaces; iOS best-effort). Tap opens `/?tab=chat&room=&missedCall=` → DM + **Call back?** prompt (matches original voice/video). Deep-link effect must not clear pending on cancelled effect runs (unstable parent callbacks were wiping the prompt before it painted).
- **Push subscribe:** client uses RPC **`upsert_my_push_subscription`** (reclaim endpoint) so Android enable does not fail RLS when the endpoint row belonged to another user.

## Edge actions

See [`supabase/functions/chat-calls/README.md`](../supabase/functions/chat-calls/README.md).

## Client

- `src/features/chat/calls/` — session UI, incoming overlay, API, controller.
- Header: DM Phone + Video; group Voice (absolute right). Avatar/title stay screen-centered; room options live in the name › sheet (no ⋯ menu).

## Guardrails

- Max call duration **60 minutes**.
- Max **12** concurrent participants (group).
- Rate-limit starts (**8 / minute** / user).
- Bidirectional **blocks** gate DM calls.

## iOS / PWA limits

- **No CallKit** ... incoming = web push + in-app overlay only.
- `getUserMedia` only after user tap (Start / Accept, or first-open PWA mic opt-in).
- **First-open PWA mic prompt:** installed Home Screen / Install app only (`isStandalonePwa`). After splash (and after the push opt-in if that also shows), Edge asks once to Enable microphone, then calls `getUserMedia` and immediately stops the track. Seen flag: `edge_pwa_mic_prompt_v2:{userId}` (`src/utils/pwaMicrophonePrompt.js`). In-app sheet is not skipped when the Permissions API already says granted. Does **not** force iOS “Allow forever” ... OS may still re-ask later.
- Keep Edge open during calls (background mic is best-effort on iPhone Safari/PWA).
- Call provider + overlay live at **AppShell** so tab switches do not tear down ringing/active media.
- **In-app tones:** Web Audio ringtone on incoming overlay; ringback while outgoing caller awaits a remote participant (`chatCallRingTone.js`). Stops on accept/decline/answer/hangup. Not a substitute for OS notification sound when backgrounded.

## Setup checklist

1. Create LiveKit Cloud project; copy URL + API key/secret.
2. Apply SQL `20260728000000_chat_calls.sql` on test (then prod when promoting).
3. Set Edge secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on the project.
4. Deploy `chat-calls` + redeploy `lounge-send-activity-push`.
5. Smoke: DM video ring both devices; group audio join; push tap with `?call=` while app backgrounded on iPhone PWA.
