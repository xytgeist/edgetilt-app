# Chat calling (LiveKit)

DM **audio/video**, classic group **audio/video**, and manual **call recording** (RoomComposite → R2) for Edge Chat.

## Product (v1 + group video / recording)

| Surface | Media | UX |
| --- | --- | --- |
| DM (`chat_rooms.kind = dm`) | Audio or video | Ring / accept / decline / hangup; decline can optionally send a quick reply chat message |
| Classic group (`kind = group`) | Audio or video | Start voice or video; members join/leave (one hangup does **not** end the call for everyone). **Late join:** Join bar above composer + header Join. In-call voice: avatar grid + green speaker ring. In-call video: same focused stage as DM (You lower-right, tap remote to fullscreen, others on the right). Kind stays `group_audio` for leave/join; `media_mode` is `audio` or `video`. |
| Topics / Private Subs | Out of scope | Fan Spaces later |

**Recording (video calls only):**

| Rule | Behavior |
| --- | --- |
| Start | Manual; **any** participant; **first starter wins** (others’ Record blanks while live) |
| Stop | Recording starter **or** call initiator (host kill switch) |
| Featured layout | Fullscreen **remote** at Record start → custom RoomComposite `focus:<identity>`; solo / no remotes → recorder’s camera. Locked for that segment. Template falls back to any live camera if that id has no track yet. Main + PiPs + EDGE brand. |
| Cap | **10 minutes** (`CHAT_CALL_RECORDING_MAX_SECONDS = 600`) |
| Warnings | Visual + audible at **1:00** and **0:15** left |
| Stop | Stop Egress + post chat card; **call stays live** |
| Pipeline | LiveKit **RoomComposite** (custom template [`call-egress.html`](../call-egress.html), **720×1280 portrait**) → R2 → `content_encoding = call_recording` + `video_url` |
| Hangup while recording | Edge stops active egress so the file can finalize |

**Vendor:** LiveKit Cloud (managed SFU). Do not peer-mesh WebRTC.

## Architecture

