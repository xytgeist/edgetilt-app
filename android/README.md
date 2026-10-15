# EdgeTilt Android shell

A thin native WebView around the live site (like the iOS WKWebView shell) plus an in-app **bet sheet** for Kalshi and Polymarket links.

**Why it exists:** on Android, App Links send kalshi.com / polymarket.us taps from Chrome or the PWA into the Kalshi / Polymarket apps, which drop the order ticket. Web-only workarounds (Chrome `intent://`, same-site hops) all still opened the apps (Ryan tested Sep 28, web `1.4.896` / `1.4.897`). A WebView never fires App Links, so the bet sheet lands on the exact ticket.

## Layout

| File | What |
| --- | --- |
| `app/src/main/java/com/edgetilt/app/MainActivity.kt` | Full-screen WebView on `BuildConfig.BASE_URL`. File picker (system photo picker when the input only takes images / videos, Android 13+; it renames files to `<id>.mp4` / `.jpg`, so web sniffs bytes where the name mattered, e.g. `sniffLoungeAndroidQuicktimeSource`), camera/mic (getUserMedia), geolocation, back = history, render-crash recovery. |
| `.../EdgeVideoPrep.kt` | Picked iPhone QuickTime videos (`ftyp qt`) are converted with Media3 Transformer (hardware H.264, HDR tone-mapped to SDR, short side capped at 1080) before WebView gets them, behind a "Preparing video" card (Cancel / back cancels). Output `cache/video/` via the same `FileProvider`. Failure hands back the original, so web's iPhone-MOV alert still covers it. APK 1.2.0+ |
| `.../EdgeShare.kt` | System share sheet for `EdgeAndroid.share` (text / URL / up to 4 images via `FileProvider` `${applicationId}.files`, cache `share/`). |
| `.../EdgeCallRing.kt` | Incoming chat-call ring orchestrator (Telecom + notification + JS events). APK 1.3.0+ |
| `.../EdgeCallConnectionService.kt` | Self-managed `ConnectionService` (CallKit equivalent). |
| `.../EdgeIncomingCallActivity.kt` | Full-screen Answer / Decline on the lock screen. |
| `.../BetSheetActivity.kt` | Portrait-locked light sheet (Done / title / Open app). Kalshi loads the `op_` ticket URL as is. Polymarket runs `/native/bet-sheet-polymarket.js` (same auto-tap script the IPA uses) once after the first page load. |
| `.../EdgeLinks.kt` | Link routing: app hosts stay in the WebView, bet hosts open the sheet, Supabase / Google auth stays in the WebView, everything else opens outside (browser / app). |
| `app/build.gradle.kts` | Flavors: `prod` (`com.edgetilt.app`, edgetilt.com, "Edge") and `staging` (`com.edgetilt.app.test`, lvslotpro.com, "Edge Test"). |

UA gets ` EdgeAndroid/<versionName>` appended so the site can detect the shell later. The bet sheet strips `; wv` so Kalshi / Polymarket serve their normal mobile web.

Logins inside the bet sheet persist (shared WebView cookie store).

## Build

Needs JDK 17 and the Android SDK (platform 36, build-tools 36). `local.properties` (`sdk.dir=...`) is gitignored; `ANDROID_HOME` works too.

### Mac

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
cd android
./gradlew assembleStagingDebug   # app/build/outputs/apk/staging/debug/app-staging-debug.apk
./gradlew assembleProdDebug
adb install -r app/build/outputs/apk/staging/debug/app-staging-debug.apk
```

### Windows (PC)

One-time (Scoop). JDK 17 + Android cmdline-tools live under `%USERPROFILE%\scoop\apps\…`:

```powershell
scoop bucket add java
scoop install temurin17-jdk
scoop bucket add extras
scoop install android-clt

