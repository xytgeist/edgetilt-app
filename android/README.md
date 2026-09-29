# EdgeTilt Android shell

A thin native WebView around the live site (like the iOS WKWebView shell) plus an in-app **bet sheet** for Kalshi and Polymarket links.

**Why it exists:** on Android, App Links send kalshi.com / polymarket.us taps from Chrome or the PWA into the Kalshi / Polymarket apps, which drop the order ticket. Web-only workarounds (Chrome `intent://`, same-site hops) all still opened the apps (Ryan tested Sep 28, web `1.4.896` / `1.4.897`). A WebView never fires App Links, so the bet sheet lands on the exact ticket.

## Layout

| File | What |
| --- | --- |
| `app/src/main/java/com/edgetilt/app/MainActivity.kt` | Full-screen WebView on `BuildConfig.BASE_URL`. File picker, camera/mic (getUserMedia), geolocation, back = history, render-crash recovery. |
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

Upload key goes in `android/keystore.properties` (gitignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`; `./gradlew bundleProdRelease` then signs with it. Bump `versionCode` every upload.

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

## Permissions after sign-in

Nothing prompts at launch. After sign-in / account creation (member UI up, splash gone), `src/utils/nativeStartupPermissions.js` calls `EdgeAndroid.requestPush()` then `EdgeAndroid.requestLocation()`, once per member per device (localStorage). The push answer fires `edge-native-push-changed`, so the Lounge hook re-reads status and uploads the FCM token (Lounge push pref defaults on). Same flow on the IPA. Web location calls then get granted silently by `onGeolocationPermissionsShowPrompt`.

## Push (FCM)

Web: `src/utils/edgeNativePush.js` routes Lounge Settings / Offers reminders to FCM in this shell (APNs in EdgeiOS). Tokens land in **`fcm_device_tokens`** (`upsert_my_fcm_device_token` / `delete_my_fcm_device_token`, migration `20260929040000`). Server: `supabase/functions/_shared/fcmPush.ts` sends data-only HIGH priority messages next to every APNs send (`lounge-send-activity-push`, `send-due-offer-reminders`, `send-test-push`). Android has no CallKit, so call invites / missed calls arrive as normal alerts from the activity worker. `EdgePushService` builds the notification; tapping opens the `url` in the app.

**Setup (one time, Firebase console):**

1. Create a Firebase project (Ryan's Google account / org).
2. Add Android apps `com.edgetilt.app` and `com.edgetilt.app.test`, download `google-services.json` (one file covers both) into `android/app/`. The Gradle plugin only applies when that file exists, so builds without it simply have push off.
3. Project settings → Service accounts → Generate new private key. Paste the whole JSON as Supabase secret **`FCM_SERVICE_ACCOUNT_JSON`** (test first, prod on promote).

**Status:** Firebase project **`edge-ce06c`** ("Edge", investigence@gmail.com). Both apps registered; `app/google-services.json` is committed (client config, not a secret). Test secret set Sep 28 from service account `firebase-adminsdk-fbsvc@edge-ce06c`; prod secret set from the same key (kept in gitignored `.env.fcm-service-account.local` on Ryan's Mac), prod migration + 3 Edge deploys done Sep 28. Emulator smoke: token registered as Theo, `send-test-push` returned `sent:1`, notification showed on the `edge_alerts` channel, tap reopened the app on the link.

## Native parity roadmap

Ryan (2026-09-29): bring the IPA's native wins to Android. Priority order and checkboxes live in `docs/test-buildout-backlog.md` → **Android** → *Native parity roadmap*: ringing calls (`ConnectionService`), live sessions as Android 16 Live Updates, background Lounge video (Media3 + WorkManager), App Links, then quick hooks (share, ML Kit scan / OCR, photo picker, haptics, orientation lock, audio route) and Android-only shortcuts + widget. Add each new `window.EdgeAndroid` method to the bridge table above before the web side calls it.

**Device debugging:** phone on USB with USB debugging on, `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.edgetilt.app)`, then any CDP client on `localhost:9222` (both the main WebView and bet sheet / popup WebViews show up as targets).

## Known gaps (MVP)

- **Google sign-in:** Google refuses OAuth in embedded WebViews. `EdgeWebViews.presentAsChrome` (both activities) drops the `; wv` UA marker and rewrites the Sec-CH-UA brand from "Android WebView" to "Google Chrome". `X-Requested-With: <package>` is still sent: current WebView ignores `setRequestedWithHeaderOriginAllowList` (verified on WebView 133). Polymarket Google login from the **home page** is a full-page Auth0 redirect; from a **market page** ("Log in to trade") it is an Auth0 **popup** that hands the code back via `window.opener.postMessage`. `BetSheetActivity` therefore supports multiple windows: `onCreateWindow` stacks a child WebView over the sheet, `onCloseWindow` / back removes it. Before that (Sep 28), the popup loaded in place with no opener and sat blank on `auth0.polymarket.us/authorize/resume`. Verified on Ryan's Galaxy A15 (WebView 151) with the Google test account (`GOOGLE_TEST_*` in `.env.local`): market page → Google popup → popup closes → signed in (Polymarket onboarding). polymarket.us can take ~15 s to send its first byte, so a white sheet right after open is often just that wait.
- **Billing:** Play policy on web subscriptions from the app is not settled (see backlog Android section).
- **App Links:** no `assetlinks.json` yet, so edgetilt.com links open in Chrome, not the app.