- **Membership:** `chat_room_members` (Edge rejects non-members).
- **Call state:** `chat_calls` + `chat_call_participants` (migrations through **`20260728090000`** including `recording_featured_identity`).
- **Media:** LiveKit room name `edge-call:{call_id}` (never client-chosen). Publish sources follow **`media_mode`** (camera allowed when video).
- **Tokens / recording control:** Edge Function **`chat-calls`** (`LIVEKIT_*` + Lounge R2 secrets + **`CHAT_CALL_EGRESS_TEMPLATE_BASE_URL`**).
- **Egress template:** vanilla (no React) Vite page → **`dist/call-egress.html`** + external JS, mirrored to R2 via **`publish-call-egress-template`** / **`publish-call-egress-template-local.mjs`** (`https://media-test.lvslotpro.com/call-egress/call-egress.html` on test). Layout = **`focus:<identity>`** (focused remote / recorder). **`START_RECORDING` waits until a camera is attached** (8s failsafe). A missing featured track falls back to any live camera so the MP4 is not a blank waiting frame. `CHAT_CALL_EGRESS_USE_CUSTOM=0` forces built-in `speaker`. Do not point LiveKit at the Vercel HTML. Republish the R2 template after `vanilla.js` changes.
- **Egress finalize:** Edge Function **`livekit-egress-webhook`** (`verify_jwt = false`; LiveKit signature). On `egress_ended` success → insert `call_recording` message; set `recording_status = ready`.
- **In-app ring (any screen):** `ChatCallProvider` mounts in **`AppShell`** while signed in (not only inside `ChatTab`), so Lounge/Guides/etc. still get the overlay on web / PWA / Android. **IPA hides `ChatIncomingCallOverlay`** … CallKit is the incoming answer UI; live chrome still mounts after accept. Realtime `postgres_changes` on `chat_calls` + broadcast `chat-call-{roomId}` (includes `recording_*` events). Accept/deep link opens Chat via `pendingChatRoomId`.
- **Offline ring:** `activity_events.event_type = chat_call_invite` → immediate Edge push (not DM 60s batch). Payload includes `eventType` + `chatCallId`. Service worker suppresses OS call push only after a **visibility probe** (`document.visibilityState === 'visible'`)... never trust `client.focused` alone on iPhone PWA. Probe listener installs from **`main.jsx`** (`chatCallPushProbeListener.js`) so it answers before AppShell mounts; SW wait **800ms**. Deep link `/?tab=chat&room={uuid}&call={callId}`; notificationclick **postMessage** includes `callId`/`roomId` and **skips** `client.navigate` for call invites **and** missed callbacks (PWA reload was wiping accept / Call back UI). Tap also posts **`chat-call-invite-inapp`** (same path as visible-tab delivery) so Accept UI is not stuck behind a deep-link profile-fetch race. Durable handoff: SW also writes Cache **`edge-pending-app-navigate-v1`** (iOS often drops postMessage on wake); AppShell drains on `pageshow` / visibility / provider mount. Session stash: `edge_pending_chat_call_v1`. Pref: `push_messages`.
- **Missed replace:** unanswered hangup / timeout → status `missed` + `chat_call_missed` activity push with the **same** `chatCallId` tag → OS notification becomes “Missed call from {name}” (Android replaces; iOS best-effort). Tap opens `/?tab=chat&room=&missedCall=` → DM + **Call back?** prompt (matches original voice/video). Deep-link effect must not clear pending on cancelled effect runs; only clear after accept UI / callback prompt actually opens (keeps iOS wake retries alive). **In-app Lounge notifications** also list `chat_call_missed` (migration **`20260728030000`**; ringing `chat_call_invite` stays push/overlay only).
- **Push subscribe:** client uses RPC **`upsert_my_push_subscription`** (reclaim endpoint) so Android enable does not fail RLS when the endpoint row belonged to another user. **Intent + quiet repair:** **`pushOptInIntent.js`** remembers in-app opt-in separately from the live PushManager/`push_subscriptions` row; on open, if intent is on and OS permission is still granted but the sub is gone, **`useLoungePushNotifications`** resubscribes silently. AppShell only prompts (“Re-enable notifications” / blocked in system Settings) when silent repair fails or permission is denied (7-day dismiss cooldown).

## Edge actions

See [`supabase/functions/chat-calls/README.md`](../supabase/functions/chat-calls/README.md).

Hangup uses **`leave_call`**: marks the caller’s participant `left_at`, removes them from LiveKit. **Group** stays up only if **2+** participants remain after leave (if two are left and one hangs up, the call ends for the last person too). **DM** always ends. **`end_call`** still force-ends for everyone. Active recording egress is stopped on leave/end/decline when still recording.

## Client

