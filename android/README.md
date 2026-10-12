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

Needs JDK 17 and the Android SDK (platform 36, build-tools 36). On Ryan's Mac:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
cd android
./gradlew assembleStagingDebug   # app/build/outputs/apk/staging/debug/app-staging-debug.apk
./gradlew assembleProdDebug
adb install -r app/build/outputs/apk/staging/debug/app-staging-debug.apk
```

`local.properties` (`sdk.dir=...`) is gitignored; `ANDROID_HOME` works too.

## Release (Play)

Upload key lives in `android/upload-keystore.jks` + `android/keystore.properties` (both gitignored; see `keystore.properties.example`). Alias **`edgetilt-upload`** (CN=EdgeTilt / Digiverse Ventures LLC, created 2026-10-08).

```bash
cd android
./gradlew bundleProdRelease   # app/build/outputs/bundle/prodRelease/app-prod-release.aab
```

Bump `versionCode` every upload. First Console step: create a Play **organization** account (Ryan has D-U-N-S; org accounts skip the 12-tester closed test), enroll Play App Signing, upload the AAB to an **internal** testing track.

**Fingerprints (SHA-256):** upload `33:56:43:97:85:D1:4C:AD:1B:CF:E8:89:34:31:8E:04:98:2B:AB:85:1C:D6:20:1B:0D:51:EE:41:B4:8D:7D:36`, debug `26:4E:6A:82:56:0F:D2:1D:8F:1A:67:13:F5:33:8E:04:97:16:A3:52:1B:C8:9C:07:14:12:33:95:0F:87:92:E3`. After Play App Signing enrolls, add the **app signing** certificate SHA-256 from Console → Setup → App signing into `public/.well-known/assetlinks.json` (devices verify that cert, not only the upload key).

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
| `endNativeCall(json)` | Stops the native ring for `{ callId?, reason?: 'remote' }`. Returns JSON `{ ok }`. APK **1.3.0+** |
| `callRingWebReady()` | Flushes buffered `edge-callkit-answer` / `decline` / `end` window events (cold-start answer before the page existed). Returns JSON `{ ok, replayed }`. APK **1.3.0+**. **1.3.3+:** Answer / Decline bring the shell forward without a `?tab=chat&room=` `loadUrl`. **1.3.4+:** Answer keeps the Telecom connection active until hangup and holds `MODE_IN_COMMUNICATION`. |
| `setAudioRoute(json)` | In-call earpiece ↔ speakerphone via `AudioManager` (`MODE_IN_COMMUNICATION` + `isSpeakerphoneOn`). `json` = `{ route: 'speaker' \| 'earpiece' }`. Returns JSON `{ ok, route }`. APK **1.3.5+**. Web: `chatCallAudioOutput.js` calls this on every Speaker tap in the EdgeAndroid shell (phantom mic restart still runs as backup). |

Web feature-detects each newer method (`typeof EdgeAndroid.share === 'function'`), so older sideloaded APKs keep the web fallbacks. `shareViaBestAvailable`, `triggerEdgeNativeHaptic`, tap haptics and the composer portrait lock route to these automatically. Call ring: `src/utils/edgeCallKit.js` routes `reportEdgeIncomingCall` / listeners / `markEdgeCallKitWebReady` to Android when those methods exist; media stays web LiveKit (not a native LiveKit SDK).

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

Ryan (2026-09-29): bring the IPA's native wins to Android. Priority order and checkboxes live in `docs/test-buildout-backlog.md` → **Android** → *Native parity roadmap*. **Shipped:** call ring, MOV prep, share, photo picker, haptics / orientation, audio route, App Links plumbing (1.3.6). **Next native:** Live Updates (live session status), background Lounge video upload, ML Kit scan / OCR, shortcuts + widget. Add each new `window.EdgeAndroid` method to the bridge table above before the web side calls it.

**Device debugging:** phone on USB with USB debugging on, `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.edgetilt.app)`, then any CDP client on `localhost:9222` (both the main WebView and bet sheet / popup WebViews show up as targets).

## Known gaps (MVP)

- **Google sign-in:** Google refuses OAuth in embedded WebViews. `EdgeWebViews.presentAsChrome` (both activities) drops the `; wv` UA marker and rewrites the Sec-CH-UA brand from "Android WebView" to "Google Chrome". `X-Requested-With: <package>` is still sent: current WebView ignores `setRequestedWithHeaderOriginAllowList` (verified on WebView 133). Polymarket Google login from the **home page** is a full-page Auth0 redirect; from a **market page** ("Log in to trade") it is an Auth0 **popup** that hands the code back via `window.opener.postMessage`. `BetSheetActivity` therefore supports multiple windows: `onCreateWindow` stacks a child WebView over the sheet, `onCloseWindow` / back removes it. Before that (Sep 28), the popup loaded in place with no opener and sat blank on `auth0.polymarket.us/authorize/resume`. Verified on Ryan's Galaxy A15 (WebView 151) with the Google test account (`GOOGLE_TEST_*` in `.env.local`): market page → Google popup → popup closes → signed in (Polymarket onboarding). polymarket.us can take ~15 s to send its first byte, so a white sheet right after open is often just that wait.
- **Billing:** Play policy on web subscriptions from the app is not settled (see backlog Android section).
- **App Links:** code + `assetlinks.json` landed (APK **1.3.6**). Needs site deploy (`test` → lvslotpro; `main` → edgetilt) and, after first Play upload, the Play **app signing** SHA-256 added to assetlinks. Until verification succeeds, Chrome still owns the taps.
