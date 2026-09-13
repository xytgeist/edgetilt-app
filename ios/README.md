# Edge iOS shell (raw WKWebView)

Thin native loader for the live Edge site. **Not Capacitor.** No baked Vite `dist/`.

| Scheme | Config | Loads |
| --- | --- | --- |
| **EdgeTilt Test** | Debug | `https://lvslotpro.com` |
| **EdgeTilt Prod** | Release | `https://edgetilt.com` |

- Bundle ID: `com.edgetilt.app`
- Shell version / UA token: `EdgeiOS/0.1.0` (see `AppConfig.swift`)
- Bridge: `window.EdgeNative` … contract **`docs/ios-native-bridge.md`**
- **Keyboard accessory:** `WKContentView` `inputAccessoryView` is replaced with `nil` by default. Focused fields opt back in via `EdgeNative.setKeyboardAccessory({ visible: true })` (`EdgeKeyboardAccessorySync` in AppShell). GIF search stays hidden. Safari / PWA keep that bar. See `EdgeWebKitKeyboard.swift`.
- **Keyboard dismiss:** `WKWebView.scrollView.keyboardDismissMode = .interactive` (swipe down). Lounge Pro composer also blurs on a downward swipe when the write field is focused.
- **Audio:** boot + becomeActive apply `AVAudioSession` `.playback` (ignores Ring/Silent) unless a call already owns `.playAndRecord`. Lounge Tap for sound also calls `EdgeNative.setAudioSession({ mode: 'playback' })`.
- **Safe area:** WebView is **edge-to-edge** (`.ignoresSafeArea()`). Native injects `--edge-sat|sar|sab|sal` from **window / SwiftUI geometry** insets (not `webView.safeAreaInsets`, which SwiftUI zeroes under ignoresSafeArea). Web uses `max(env(safe-area-inset-*), var(--edge-*))`. See `EdgeSafeAreaInsets.swift` + `src/utils/edgeSafeAreaCss.js`.
- **App icon:** `AppIcon-1024.png` generated from live web pack **`public/EdgeIconBlack/`** (same as `public/apple-touch-icon.png`). Upscaled 310→1024, flattened onto black (no alpha) for App Store rules. Swap with a true 1024 master when you have one.
- **Push (APNs):** bridge `getPushPermissionStatus` / `requestPushPermission` / `getPushToken` live. `CODE_SIGN_ENTITLEMENTS` on. Team **`8932AKQW4W`**. Lounge Settings → native permission + token upload (web). Notification **tap** loads payload `url` in the existing WKWebView (`didReceive` / cold-start pending). No new `EdgeNative` method. HTTPS + edgetilt/lvslotpro hosts only.
- **Universal Links:** Associated Domains `applinks:edgetilt.com` / `lvslotpro.com`. Email confirm (`/auth/confirm`) opens the existing WKWebView via the same pending-URL queue. AASA on the live site. Gmail in-app can ignore UL; `edgetilt://auth/confirm?…` is the fallback (new binary). No new `EdgeNative` method.
- **Document camera:** `EdgeNative.scanDocument` → VisionKit. W-2G **Take photo** on a current IPA. Simulator often reports unsupported and falls back to the file input.
- **On-device OCR:** `EdgeNative.recognizeText` → Vision. W-2G extract on a current IPA for everyone (free and Starter+). Signed-in cloud only when the six fields look unsure. Simulator works. PWA / old IPA: signed-in cloud first, else tesseract. Bulk import is the only Starter+ W-2G difference.
- **Photo picker:** `EdgeNative.pickPhotos` → PHPicker. W-2G **Bulk import** on a current IPA. Max 40 JPEGs. Old IPA / PWA stay on `<input multiple>`.

## Open / build

**Xcode:** App Store **Xcode 26** is enough for Simulator. **Physical device on iOS 27** needs **Xcode 27 beta** (`Xcode-beta.app`). Open the beta for device Run.

```bash
cd ios
xcodegen generate   # regenerates EdgeTilt.xcodeproj from project.yml
open -a Xcode-beta EdgeTilt.xcodeproj   # or Xcode.app for Simulator-only
```

Or from repo root after generate:

```bash
export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer   # device / iOS 27
xcodebuild -project ios/EdgeTilt.xcodeproj -scheme "EdgeTilt Test" -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Pick **EdgeTilt Test** in Xcode and Run (▶) on a Simulator or a paired iPhone (Developer Mode on; Trust developer under **Settings → General → VPN & Device Management**).

**Archive / TestFlight build number:** do not pass `CURRENT_PROJECT_VERSION=126`. App Store Connect wants one increasing sequence across Test Fast, Prod, and local uploads. Stamp it:

```bash
BUILD_NUMBER="$(ios/scripts/next-ios-build-number.sh)"   # e.g. 20260911154432
xcodebuild ... CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive
```

Xcode Cloud uses the same stamp in `ios/ci_scripts/ci_post_clone.sh`.

### App Store status bar (9:41 / full Wi-Fi / full battery)

**EdgeTilt Prod** Run stamps the Simulator status bar after launch (`ios/scripts/stamp-app-store-status-bar.sh`). Physical device Runs skip it.

1. Scheme **EdgeTilt Prod**, Simulator destination (iPhone 17 Pro / Pro Max).
2. Run (⌘R). Wait for the app.
3. Confirm: `xcrun simctl status_bar booted list` … you want `Time: 9:41`.

If a cold boot races the post-action, run the script yourself from `ios/`:

```bash
./scripts/stamp-app-store-status-bar.sh
```

iOS 27 ignores `--time "9:41"`. The script sends a full Pacific ISO timestamp so the clock reads 9:41, not 2:41.

### Safari Web Inspector (device WKWebView)

1. iPhone: **Settings → Apps → Safari → Advanced → Web Inspector** → On  
2. Mac Safari: enable the **Develop** menu  
3. Run **EdgeTilt Test** from Xcode (Debug). Debug builds set `webView.isInspectable = true` (required iOS 16.4+)  
4. Safari → **Develop → [your iPhone] →** `lvslotpro.com` / EdgeTilt page  

If you only see **No Inspectable Applications**, the shell isn’t running in Debug, or you’re on an old IPA without `isInspectable`. Rebuild ▶ and keep the app foregrounded.

## Dual-machine

Mac owns this folder. Windows owns `src/**`. See **`docs/ios-native-bridge.md`**.