- `src/features/chat/calls/` — session UI, incoming overlay (caller avatar + name), API, controller, recording cues (`chatCallRecordingTone.js`).
- Header: DM Phone + Video; group Voice + Video (absolute right). Avatar/title stay screen-centered; room options live in the name › sheet (no ⋯ menu).
- **In-call / ringing chrome:** WhatsApp-style dark stage, large peer avatar while ringing/audio, one-row bottom pill. **Group voice** shows every LiveKit participant as an avatar tile (name under it) with a green halo while that person is speaking (web: LiveKit `useSpeakingParticipants`; IPA: native `participants[].isSpeaking` on `edge-native-call-state`). **Video stage** (`planCallVideoLayout` + IPA `layoutCountStage`): **2 = featured full-bleed + inset** (default remote featured / You inset). Tap the inset (pill visible) to swap; Flip then sits top-right of the screen. Flip fades with the pill. Chrome-up inset keeps the hidden 9:16 height and goes 3:4 (wider); chrome-hidden inset is 9:16. Camera-off inset is a rounded square + avatar + speaking dots. **3–4 = featured remote full-bleed, other remotes + You stacked on the right (You always bottom)**; 5+ = featured top + 2-row bottom (floor/ceil, You last). Single tap while the pill is hidden shows the pill; **double-tap** a remote (or the 2-person inset) focuses immediately. 5+ uses a compact lower pill. IPA: `focusedIdentity` + `controlsHidden` (`quadFocus` ignored). IPA hit tiles are transparent so they do not paint over native video. Lock-screen accept retries `chat-calls` once after a JWT refresh on 401. **New TestFlight required.** Voice: Video / Speaker / Mute / End. Video: **Record / Video / Speaker / Mute / End**. **Record is video-only** and is not on the voice dock. While recording, Record becomes Stop (starter or call host). Others see a dimmed Record. Flip camera (video calls, cam on) toggles front/back via LiveKit `restartTrack({ facingMode })`, with device-cycle fallback. **Speaker defaults:** voice → earpiece intent; video → **speakerphone**. Cam off on video → earpiece intent again (unless user manually toggled speaker). **Speaker button** only on non-iOS when sinks can actually switch (`canToggleCallAudioRoute`). Android Chrome: phantom `audioinput` `Headset earpiece` / `Speakerphone`. **iPhone / iPad: always hidden** (`isIosDevice` hard gate). Safari still gets **`navigator.audioSession.type = 'play-and-record'`** and reset to `playback`→`auto` on hangup (`chatCallAudioSession.js`). Minimize (top-left) collapses to a **draggable** floating pill (app-wide via `ChatCallProvider` in AppShell; left control = peer avatar, tap to expand). **Expanded call stays planted** (`touch-action: none` + body scroll lock; cheek/ear contact cannot pan the stage... controls keep `data-chat-call-interactive`). Camera-off / muted camera shows avatar (not black).
- **Recording UX:** REC badge + elapsed status; any participant can Record; **Stop** for recording starter **or** call host; others see dimmed Record while live; countdown banners + cues at 1:00 / 0:15; auto `stop_recording` at 10:00 without hanging up. Record features the fullscreen remote (toast confirms). Template + R2 publish required for the MP4 to show cameras (do not start capture on the empty waiting chrome).
- **Call recording card:** `ChatCallRecordingCard` for `content_encoding === 'call_recording'`... durable poster via first successful client frame capture → R2 → Edge `attach_recording_poster` writes `stream_poster_url` (iOS primes with muted `play()` so canvas works; later opens use the stored `<img>`). Meta lives in `link_preview` (`kind: call_recording`). Inbox preview `[call recording] · m:ss`. Long-press: Share / Copy link; **Delete** for the recorder, group owner/admin, fan moderators, or either DM participant (`lounge-chat` `delete_message` + best-effort R2 cleanup).
- **Call summary card (historical):** on call end, Edge inserts a durable `content_encoding = call_summary` message (`ChatCallSummaryCard`) with `link_preview.kind = call_summary` (status, media_mode, duration, participant avatars). Stays in the thread after leave/reopen. Live late-join Join bar is separate and only while the call is open. Unique index on `link_preview->>'call_id'` for call_summary. **No voice-call transcription product** (summary card only).
- **Room details → Media, links & docs → Calls:** RPC **`chat_room_shared_calls`** lists `call_recording` + `call_summary` messages; tap jumps to the in-thread card.
- **Call recording transcript (video):** Edge **`chat-call-transcribe`** (Deepgram `nova-2` + `diarize_model=latest`) after finalize (best-effort) or on long-press **View transcript**. Utterances stored on `link_preview.transcript` with `speaker_map` → participant `user_id` (avatar + name). Room members can reassign speakers in the modal. Secrets: **`DEEPGRAM_API_KEY`**; optional async callback **`CHAT_CALL_TRANSCRIBE_PUBLIC_URL`** + **`CHAT_CALL_TRANSCRIBE_CALLBACK_SECRET`**.
- **DM decline quick replies** (`chatCallDeclineQuickReplies.js`): incoming overlay dropdown + **Decline & send** (decline call, then `chatSendMessage`). Circle decline still ends the call with no message. Group invites do not show this UI.

