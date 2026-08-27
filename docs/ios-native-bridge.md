# iOS native bridge contract (stub)

**Status:** scaffold + device Run green (2026-08-23). Web gates for Stripe / push-sw / Lounge unmuted handoff landed on Windows **`test` ≥ `6a3155e2`** (2026-08-24). `getInfo` + `openInSafari` + **`bustServiceWorker`** (boot + bridge) implemented; camera/mic/photo/location usage strings + WK media-capture grant. **`setAudioSession`** live (2026-08-24). **`requestPushPermission` / `getPushToken`** live in Swift; web uploads hex to **`apns_device_tokens`** (2026-08-25). Send needs Edge **`APNS_*`** secrets + redeploy. **Edge-to-edge safe area** (2026-08-24): inject `--edge-sat|…`; web `max(env(), var(--edge-*))`. **Ryan device sign-off 2026-08-25:** post-detail Island pad (title bar only, matches Safari/PWA) + no letterbox / ← clear of Island / FAB vs home indicator / feed title chrome. **Mac next:** IPA APNs P0 closed on test. ~~APNs tap smoke~~ **Ryan PASSED 2026-08-25.** ~~APNs tap wiring~~ **landed 2026-08-25.** ~~APNs delivery~~ **Ryan sign-off 2026-08-25.** ~~Native APNs permission smoke~~ **Ryan sign-off 2026-08-25.** ~~Hard-crash leaving post detail~~ **Ryan could-not-repro 2026-08-25.** ~~OAuth-in-shell~~ **Ryan sign-off 2026-08-25** (Google in-WebView). ~~Stripe→Safari / no A2HS~~ **Ryan sign-off 2026-08-25.** **GIF picker (Ryan smoke PASSED 2026-08-25, IPA + web):** IPA hides the WK accessory bar. Klipy search takes focus. Sheet uses the layout viewport (keyboard overlays).  
**Stack:** raw **`WKWebView`** live-site shell (not Capacitor). Product web stays on Vercel; IPA is a thin loader + bridges.  
**Canonical product plan:** **`docs/test-buildout-backlog.md`** → **Planned (Native shells / app stores)** (+ **Native gap checklist**).  
**Dual-agent rules:** this file § Dual-machine + root **`WAKEUP`** + **`AGENTS.md`** (`AGENT_RULE_DUAL_MACHINE_IOS`).  
**Open project:** `ios/README.md` … prefer **Xcode-beta** for iOS 27 devices.

---

## Goals

1. One **named** JS ↔ Swift surface so Mac and Windows Theos do not invent parallel APIs.
2. Web remains usable in Safari / PWA when native is absent (feature-detect, never require the shell).
3. New bridge methods that old binaries lack stay **safe no-ops** or gated until users update from the store.

---

## Detection (web)

| Signal | Spec (v1 target) |
| --- | --- |
| **UA substring** | **`EdgeiOS/0.1.0`** (token format `EdgeiOS/<semver>`; bump with `AppConfig.shellVersion` in `ios/`) |
| **Global** | `window.EdgeNative` injected at document start |
| **Helper** | **`src/utils/edgeNative.js`** … `isEdgeiOSShell()`, `readEdgeiOSShellVersion()`, `edgeNativeInvoke(method, payload)`, **`openExternalBillingUrl(url)`** (shell → `openInSafari`; else `location.assign`) |

**Do not** treat generic iOS Safari / PWA as the store shell. Positive checks only (`AGENT_RULE_POSITIVE_PLATFORM_GUARDS`).

---

## Namespace

- **JS → native:** `window.EdgeNative.<method>(…)` returning `Promise` where async (Swift fulfills via `WKScriptMessage` / reply handler).
- **Native → JS (rare):** `window.EdgeNativeEvents` or `CustomEvent` on `window` … prefer pull (web asks) unless push/token refresh forces push.
- **Names:** camelCase methods. No Capacitor-style `Plugins.*`.

---

## Method table (v1 stub)

Statuses: **stub** = agreed name, not implemented; **native** / **web** filled in as each side lands.

