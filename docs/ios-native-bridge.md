# iOS native bridge contract (stub)

**Status:** scaffold + device Run green (2026-08-23). `getInfo` + `openInSafari` + **`bustServiceWorker`** (boot + bridge) implemented; camera/mic/photo/location usage strings + WK media-capture grant. Remaining stubs: `requestPushPermission`, `getPushToken`, `setAudioSession`.  
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
| `getInfo` | JS→native | none | `{ shellVersion, build, environment: 'test'\|'prod', ua }` | Mac | **native** (`ios/` scaffold) |
| `openInSafari` | JS→native | `{ url: string }` | `{ ok: boolean }` | Mac | **native** (`ios/` scaffold) |
| `requestPushPermission` | JS→native | none | `{ status: 'granted'\|'denied'\|'prompt' }` | Mac | stub (rejects) |
| `getPushToken` | JS→native | none | `{ token: string \| null }` | Mac | stub (rejects) |
| `setAudioSession` | JS→native | `{ mode: 'playback'\|'voiceChat'\|'default' }` | `{ ok: boolean }` | Mac | stub (rejects) |
| `bustServiceWorker` | JS→native *or* boot-only | none / `{ scope?: string }` | `{ ok: boolean, unregistered?: number, cacheKeysDeleted?: number }` | Mac (boot) | **native** (boot clear + bridge; 2026-08-23) |

**Web-owned (no Swift required for first cut):**

| Behavior | Web ownership | Notes |
| --- | --- | --- |
| Hide Stripe Checkout / subscribe CTAs in WebView | Windows | **Done (2026-08-24):** `openExternalBillingUrl` on Edge checkout / portal, fan Connect / checkout / portal, affiliate Connect, staff bot fan Connect. Shell → Safari; web → assign. |
| Deep link handling after APNs | Both | Native opens URL; web already has `?tab=` / lounge routes |
| Lounge unmuted autoplay | Mac config + Windows playback paths | WKWebView media policy on native; web keeps existing autoplay store |
| Skip web push SW in shell | Windows | **Done (2026-08-24):** `useWebPushNotifications` unsupported under `isEdgeiOSShell()`; no `push-sw` register. A2HS / install-for-push gated via `iosPwaInstallRequired`. APNs still Mac. |

**v1.1 (do not stub-implement yet):** CallKit, StoreKit IAP, background ring.

### StoreKit IAP (v1.1 note)

v1 ships **Safari link-out only** for digital subs (Slots Edge, fan subs, Connect onboarding). That is enough for a clean US App Review story if CTAs never open Stripe inside WKWebView.

**v1.1 (optional, safer dual-path):** StoreKit 2 products that grant the **same** `get_my_entitlements()` / fan-sub rows as Stripe webhooks. Web keeps Stripe; shell can offer IAP beside “Continue in Safari.” May **upcharge IAP** for Apple’s cut. Do not invent a second entitlement system. Counsel + App Review notes before submit.

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

Two Cursor chats = **two Theos, no shared memory**. Continuity = **git + this doc + `WAKEUP` + backlog Update log**.

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
| **Start** | `git checkout test` → `git pull`. Skim **`WAKEUP`** Pick up here + this file if touching shell/bridge. |
| **During** | Stay in lane. New bridge method → update this table **before** freestyle. |
| **End (meaningful work)** | Commit + push **`test`**. 2–5 lines in **`WAKEUP`** (done / next / bridge notes). Backlog Update log if a decision or ship fact. |
| **Never** | Push **`main`** / prod Supabase / prod Edge without Ryan’s explicit ask. |

### Parallel safety

- Same **`test`** branch is OK for this sprint if ownership holds.
- Long risky Windows refactors: optional feature branch off `test`; tell Mac via `WAKEUP`.
- Do **not** Capacitor, bake `dist/` into the IPA, or start Android TWA in the iOS shell lane.
- Prefer **`scripts/.tmp-*`** scratch; never commit secrets / `.env*`.

`AGENT_RULE_DUAL_MACHINE_IOS` — searchability token.