# User env (new terminals pick these up; current session set them too)
[Environment]::SetEnvironmentVariable('JAVA_HOME', "$env:USERPROFILE\scoop\apps\temurin17-jdk\current", 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:USERPROFILE\scoop\apps\android-clt\current", 'User')
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

# Licenses + packages (sdkmanager warns about --path / --install; ignore)
yes | sdkmanager --licenses
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"

# Gitignored; Gradle reads this if ANDROID_HOME is missing (double backslashes)
$sdkEscaped = $env:ANDROID_HOME.Replace('\', '\\')
"sdk.dir=$sdkEscaped" | Set-Content -Encoding ascii android\local.properties
```

Build (same Gradle tasks as Mac):

```powershell
cd C:\dev\edgetilt-app\android
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
.\gradlew.bat assembleStagingDebug
# APK: app\build\outputs\apk\staging\debug\app-staging-debug.apk
.\gradlew.bat assembleProdDebug
adb install -r app\build\outputs\apk\staging\debug\app-staging-debug.apk
```

Verified on Ryan's Windows PC 2026-10-15 (`assembleStagingDebug` BUILD SUCCESSFUL).

## Release (Play)

Upload key lives in `android/upload-keystore.jks` + `android/keystore.properties` (both gitignored; see `keystore.properties.example`). Alias **`edgetilt-upload`** (CN=EdgeTilt / Digiverse Ventures LLC, created 2026-10-08).

**Windows:** copy those two files from the Mac (or NordPass / private backup) into `android/` before any release assemble. Debug builds do not need them.

```bash
cd android
./gradlew bundleProdRelease   # app/build/outputs/bundle/prodRelease/app-prod-release.aab
# Windows: .\gradlew.bat bundleProdRelease
```

Bump `versionCode` every upload. Org account + Play App Signing + internal track are live (see fingerprints below).
**Fingerprints (SHA-256):**
- **Play app signing** (devices from Play): `45:CC:6E:17:6B:E9:19:B2:D3:7E:09:F0:17:2E:6B:8E:9D:F4:AB:BE:50:F2:AF:8C:44:7D:1B:AB:E8:00:9E:92`
- **Upload key:** `33:56:43:97:85:D1:4C:AD:1B:CF:E8:89:34:31:8E:04:98:2B:AB:85:1C:D6:20:1B:0D:51:EE:41:B4:8D:7D:36`
- **Debug:** `26:4E:6A:82:56:0F:D2:1D:8F:1A:67:13:F5:33:8E:04:97:16:A3:52:1B:C8:9C:07:14:12:33:95:0F:87:92:E3`

All three for `com.edgetilt.app` live in `public/.well-known/assetlinks.json`. Play Console org: **DIGIVERSE VENTURES LLC** / `play@digiverse.ventures` (developer `8014913311107911454`). App **Edge Tilt** internal testing: **23 (1.3.19)** video export poster; next AAB **24 (1.3.20)** ML Kit scan + OCR. Needs web **`1.4.1132`**+ on the host the APK loads ( **`1.4.1201`**+ for Start-session shortcut sheet). Next AAB **25 (1.3.21)** shortcuts + live-session widget.

## App Links

`MainActivity` declares `autoVerify` https VIEW filters for the flavor host (`edgetilt.com` / `lvslotpro.com` + www) on `/auth/confirm`, `/lounge/p/`, `/lounge/g/`, `/u/`, and `/` (SPA query deep links). `EdgeLinks.isAllowedAppLink` + `canonicalWebUri` mirror the IPA Universal Link allowlist and rewrite share permalinks to `/?tab=home&post=` / `&game=` / `&u=` so the WebView skips OG HTML.

Site half: `public/.well-known/assetlinks.json` (served with `Content-Type: application/json` via `vercel.json`). Live on **lvslotpro.com** after `test` deploy; **edgetilt.com** after Ryan promotes `main`. Verify: `adb shell pm get-app-links com.edgetilt.app` (or `.test`) after install + a few minutes for Google to fetch assetlinks.

## JS bridge (`window.EdgeAndroid`)

Web side: `src/utils/edgeAndroid.js` (`isEdgeAndroidShell()` = UA has `EdgeAndroid/`). Methods only answer while the main frame is on edgetilt.com / lvslotpro.com.

| Method | Returns |
| --- | --- |
| `pushStatus()` | `granted` / `denied` / `prompt` (POST_NOTIFICATIONS on Android 13+) |
| `requestPush()` | Shows the permission dialog, then fires `window` event `edge-android-push` with `detail.status` |
| `requestLocation()` | Shows the location dialog unless already granted (no result event) |
| `pushToken()` | FCM token, `''` until Firebase is configured / has minted one |
| `openAppSettings()` | This app's notification settings |
| `info()` | JSON `{ appId, version, firebase }` |
| `share(json)` | Opens the system share sheet. `json` = `{ url?, text?, title?, images?: [{ mimeType, base64, filename? }] }` (IPA `share` payload). `true` when shown (the chooser does not report cancel). APK 1.1.0+ |
| `haptic(style)` | `light` / `medium` / `heavy` / `success` / `warning` / `error` via `performHapticFeedback` (IPA `triggerHaptic` styles). APK 1.1.0+ |
| `setOrientationLock(lock)` | `portrait` forces portrait while a composer is open, `none` releases. Phones only (smallest width < 600dp). A full page load also releases. APK 1.1.0+ |
| `reportIncomingCall(json)` | Starts a self-managed Telecom ring + full-screen Answer / Decline UI. `json` = `{ callId, roomId?, handle?, hasVideo?, avatarUrl? }`. Returns JSON `{ ok, deduped? }`. Same events as an FCM `chat_call_invite`. APK **1.3.0+** |
| `endNativeCall(json)` | Stops the native ring for `{ callId?, reason?: 'remote' }`. Returns JSON `{ ok }`. APK **1.3.0+**. **1.3.8+:** system Telecom End / Abort also emits `edge-callkit-end` (or decline if still ringing) so web `leave_call` runs … fixes Android End leaving the iPhone in-call. |
| `callRingWebReady()` | Flushes buffered `edge-callkit-answer` / `decline` / `end` window events (cold-start answer before the page existed). Returns JSON `{ ok, replayed }`. APK **1.3.0+**. **1.3.3+:** Answer / Decline bring the shell forward without a `?tab=chat&room=` `loadUrl`. **1.3.4+:** Answer keeps the Telecom connection active until hangup and holds `MODE_IN_COMMUNICATION`. |
| `setAudioRoute(json)` | In-call earpiece ↔ speakerphone via `AudioManager` (`MODE_IN_COMMUNICATION` + `isSpeakerphoneOn`). `json` = `{ route: 'speaker' \| 'earpiece' }`. Returns JSON `{ ok, route }`. APK **1.3.5+**. Web: `chatCallAudioOutput.js` calls this on every Speaker tap in the EdgeAndroid shell (phantom mic restart still runs as backup). |
| `startWebAuthSession(json)` | Chrome Custom Tabs OAuth (IPA `ASWebAuthenticationSession` twin). `json` = `{ url, callbackScheme? }` (default scheme `edgetilt`). Returns JSON `{ ok, started?, via?, error? }` immediately; completion is window event `edge-android-webauth` with `{ ok, url?, cancelled?, error? }`. APK **1.3.7+**. Web: `startEdgeWebAuthSession` / `nativeGoogleOAuth.js` (EdgeTilt Google sign-in + Fantasy Yahoo). |
| `syncLiveBankrollActivity(json)` | Live slots / poker session ongoing notification (iOS ActivityKit twin). `json` = `{ slots?, poker? }` (same payload as IPA). Empty ids clear. Tap → `https://…/?tab=bankroll\|poker-bankroll` + Intent extra (APK **1.3.12+**; older builds used `edgetilt://live-session`). Android 16+ Live Update promotion. Handoff beats WebView restore; warm uses popstate + retry `edge-live-session-open`. Web: `syncEdgeLiveBankrollActivity`. |
| `pickEdgeVideo(json)` | IPA twin. `json` = `{ purpose?, maxSourceBytes?, maxUploadBytes?, maxClipSeconds?, requestId? }`. Starts system video picker; completes with window event `edge-android-video-result` `{ requestId, ok, cancelled?, assetId?, previewUrl?, duration?, width?, height?, byteSize?, posterJpegBase64?, error? }`. Progress N/A. Preview is same-origin `https://…/__edge_native_video__/<id>` (WebView intercept; `edge-video://` kept as alias). APK **1.3.14+** (1.3.13 used `edge-video://` which failed HTML5 playback). |
| `exportEdgeVideo(json)` | IPA twin. Trim/crop/re-encode via Media3 under a `dataSync` foreground service. Completes via `edge-android-video-result` with `{ ok, assetId, sourceAssetId, byteSize, previewUrl, passthrough?, width?, height?, posterUrl? }`. **1.3.19+:** `posterUrl` is the trim-start still (passthrough seeks source; re-encode probes the exported file); `width`/`height` are display pixels for the clip. Progress: `edge-native-video-progress` `{ phase, progress, assetId }` (`checking` / `encoding`). APK **1.3.13+**. |
| `uploadEdgeVideoTus(json)` | Lounge Stream tus (create Edge + PATCH). Completes via `edge-android-video-result`. Progress phase `upload`. APK **1.3.13+**. |
| `uploadEdgeVideoPut(json)` | Chat R2 PUT to a presigned URL. Completes via `edge-android-video-result`. Progress phase `upload`. APK **1.3.13+**. |
| `cancelEdgeVideo(json)` | `{ assetId? }` cancels in-flight encode/upload (and pending pick). Returns JSON `{ ok: true }`. APK **1.3.13+**. |
| `scanDocument(json)` | IPA twin. ML Kit Document Scanner (Play services UI). `json` = `{ purpose?, maxPages?, requestId? }` (default 1 page, max 8). Returns `{ ok, started, requestId }` immediately; completes with window event `edge-android-scan-result` `{ requestId, ok, cancelled?, unsupported?, images?: [{ mimeType, base64, width, height }], error? }`. JPEG ≤2000px. APK **1.3.20+**. Web: `canScanEdgeDocument` / `scanEdgeDocument`. |
| `recognizeText(json)` | IPA twin. Bundled ML Kit Latin OCR. `json` = `{ imageBase64, mimeType?, purpose? }`. Returns JSON `{ ok, text?, confidence?, lines?, error? }` (sync). JPEG/PNG ≤8MB decoded, downscaled to 2000px. APK **1.3.20+**. Web: `canRecognizeEdgeText` / `recognizeEdgeText`. |

Web feature-detects each newer method (`typeof EdgeAndroid.share === 'function'`), so older sideloaded APKs keep the web fallbacks. **Native video:** `canPickEdgeVideo()` is true on EdgeAndroid only when pick+export+tus+**put**+cancel all exist (Lounge and Chat share that gate). File-chooser MOV prep (`EdgeVideoPrep`) stays as fallback. `shareViaBestAvailable`, `triggerEdgeNativeHaptic`, tap haptics and the composer portrait lock route to these automatically. Call ring: `src/utils/edgeCallKit.js` routes `reportEdgeIncomingCall` / listeners / `markEdgeCallKitWebReady` to Android when those methods exist; media stays web LiveKit (not a native LiveKit SDK).

## Permissions after sign-in

Nothing prompts at launch. After sign-in / account creation (member UI up, splash gone), `src/utils/nativeStartupPermissions.js` calls `EdgeAndroid.requestPush()` then `EdgeAndroid.requestLocation()`, once per member per device (localStorage). The push answer fires `edge-native-push-changed`, so the Lounge hook re-reads status and uploads the FCM token (Lounge push pref defaults on). Same flow on the IPA. Web location calls then get granted silently by `onGeolocationPermissionsShowPrompt`.

## Push (FCM)

Web: `src/utils/edgeNativePush.js` routes Lounge Settings / Offers reminders to FCM in this shell (APNs in EdgeiOS). Tokens land in **`fcm_device_tokens`** (`upsert_my_fcm_device_token` / `delete_my_fcm_device_token`, migration `20260929040000`). Server: `supabase/functions/_shared/fcmPush.ts` sends data-only HIGH priority messages next to every APNs send (`lounge-send-activity-push`, `send-due-offer-reminders`, `send-test-push`). **`chat_call_invite`** is handled in `EdgePushService` → `EdgeCallRing` (self-managed `ConnectionService` + `CallStyle` notification + full-screen `EdgeIncomingCallActivity`). Answer / Decline fire the same `edge-callkit-*` window events as CallKit. **`chat_call_missed`** ends any active ring for that `chatCallId`, then shows the normal missed alert. Other events still use `EdgePush.show`. APK **1.3.0+**.

**Setup (one time, Firebase console):**

1. Create a Firebase project (Ryan's Google account / org).
2. Add Android apps `com.edgetilt.app` and `com.edgetilt.app.test`, download `google-services.json` (one file covers both) into `android/app/`. The Gradle plugin only applies when that file exists, so builds without it simply have push off.
3. Project settings → Service accounts → Generate new private key. Paste the whole JSON as Supabase secret **`FCM_SERVICE_ACCOUNT_JSON`** (test first, prod on promote).

**Status:** Firebase project **`edge-ce06c`** ("Edge", investigence@gmail.com). Both apps registered; `app/google-services.json` is committed (client config, not a secret; GitHub secret scanning flagged its API key Sep 29, alert closed as won't fix). That "Android key (auto created by Firebase)" is restricted in Google Cloud → Credentials to **FCM Registration API + Firebase Installations API** only (other APIs return 403). Adding another Firebase client feature (Remote Config, Crashlytics, App Check, ...) means adding its API to that key first. Test secret set Sep 28 from service account `firebase-adminsdk-fbsvc@edge-ce06c`; prod secret set from the same key (kept in gitignored `.env.fcm-service-account.local` on Ryan's Mac), prod migration + 3 Edge deploys done Sep 28. Emulator smoke: token registered as Theo, `send-test-push` returned `sent:1`, notification showed on the `edge_alerts` channel, tap reopened the app on the link.

## Native parity roadmap

Ryan (2026-09-29): bring the IPA's native wins to Android. Priority order and checkboxes live in `docs/test-buildout-backlog.md` → **Android** → *Native parity roadmap*. **Shipped:** call ring, MOV prep, share, photo picker, haptics / orientation, audio route, App Links, Google Custom Tabs, live-session notification / Live Updates (1.3.9), native Lounge/Chat video (1.3.19), **ML Kit document scan + OCR (1.3.20)**, **app shortcuts + live-session widget (1.3.21)**. No new `EdgeAndroid` methods for shortcuts/widget (static XML + `EdgeLiveBankroll` prefs). Add each new `window.EdgeAndroid` method to the bridge table above before the web side calls it.

### App shortcuts + live-session widget (APK 1.3.21+)

- **Long-press icon:** Lounge (`edgetilt://open?tab=home`), Start session (`…&startSession=1` → bankroll start sheet), Log a win (`…?tab=logbook`). Flavor package via `@string/shortcut_target_package`.
- **Widget:** `EdgeLiveSessionWidget` … idle “No live session” or live title/text from the last `syncLiveBankrollActivity`; tap opens bankroll / poker-bankroll (same handoff as the ongoing notif).
- **Web:** `1.4.1201`+ reads `?tab=bankroll&startSession=1`.

**Device debugging:** phone on USB with USB debugging on, `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.edgetilt.app)`, then any CDP client on `localhost:9222` (both the main WebView and bet sheet / popup WebViews show up as targets).

## Known gaps (MVP)

- **EdgeTilt Google sign-in (APK 1.3.7+):** Google blocks OAuth inside the shell WebView (Error 400: disallowed_useragent). Real fix = Chrome Custom Tabs via `EdgeAndroid.startWebAuthSession` → Supabase redirect `edgetilt://auth-callback` → `exchangeCodeForSession` in the WebView (PKCE stays in WebView storage). Web **`1.4.1119`** (`prompt=select_account`). **Ryan smoke PASSED 2026-10-12 (Google login only).** Fantasy Yahoo on Android uses the same Custom Tabs bridge.
- **Polymarket / Kalshi Google (bet sheet):** still in-sheet via `EdgeWebViews.presentAsChrome` (UA + Sec-CH-UA Chrome disguise). Not Custom Tabs. Polymarket Google from a **market page** is an Auth0 **popup** (`window.opener.postMessage`); `BetSheetActivity` stacks a child WebView. Verified on Ryan's Galaxy A15 with `GOOGLE_TEST_*`. Do not route book logins through `startWebAuthSession`.
- **Billing:** Play policy on web subscriptions from the app is not settled (see backlog Android section).
- **App Links:** code + `assetlinks.json` (incl. Play app-signing SHA) landed (APK **1.3.6+**). File live on **edgetilt.com** + **lvslotpro.com**. **Ryan smoke PASSED 2026-10-12** (`/lounge/p/…` from Chrome → Edge SPA).