| Method | Direction | Payload (draft) | Result (draft) | Owner first | Status |
| --- | --- | --- | --- | --- | --- |
| `getInfo` | JS→native | none | `{ shellVersion, build, environment: 'test'\|'prod', apsEnvironment: 'development'\|'production', ua }` | Mac | **native** (`ios/` scaffold). `apsEnvironment` mirrors entitlements (still `development` until App Store). |
| `openInSafari` | JS→native | `{ url: string }` | `{ ok: boolean }` | Mac | **native** (`ios/` scaffold) |
| `requestPushPermission` | JS→native | none | `{ status: 'granted'\|'denied'\|'prompt' }` | Mac | **native** + **web caller** (2026-08-25): Lounge Settings toggle → `requestEdgeiOSPushPermission()` |
| `getPushPermissionStatus` | JS→native | none | `{ status: 'granted'\|'denied'\|'prompt' }` | Mac | **native** + **web** (2026-08-25): read-only; never prompts |
| `getPushToken` | JS→native | none | `{ token: string \| null }` | Mac | **native** + **web** (2026-08-25): Lounge Settings polls after grant and **uploads** hex to `apns_device_tokens`. Send needs Edge `APNS_*` secrets + function redeploy. |
| `setAudioSession` | JS→native | `{ mode: 'playback'\|'voiceChat'\|'default' }` | `{ ok: boolean }` | Mac | **native** (2026-08-24) + **web caller** (2026-08-25): Lounge Tap for sound → `ensureEdgeiOSPlaybackAudioSession()`. Shell also applies `.playback` on launch / becomeActive unless a call owns `.playAndRecord`. |
| `bustServiceWorker` | JS→native *or* boot-only | none / `{ scope?: string }` | `{ ok: boolean, unregistered?: number, cacheKeysDeleted?: number }` | Mac (boot) | **native** (boot clear + bridge; 2026-08-23) |
| `openAppSettings` | JS→native | none | `{ ok: boolean }` | Mac | **native** + **web caller** (2026-08-26): push-denied path opens iOS Settings so alerts can be re-enabled. **Device smoke pending.** |
| `setAudioRoute` | JS→native | `{ route: 'speaker'\|'earpiece' }` | `{ ok: boolean }` | Mac | **native** + **web caller** (2026-08-26): call speaker toggle. Voice defaults earpiece, video defaults speaker. **Device smoke pending.** |
| `triggerHaptic` | JS→native | `{ style?: 'light'\|'medium'\|'heavy'\|'success'\|'warning'\|'error' }` | `{ ok: boolean }` | Mac | **native** (`EdgeHaptics.swift`, 2026-08-26). Web still uses the iOS switch trick in `tapHaptic.js`; **no shell caller wired yet** … see caution below. |
| `getCallKitCapabilities` | JS→native | none | `{ supported: boolean, voipToken: string \| null }` | Mac | **native** (2026-08-26). Lets web decide CallKit vs in-app ring UI. **Device smoke pending.** |
| `reportIncomingCall` | JS→native | `{ callId, handle, hasVideo?, roomId? }` | `{ ok: boolean, uuid?: string, deduped?: true }` | Mac | **native** (2026-08-26). **Deduped by `callId` 2026-08-27** … see caution below. **Device smoke pending.** |
| `endNativeCall` | JS→native | `{ callId }` | `{ ok: boolean }` | Mac | **native** (2026-08-26): tears down the CallKit call on hangup/decline. **Device smoke pending.** |
| `getVoIPPushToken` | JS→native | none | `{ token: string \| null }` | Mac | **native** (2026-08-26): PushKit token, uploaded with `pushChannel: 'voip'`. Also fires `edge-voip-token` event on refresh. **Device smoke pending.** |
| `callKitWebReady` | JS→native | none | `{ ok: boolean, replayed: number }` | Mac | **native** + **web caller** (2026-08-27): web says its CallKit listeners are installed **and** a session exists; native replays buffered answer/decline. Fixes the cold-start dropped answer … see caution below. **Device smoke pending.** |
| `getStoreProducts` | JS→native | `{ productIds: string[] }` | `{ products: Array<{ id, title, price, priceLocale }> }` | Mac | **native** (StoreKit 2, 2026-08-26). **Device smoke pending** (needs App Store Connect products). |
| `purchaseStoreProduct` | JS→native | `{ productId, appAccountToken? }` | `{ ok, state, transactionId?, jws? }` | Mac | **native** (2026-08-26) + **web** SubscribeModal shell path. JWS verified server-side by Edge `apple-iap-verify`. **Device smoke pending.** |
| `restoreStorePurchases` | JS→native | none | `{ ok, entitlements: string[] }` | Mac | **native** (2026-08-26). **Device smoke pending.** |

**Web-owned (no Swift required for first cut):**