## Guardrails

- Max call duration **60 minutes**.
- Max **12** concurrent participants (group).
- Rate-limit starts (**8 / minute** / user).
- Bidirectional **blocks** gate DM calls.
- Recording max **10 minutes**; video-only; no auto-record of every call.
## iOS / PWA limits

- **No CallKit** ... incoming = web push + in-app overlay only.
- `getUserMedia` only after user tap (Start / Accept, or first-open PWA mic opt-in).
- **Mic permission:** request only when a call is **made or received** (LiveKit / `getUserMedia` on the call path). Do **not** show a first-open / sign-in mic sheet (`AppShell` no longer queues PWA mic opt-in). Helpers remain in `src/utils/pwaMicrophonePrompt.js` if call-side priming needs them.
- Keep Edge open during calls (background mic is best-effort on iPhone Safari/PWA).
- Call provider + overlay live at **AppShell** so tab switches do not tear down ringing/active media.
- **In-app tones:** Web / PWA: Web Audio ringtone on incoming overlay; outgoing **ringback** starts on the Start tap (`startOutgoingRingback`) and restarts after LiveKit connect so the audio session does not swallow it (`chatCallRingTone.js`). **IPA:** CallKit does not play PSTN ringback for generic handles, and Web Audio is silent under `playAndRecord`... outgoing ringback is native (`EdgeOutgoingRingback` in `EdgeLiveKitCallManager.swift`) until the first remote joins. Recording cues are separate (`chatCallRecordingTone.js`). Stops on accept/decline/answer/hangup / first remote. Not a substitute for OS notification sound when backgrounded. **IPA ringback needs a new TestFlight / Xcode Cloud build.** Web/PWA is Vercel `test` only.
- **Call audio (iPhone focus):** Accept/Start sets AudioSession **`play-and-record`**; hangup resets **`playback`→`auto`**. Speaker button **never shown** on iPhone/iPad. Safari often still forces **loudspeaker** while the mic is live... web cannot reliably force earpiece without CallKit. **1:1 voice** uses `webAudioMix: false` (HTML `<audio>`); **group** (and video) keep `webAudioMix: true`. `room.startAudio()` on connect + retries; “Tap for call audio” if still blocked.
- **Android mute vs speakerphone:** speaker routing uses phantom **`audioinput`** devices. Mute uses track **`mute()`/`unmute()`** (keeps capture open) + re-applies speaker route... not `setMicrophoneEnabled(false)`, which was dropping Speakerphone capture and forcing earpiece while the speaker button stayed lit.
- **Group remote audio:** LiveKitRoom uses **`webAudioMix: true`** (one AudioContext for all remotes) + `room.startAudio()` on connect/roster change; “Tap for call audio” if autoplay still blocks. Android speaker/earpiece applies on connect + toggle only... not on every join/leave (mic restart thrash was silencing people).

### iPhone PWA smoke (voice audio)

1. Voice DM: Accept → hear remote without hunting for “Tap for call audio” (or one clear tap fixes it).
2. Phone to ear stays usable; no total silence after 10–20s of talking.
3. No speaker button (or it actually switches if iOS exposes sinks)... never a fake toggle.
4. Hang up → Spotify/YouTube routing feels normal again.
5. Video call: starts loudspeaker when toggle exists; cam off → earpiece intent; cam on → speaker again.
## Setup checklist

