# Chat calling (LiveKit)

DM **audio/video** and group **audio** calls for Edge Chat.

## Product (v1)

| Surface | Media | UX |
| --- | --- | --- |
| DM (`chat_rooms.kind = dm`) | Audio or video | Ring / accept / decline / hangup; decline can optionally send a quick reply chat message |
| Classic group (`kind = group`) | Audio only | Start voice call; members join/leave (one hangup does **not** end the call for everyone). **Late join:** room members who are not in the call see a Join bar above the composer (status + participant avatar strip with `+N` overflow) + header Join (open `chat_calls` row via RLS; `join_call`). In-call: avatar grid for all LiveKit participants (profiles by **`user_id`** = LiveKit identity); **green ring** on active speaker |
| Topics / Private Subs | Out of scope | Fan Spaces later |

**Vendor:** LiveKit Cloud (managed SFU). Do not peer-mesh WebRTC.

## Architecture

- **Membership:** `chat_room_members` (Edge rejects non-members).
- **Call state:** `chat_calls` + `chat_call_participants` (migration `20260728000000_chat_calls.sql`).
- **Media:** LiveKit room name `edge-call:{call_id}` (never client-chosen).
- **Tokens:** Edge Function **`chat-calls`** mints JWTs (`LIVEKIT_*` secrets).
- **In-app ring (any screen):** `ChatCallProvider` mounts in **`AppShell`** while signed in (not only inside `ChatTab`), so Lounge/Guides/etc. still get the overlay. Realtime `postgres_changes` on `chat_calls` + broadcast `chat-call-{roomId}`. Accept/deep link opens Chat via `pendingChatRoomId`.
- **Offline ring:** `activity_events.event_type = chat_call_invite` → immediate Edge push (not DM 60s batch). Payload includes `eventType` + `chatCallId`. Service worker suppresses OS call push only after a **visibility probe** (`document.visibilityState === 'visible'`)... never trust `client.focused` alone on iPhone PWA. Probe listener installs from **`main.jsx`** (`chatCallPushProbeListener.js`) so it answers before AppShell mounts; SW wait **800ms**. Deep link `/?tab=chat&room={uuid}&call={callId}`; notificationclick **postMessage** includes `callId`/`roomId` and **skips** `client.navigate` for call invites **and** missed callbacks (PWA reload was wiping accept / Call back UI). Tap also posts **`chat-call-invite-inapp`** (same path as visible-tab delivery) so Accept UI is not stuck behind a deep-link profile-fetch race. Durable handoff: SW also writes Cache **`edge-pending-app-navigate-v1`** (iOS often drops postMessage on wake); AppShell drains on `pageshow` / visibility / provider mount. Session stash: `edge_pending_chat_call_v1`. Pref: `push_messages`.
- **Missed replace:** unanswered hangup / timeout → status `missed` + `chat_call_missed` activity push with the **same** `chatCallId` tag → OS notification becomes “Missed call from {name}” (Android replaces; iOS best-effort). Tap opens `/?tab=chat&room=&missedCall=` → DM + **Call back?** prompt (matches original voice/video). Deep-link effect must not clear pending on cancelled effect runs; only clear after accept UI / callback prompt actually opens (keeps iOS wake retries alive). **In-app Lounge notifications** also list `chat_call_missed` (migration **`20260728030000`**; ringing `chat_call_invite` stays push/overlay only).
- **Push subscribe:** client uses RPC **`upsert_my_push_subscription`** (reclaim endpoint) so Android enable does not fail RLS when the endpoint row belonged to another user. **Intent + quiet repair:** **`pushOptInIntent.js`** remembers in-app opt-in separately from the live PushManager/`push_subscriptions` row; on open, if intent is on and OS permission is still granted but the sub is gone, **`useLoungePushNotifications`** resubscribes silently. AppShell only prompts (“Re-enable notifications” / blocked in system Settings) when silent repair fails or permission is denied (7-day dismiss cooldown).

## Edge actions

See [`supabase/functions/chat-calls/README.md`](../supabase/functions/chat-calls/README.md).

Hangup uses **`leave_call`**: marks the caller’s participant `left_at`, removes them from LiveKit. **Group** stays up only if **2+** participants remain after leave (if two are left and one hangs up, the call ends for the last person too). **DM** always ends. **`end_call`** still force-ends for everyone.