| Behavior | Web ownership | Notes |
| --- | --- | --- |
| Hide Stripe Checkout / subscribe CTAs in WebView | Windows | **Done (2026-08-24):** `openExternalBillingUrl` on Edge checkout / portal, fan Connect / checkout / portal, affiliate Connect, staff bot fan Connect. Shell → Safari; web → assign. |
| Deep link handling after APNs | Both | Native opens absolute `url` from the APNs payload (`userInfo.url`) in the existing WKWebView. **Mac 2026-08-25:** `didReceive` + cold-start pending / first-load consume. HTTPS + `lvslotpro.com` / `edgetilt.com` only. Web already has `?tab=` / lounge parsers. |
| Lounge unmuted autoplay | Mac config + Windows playback paths | **Ryan sign-off 2026-08-25:** Tap for sound → next clips stay audible (`ff9a8c16`). Safari/PWA still per-tile. |
| Skip web push SW in shell | Windows + Mac web | **Done (2026-08-24):** no `push-sw` register in shell; A2HS / install-for-push gated via `iosPwaInstallRequired`. **Lounge Settings native APNs toggle** wired 2026-08-25. **Offers reminders native path** wired 2026-08-26 (`edgeIOSApnsPush.js` + `useWebPushNotifications` shell branch … same `apns_device_tokens` row as Lounge). **Send** live on prod+test (**Ryan prod banner 2026-08-26**). |
| WKWebView geolocation | Mac | **Native (2026-08-26):** `EdgeLocationManager` + `WKUIDelegate` `requestGeolocationPermissionFor` grants when app has When In Use. `AppDelegate` requests authorization on launch. Web still uses `navigator.geolocation` (nearby casinos, poker currency). **Device smoke pending.** |
| Call audio session in shell | Mac + Windows web | **Web caller (2026-08-26):** `chatCallAudioSession.js` → `setAudioSession({ mode: 'voiceChat' })` on call enter, `default` on exit (native `.defaultToSpeaker` for voiceChat). **Device smoke pending** (speaker vs earpiece). |

**v1.1 (do not stub-implement yet):** CallKit, StoreKit IAP, background ring.

### StoreKit IAP (v1.1 note)

v1 ships **Safari link-out only** for digital subs (Slots Edge, fan subs, Connect onboarding). That is enough for a clean US App Review story if CTAs never open Stripe inside WKWebView.

**v1.1 (optional, safer dual-path):** StoreKit 2 products that grant the **same** `get_my_entitlements()` / fan-sub rows as Stripe webhooks. Web keeps Stripe; shell can offer IAP beside “Continue in Safari.” May **upcharge IAP** for Apple’s cut. Do not invent a second entitlement system. Counsel + App Review notes before submit.

### ⚠️ CallKit: one invite arrives three ways … dedupe by `callId` (2026-08-27)

**Read before touching `EdgeCallKitManager.reportIncomingCall`.** A single `chat_call_invite` can reach the shell through **three independent paths**, and every one of them used to mint a fresh `UUID`:

1. **Web Realtime** … `ChatCallProvider.jsx` calls `reportEdgeIncomingCall()` when the invite row arrives (foreground).
2. **APNs alert banner** … `EdgePushManager` `willPresent` → `handleCallInviteUserInfo()` (foreground only).
3. **PushKit VoIP** … `pushRegistry(_:didReceiveIncomingPushWith:)` (any app state).

Paths 2 and 3 both fire because **`lounge-send-activity-push` sends an alert push *and* a VoIP push** for `chat_call_invite` (`sendApnsToUser` + `sendVoipApnsToUser`). With `maximumCallGroups = 1` that meant duplicate or failed `reportNewIncomingCall` calls for one logical call, repeated `EdgeAudioSession.apply`, and worst of all **stranded CallKit calls**: `endCall` resolves a single UUID, so declining cleared one and left the others up ("stuck on a call that does not exist").

**Fix:** `reportIncomingCall` now returns the **existing** UUID when a call with the same trimmed `callId` is already tracked (`deduped: true`). All three paths converge on one CallKit call. **Do not** re-add per-path UUID minting, and **do not** "fix" this by removing one of the three paths … each is load-bearing for a different app state.

**Also hardened:** `resolveUUID` no longer falls back to `calls.keys.first` when a **specific** `callId` was named but not found, so hanging up call B cannot tear down call A. The argument-less fallback stays; `endAllCalls()` is the blanket teardown.

