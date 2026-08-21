# Edge iOS shell (raw WKWebView)

Thin native loader for the live Edge site. **Not Capacitor.** No baked Vite `dist/`.

| Scheme | Config | Loads |
| --- | --- | --- |
| **EdgeTilt Test** | Debug | `https://lvslotpro.com` |
| **EdgeTilt Prod** | Release | `https://edgetilt.com` |

- Bundle ID: `com.edgetilt.app`
- Shell version / UA token: `EdgeiOS/0.1.0` (see `AppConfig.swift`)
- Bridge: `window.EdgeNative` … contract **`docs/ios-native-bridge.md`**
- **App icon:** `AppIcon-1024.png` generated from live web pack **`public/EdgeIconBlack/`** (same as `public/apple-touch-icon.png`). Upscaled 310→1024, flattened onto black (no alpha) for App Store rules. Swap with a true 1024 master when you have one.

## Open / build

```bash
cd ios
xcodegen generate   # regenerates EdgeTilt.xcodeproj from project.yml
open EdgeTilt.xcodeproj
```

Or from repo root after generate:

```bash
xcodebuild -project ios/EdgeTilt.xcodeproj -scheme "EdgeTilt Test" -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Pick **EdgeTilt Test** in Xcode and Run (▶) on a Simulator.

## Dual-machine

Mac owns this folder. Windows owns `src/**`. See **`docs/ios-native-bridge.md`**.