## Client

- `src/features/chat/calls/` — session UI, incoming overlay (caller avatar + name), API, controller.
- Header: DM Phone + Video; group Voice (absolute right). Avatar/title stay screen-centered; room options live in the name › sheet (no ⋯ menu).
- **In-call / ringing chrome:** WhatsApp-style dark stage, large peer avatar while ringing/audio, bottom control pill (mute / video / flip camera / speaker / hangup). Flip camera (video calls, cam on) toggles front/back via LiveKit `restartTrack({ facingMode })`, with device-cycle fallback. **Speaker:** defaults to **earpiece**; button toggles **speakerphone**. Chrome Android has no `setSinkId`... we switch LiveKit **`audioinput`** between phantom devices labeled `Headset earpiece` / `Speakerphone` (that also routes playback). iOS / browsers without those devices often cannot switch from the web. Minimize (top-left) collapses to a **draggable** floating pill (app-wide via `ChatCallProvider` in AppShell; left control = peer avatar, tap to expand). **Video:** remote/active-speaker fullscreen + round PiP for the other person in 1:1 (swaps when you pin local so you can switch back); round PiP/strip uses `object-fit: cover` (no letterbox bars); camera-off / muted camera shows avatar (not black); multi-remote strip with tap-to-pin.
- **DM decline quick replies** (`chatCallDeclineQuickReplies.js`): incoming overlay dropdown + **Decline & send** (decline call, then `chatSendMessage`). Circle decline still ends the call with no message. Group voice invites do not show this UI.

## Guardrails

- Max call duration **60 minutes**.
- Max **12** concurrent participants (group).
- Rate-limit starts (**8 / minute** / user).
- Bidirectional **blocks** gate DM calls.

## iOS / PWA limits

- **No CallKit** ... incoming = web push + in-app overlay only.
- `getUserMedia` only after user tap (Start / Accept, or first-open PWA mic opt-in).
- **First-open PWA mic prompt:** **Android installed PWA only** (`isStandalonePwa` + `isAndroidDevice`). After splash (and after the push opt-in if that also shows), Edge asks once to Enable microphone, then calls `getUserMedia` and immediately stops the track. Seen flag: `edge_pwa_mic_prompt_v2:{userId}` (`src/utils/pwaMicrophonePrompt.js`). iPhone / iPad: no sheet (OS prompt on Accept / Start call is enough).
- Keep Edge open during calls (background mic is best-effort on iPhone Safari/PWA).
- Call provider + overlay live at **AppShell** so tab switches do not tear down ringing/active media.
- **In-app tones:** Web Audio ringtone on incoming overlay; ringback while outgoing caller awaits a remote participant (`chatCallRingTone.js`). Stops on accept/decline/answer/hangup. Not a substitute for OS notification sound when backgrounded.
- **Group remote audio:** LiveKitRoom uses **`webAudioMix: true`** (one AudioContext for all remotes) + `room.startAudio()` on connect/roster change; “Tap for call audio” if autoplay still blocks. Speaker/earpiece route applies on connect + toggle only... not on every join/leave (mic restart thrash was silencing people).

## Setup checklist

1. Create LiveKit Cloud project; copy URL + API key/secret.
2. Apply SQL `20260728000000`–`20260728030000` on test (then prod when promoting).
3. Set Edge secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on the project (**both** test + prod).
4. Deploy `chat-calls` + redeploy `lounge-send-activity-push`.
5. Smoke: DM video ring both devices; group audio join; push tap with `?call=` while app backgrounded on iPhone PWA.

**Prod promote (2026-07-27):** SQL through **`20260728030000`** (+ **`20260728040000`** replica identity) + Edge **`chat-calls`** / **`lounge-send-activity-push`** on **`jtjgtucumuoswnbauxry`**. Frontend via **`main`**.

**Prod promote (2026-07-27, UX batch):** WhatsApp in-call polish, group leave semantics, earpiece/speaker, late-join Join bar + avatars → **`main`**; redeploy **`chat-calls`** on prod for **`leave_call`** / end-when-≤1-remains. No new SQL.