### ⚠️ CallKit native→JS events must be buffered … the web layer does not exist yet (2026-08-27)

**Read before touching `dispatchToWeb` or `installEdgeCallKitListeners`.** A VoIP push wakes the shell **from terminated**, so the order on a cold-start ring is:

1. PushKit wakes the app → `reportNewIncomingCall` → CallKit rings on the lock screen. **No web view has loaded.**
2. Ryan answers → `provider(_:perform: CXAnswerCallAction)` → `dispatchToWeb('edge-callkit-answer')`.
3. `dispatchToWeb` was fire-and-forget (`guard let webView else { return }`, then a bare `window.dispatchEvent`). The page either did not exist or had not mounted `ChatCallProvider`, so **the CustomEvent landed with no listener and the answer was gone.**

Symptom (device smoke, 2026-08-27): the ring worked, answering swapped CallKit to the hang-up button because we `fulfill()`ed the action, but the native screen sat on **"Calling"** forever and the web app never joined LiveKit. The giveaway was that **"Calling" is not a string the web app contains** … it was iOS's own call UI, proving the web side never ran.

**Fix:** native buffers call events (cap **8**, oldest dropped) until JS calls **`callKitWebReady`**, then replays them. Invalidate on `didStartProvisionalNavigation` since a new page load kills the listeners.

**Two traps if you re-touch this:**

- **Readiness is not "listeners installed."** `joinCall` throws `Sign in to call.` without a Supabase session, and a replayed answer has **no second chance** (the rejection is swallowed by `void`). So `markEdgeCallKitWebReady()` is called from an effect gated on **`supabaseClient && viewerUserId`**, not from `installEdgeCallKitListeners`.
- **Answering does not give you audio for free.** `provider(_:didActivate:)` / `didDeactivate` are now implemented: CallKit owns activation for an answered call and WebKit's capture unit has to start against the already-active session. Without them you can reach a connected call with no audio.

### ⚠️ CallKit caller name is not the APNs body (2026-08-27)

**Read before touching VoIP `callerName` or `willPresent`.** `lounge-send-activity-push` builds the alert as `title: Edge Chat` / `body: "${who} is calling you"`, then stuffs **the whole body** into the VoIP payload as `callerName` (the `replace(/^.*from\s+/i)` never matches this copy). CallKit uses that as `localizedCallerName`, so the native banner reads **"Theo Mac is calling you"** for the entire call … answering cannot change it, because the sentence *is* the name.

The APNs alert is a **sibling** of the VoIP ring, not the CallKit UI. Answering CallKit never updates that card. In foreground, `willPresent` used to present it *and* report CallKit, so the user saw two "is calling" surfaces.

**Native defense (this commit):** `sanitizedCallerName` strips a trailing `is calling you` / `is calling` before `reportNewIncomingCall`. Successful report / answer / end also `removeDeliveredCallInviteNotifications`. Foreground `willPresent` for `chat_call_invite` reports CallKit and presents **nothing** (no stacked banner).

**Still Windows-owned at the source:** VoIP `callerName` should be the actor display name, not the alert body. Do not "fix" this by deleting the alert push … it is the fallback when VoIP is missing.

### ⚠️ Lock-screen answer needs `audio` + a live page, not just `voip` (2026-08-27)

**Read before touching `UIBackgroundModes` or `EdgeWebView.makeUIView`.** Two device-smoke failures, same architecture:

1. **Phone locked.** CallKit shows "Incoming call." Answer swaps the button to hang up and nothing connects. `voip` only keeps us alive long enough to **report** the incoming call. After `fulfill()`, iOS suspends the process unless **`audio`** is in `UIBackgroundModes`, so WKWebView JS never runs, `callKitWebReady` never fires, and the buffered answer dies. Compounding that, a cold `makeUIView` waited on service-worker hygiene **before the first `load`**, so the page had not even started when the user answered.
2. **Phone unlocked.** A nicer CallKit UI connects, then the app comes to the front and **dismisses** the system in-call screen. That steal was us: CallKit answer called `joinCall({ openRoom: true })` and mounted full-screen `ChatCallSession` (plus a full-screen Suspense fallback). iOS already hides the native in-call UI when the app is foreground … we made it worse by navigating to the room.

**Fix:** add `audio` to `UIBackgroundModes`; `beginCallBackgroundTask` from report/answer until end; skip SW hygiene when a CallKit call is already tracked; CallKit answer is `preferAccept: true`, `openRoom: false`, `startMinimized: true`.

