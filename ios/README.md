# Edge iOS shell (raw WKWebView)

Thin native loader for the live Edge site. **Not Capacitor.** No baked Vite `dist/`.

| Scheme | Config | Loads |
| --- | --- | --- |
| **EdgeTilt Test** | Debug | `https://lvslotpro.com` |
| **EdgeTilt Prod** | Release | `https://edgetilt.com` |

- Bundle ID: `com.edgetilt.app`
- Shell version / UA token: `EdgeiOS/0.1.0` (see `AppConfig.swift`)
- Bridge: `window.EdgeNative` … contract **`docs/ios-native-bridge.md`**
- **Safe area:** WebView is **edge-to-edge** (`.ignoresSafeArea()`). Native injects `--edge-sat|sar|sab|sal` from **window / SwiftUI geometry** insets (not `webView.safeAreaInsets`, which SwiftUI zeroes under ignoresSafeArea). Web uses `max(env(safe-area-inset-*), var(--edge-*))`. See `EdgeSafeAreaInsets.swift` + `src/utils/edgeSafeAreaCss.js`.
- **App icon:** `AppIcon-1024.png` generated from live web pack **`public/EdgeIconBlack/`** (same as `public/apple-touch-icon.png`). Upscaled 310→1024, flattened onto black (no alpha) for App Store rules. Swap with a true 1024 master when you have one.
- **Push (APNs):** bridge `requestPushPermission` / `getPushToken` are implemented. Personal Team builds omit `CODE_SIGN_ENTITLEMENTS` (Apple’s free profile has no Push). After **org Apple Developer** enroll: add Push Notifications capability, set `CODE_SIGN_ENTITLEMENTS: EdgeTilt/EdgeTilt.entitlements` in `project.yml`, `xcodegen generate`, rebuild. Token → Edge send path still needs Windows DB/Edge work.

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

### Safari Web Inspector (device WKWebView)

1. iPhone: **Settings → Apps → Safari → Advanced → Web Inspector** → On  
2. Mac Safari: enable the **Develop** menu  
3. Run **EdgeTilt Test** from Xcode (Debug). Debug builds set `webView.isInspectable = true` (required iOS 16.4+)  
4. Safari → **Develop → [your iPhone] →** `lvslotpro.com` / EdgeTilt page  

If you only see **No Inspectable Applications**, the shell isn’t running in Debug, or you’re on an old IPA without `isInspectable`. Rebuild ▶ and keep the app foregrounded.

## Dual-machine

Mac owns this folder. Windows owns `src/**`. See **`docs/ios-native-bridge.md`**.