1. Create LiveKit Cloud project; copy URL + API key/secret.
2. Apply SQL `20260728000000`–`20260728080000` on test (then prod when promoting).
3. Set Edge secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on the project (**both** test + prod). Reuse Lounge R2 secrets for egress output (`LOUNGE_CF_R2_*` / Cloudflare account). Optional override **`CHAT_CALL_EGRESS_TEMPLATE_BASE_URL`** (defaults: test → `https://lvslotpro.com/call-egress.html`, prod → `https://edgetilt.com/call-egress.html`).
4. Deploy `chat-calls` + `livekit-egress-webhook` + redeploy `lounge-send-activity-push` when invite push changes. Apply SQL through **`20260728090000`**.
5. LiveKit Cloud → Webhooks → `https://<project-ref>.supabase.co/functions/v1/livekit-egress-webhook` (at least **egress_ended**). Ensure the LiveKit project can write to the R2 bucket (S3-compatible).
6. Smoke: DM video unchanged; group video 3+ (strip/pin/cam off); **pin remote → Record → Stop → playback features pinned cam**; no pin → features recorder; Record by A blanks B; cues; stop early → card; hangup while recording finalizes file.

**Prod promote (2026-07-27):** SQL through **`20260728030000`** (+ **`20260728040000`** replica identity) + Edge **`chat-calls`** / **`lounge-send-activity-push`** on **`jtjgtucumuoswnbauxry`**. Frontend via **`main`**.

**Prod promote (2026-07-27, UX batch):** WhatsApp in-call polish, group leave semantics, earpiece/speaker, late-join Join bar + avatars → **`main`**; redeploy **`chat-calls`** on prod for **`leave_call`** / end-when-≤1-remains. No new SQL.

**Group video + recording (test first):** SQL through **`20260728090000`**; redeploy **`chat-calls`** with egress template secret; deploy **`livekit-egress-webhook`**; configure LiveKit webhook; ship frontend **`call-egress.html`**. Promote prod only after Ryan sign-off.

**Prod promote (2026-07-28, recording + transcripts):** SQL **`20260728050000`–`110000`** on **`jtjgtucumuoswnbauxry`**; Edge **`chat-calls`** / **`livekit-egress-webhook`** / **`chat-call-transcribe`** / **`publish-call-egress-template`**; R2 host **`https://media.lvslotpro.com`**; template published; LiveKit webhook + Deepgram confirmed. Frontend via **`main`**. **Voice live STT later removed** (product cut)... video recording transcripts remain.

### Prod media host — Gate before Record promote

**Current prod host:** **`https://media.lvslotpro.com`** (R2 custom domain on the Lounge media bucket; same bucket as **`media-test.lvslotpro.com`**).

`media.edgetilt.com` is deferred: `edgetilt.com` is Cloudflare Registrar in a different account and can’t move for ~60 days after purchase. After the lock, move the zone into the R2 account and attach `media.edgetilt.com`, then flip secrets.

1. Keep **`media-test.lvslotpro.com`** + **`media.lvslotpro.com`** both attached to the bucket. Edge/client URL allowlists accept **both** hosts so delete/poster/resize still work for older `media-test` rows after flipping the prod public base.
2. Confirm CORS allows **`https://edgetilt.com`** (and localhost if needed); **`AllowedHeaders`**: `Content-Type`, `Cache-Control`.
3. Prod Edge secret **`LOUNGE_CF_R2_PUBLIC_BASE_URL=https://media.lvslotpro.com`** + Vercel Production **`VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL`** to match.
4. Publish template: `node scripts/publish-call-egress-template-local.mjs --target=production` → `https://media.lvslotpro.com/call-egress/call-egress.html`.
5. `chat-calls` template URL prefers **`LOUNGE_CF_R2_PUBLIC_BASE_URL`** when set (optional override **`CHAT_CALL_EGRESS_TEMPLATE_BASE_URL`**).
6. Prod **`DEEPGRAM_API_KEY`** + LiveKit webhook → `https://jtjgtucumuoswnbauxry.supabase.co/functions/v1/livekit-egress-webhook` (`egress_ended`).