**Honest limit:** answering while the phone is **unlocked** still foregrounds Edge. That is iOS, not us. We no longer replace CallKit with a second full-screen web call. We cannot keep the full-screen system "you're on a call" UI while our window is the foreground app.

---

## Debug builds feel broken … measure before you "fix" (2026-08-26)

**Read this before chasing any shell performance report.** A whole session was burned reverting good v1.1 work chasing "the app needs multiple taps," which turned out to be **Debug build + Xcode debugger attached** … not a code regression at all.

`Debug` is `-Onone` with the Main Thread Checker and LLDB attached. On device that is genuinely sluggish and **will** produce scary-looking console output that has nothing to do with our code.

**Triage order (both cheap, do them first):**

1. Open the same URL in **Mobile Safari** on the device. Still slow? → web problem.
2. Launch the app from the **home screen icon** (no Xcode). Still slow? → shell problem.

If both are fine, the build configuration is the answer and there is nothing to fix. Use the **`EdgeTilt Test Fast`** scheme (below) for any perceived-performance work.

**Console noise that is NOT a bug** (all confirmed benign): `CHHapticEngine … releaseChannel: ERROR: This channel was not registered`, `Gesture: System gesture gate timed out`, `Unable to simultaneously satisfy constraints` naming `TUIPredictionViewCell` / `TUICandidateGradientContentLabel` (that is the **keyboard predictive bar**, system-owned), `RTIInputSystemClient … Can only set suggestions for an active session`, `Reporter disconnected`, `RBSServiceErrorDomain Code=1 "Client not entitled"`, `Couldn't open <private>`, `xpc_user_sessions_get_foreground_uid() failed`, `makeImagePlus … 'WEBP' … err=-50`, `Invalid UIScreen coordinate space conversion`, `markAllLayersVolatile: Failed`. Do not open investigations on these.

### `EdgeTilt Test Fast` scheme

| | |
| --- | --- |
| **Configuration** | `ReleaseTest` … `-O` + `wholemodule`, `EDGE_ENV_TEST` (so it loads **lvslotpro.com**, *not* prod) |
| **Debugger** | detached (`PosixSpawn` launcher), Main Thread Checker off |
| **Use for** | any responsiveness / gesture / scroll / animation judgement on device |
| **Do not use for** | breakpoint debugging … there is no debugger attached; use `EdgeTilt Test` |

`ReleaseTest` exists because `EDGE_ENV_PROD` is set by the **`Release` configuration**, not by the scheme. Flipping the Test scheme to `Release` would silently point a test build at **edgetilt.com**. If you add configurations, keep that mapping in mind.

---

## Windows → Mac handoff (2026-08-24)

**`test` tip:** **`6a3155e2`** (and parents **`02915d1b`**, **`83f447a4`**). Mac: `git pull` on `test`. Wait for Vercel **`lvslotpro.com`** to pick up the tip before device smoke (web gates live on the site the shell loads).

### Already done (Windows … do not re-implement)

| Item | What shipped | Mac action |
| --- | --- | --- |
| Stripe / fan / affiliate / bot Connect | `openExternalBillingUrl` → `EdgeNative.openInSafari` in shell | **Smoke:** Subscribe / Manage billing / Connect opens **system Safari**, not Checkout inside WKWebView |
| Skip web push + A2HS | No `push-sw.js` register; `iosPwaInstallRequired` false in shell; How to Install chip already hidden | **Smoke:** Settings Notifications / Offers do **not** nag Add to Home Screen. Offers + Lounge both use native APNs toggle (2026-08-26). |
| Lounge unmuted feed handoff | `appleWebKitBlocksFeedSoundHandoff()` … EdgeiOS uses Android-style coordinated sound; Safari/PWA unchanged | **Smoke** (below). **No new Swift** if media policy still open |
| Install chip + Lottie | Prior commits | Device smoke optional |

### Mac must do next (smoke + remaining P0)

1. **Pull `test` ≥ `6a3155e2`.** Confirm IPA still has in `EdgeNativeBridge.makeConfiguration()`:
   - `allowsInlineMediaPlayback = true`
   - `mediaTypesRequiringUserActionForPlayback = []`
   If either drifted, restore + rebuild. Do **not** edit `src/**`.
2. **Lounge unmuted handoff smoke (EdgeTilt Test → `lvslotpro.com`):** ~~open~~ **Ryan sign-off 2026-08-25** (`ff9a8c16`). Tap for sound → next clips stay audible. Do not invent Safari unmute hacks in `ios/`.
3. **Stripe→Safari smoke:** ~~open~~ **Ryan sign-off 2026-08-25.** Joey K fan unsub → Stripe customer portal in system Safari. Settings / Offers: no A2HS nag.
4. **Continue Mac P0:** ~~APNs bridge + `setAudioSession`~~ **landed 2026-08-24** (token after Individual membership activates + Push entitlement). ~~Safe area / Island pad / unmute handoff~~ **Ryan device sign-off 2026-08-25.** ~~OAuth-in-shell~~ **Ryan sign-off 2026-08-25** (Google stayed in WKWebView). Remaining: device Run with Push entitlement + Windows token upload/send. ~~Hard-crash leaving post detail~~ **Ryan could-not-repro 2026-08-25.** ~~Lounge GIF picker keyboard~~ **Ryan smoke PASSED 2026-08-25** (IPA + web).

### Mac slice (2026-08-24)

- Confirmed `allowsInlineMediaPlayback = true` + `mediaTypesRequiringUserActionForPlayback = []` (no drift).
- Implemented `setAudioSession` (`playback` / `voiceChat` / `default`).
- Implemented `requestPushPermission` + `getPushToken` + `AppDelegate` register hooks. **`CODE_SIGN_ENTITLEMENTS`** wired 2026-08-25 for Individual team **`8932AKQW4W`**.
- No `src/**` edits.

Canonical checklist: backlog **Native gap checklist** → **P0 Mac**. Session notes: root **`WAKEUP`**.

---

## Change protocol (both agents)

1. **Propose** the method row here (or in chat + land in this file same day) **before** coding both sides.
2. Prefer **stub on one side first** (usually Mac injects empty `EdgeNative` with `getInfo`; Windows feature-detects).
3. Same arc when possible: Mac lands handler + Windows lands caller in commits that reference each other in messages / `WAKEUP`.
4. **Never** rename a shipped method without a version field on `getInfo` and a web fallback.
5. Update this table status when something moves stub → implemented.

`AGENT_RULE_IOS_BRIDGE_CONTRACT` — searchability token.

---

## Dual-machine agent ruleset

Two Cursor chats = **two Theos, no shared memory**. Continuity = **git + this doc + `WAKEUP` + backlog Update log**. Fast messages (no git pull): **https://lvslotpro.com/theo** (`docs/theo-channel.md`).

### Ownership (default)

| Lane | Owns (edit freely) | Hands off |
| --- | --- | --- |
| **Mac / iOS shell** | **`ios/`**, this bridge doc’s **native** columns, Xcode/project, shell-only docs | `src/**` feature work, web CSS, Edge Functions, SQL, poker catalog workflow |
| **Windows / web** | `src/**`, `supabase/**`, web docs, catalog runner / GHA web side | **`ios/**`**, Xcode project, native-only plist / signing |

**Shared (coordinate first):** this file, **`WAKEUP`**, **`docs/test-buildout-backlog.md`** Planned native section, UA string / scheme constants that both sides import.

Conflict rule: **Mac wins `ios/`**; **Windows wins `src/`**. Do not “helpfully” edit the other lane the same day.

### Session ritual

| When | Do |
| --- | --- |
| **Start / before any edit** | `git checkout test` → fetch and match **`origin/test`** (pull if behind; stop if diverged). Skim **`WAKEUP`** Pick up here + this file if touching shell/bridge. See **`.cursor/rules/sync-origin-before-edit.mdc`**. |
| **During** | Stay in lane. New bridge method → update this table **before** freestyle. Ping the other Theo via **https://lvslotpro.com/theo** (Ryan says `read /theo`). |
| **End (meaningful work)** | Commit + push **`test`**. 2–5 lines in **`WAKEUP`** (done / next / bridge notes). Backlog Update log if a decision or ship fact. |
| **Never** | Push **`main`** / prod Supabase / prod Edge without Ryan’s explicit ask. |

### Parallel safety

- Same **`test`** branch is OK for this sprint if ownership holds.
- Long risky Windows refactors: optional feature branch off `test`; tell Mac via `WAKEUP`.
- Do **not** Capacitor, bake `dist/` into the IPA, or start Android TWA in the iOS shell lane.
- Prefer **`scripts/.tmp-*`** scratch; never commit secrets / `.env*`.

`AGENT_RULE_DUAL_MACHINE_IOS` — searchability token.
