# Lounge Stream — Apple WebKit playback invariants

**Read this before editing `LoungePostStreamVideo.jsx`, `useLoungeStreamHlsAttachment.js`, or any iOS HLS recovery timer.**

Primary implementation: **`src/features/lounge/LoungePostStreamVideo.jsx`**.

Related: **`docs/test-buildout-backlog.md`** (shipped row + Update log **2026-07-26**), smoke §11 iPhone checks.

---

## Why this doc exists

**Jul 24–26, 2026 regressions** on iPhone/PWA were not random hero bugs ... they came from treating **`video.readyState === 0`** as "broken" while **hls.js MSE was already playing**. That caused:

- Feed autoplay **restart ~2–3s** after start (`cf-hls-ready` bump, native fallback timer, `active-hls-stall`, redundant `play()`).
- Hero **poster flash** + **snap** (MSE → native swap when `lightboxOpen` flipped mid-tap).
- Hero **offset + paused** on land (WAAPI left tile box + transform cleared; native swap on `heroPhase === 'open'`).

Fixes shipped **`e333601b`** (autoplay), **`6440854a`** / **`d1f6fdca`** / **`e4dd6f19`** (hero). **Ryan sign-off 2026-07-26** on iPhone PWA.

---

## Invariant 1 — `readyState=0` can mean "playing" on iOS MSE

On **iPhone / iPad Safari / PWA**, **hls.js MSE** often reports:

| Signal | Value while video is visibly playing |
| --- | --- |
| `video.readyState` | **`0` (`HAVE_NOTHING`)** for seconds |
| `video.paused` | **`false`** |
| `video.currentTime` | **advancing** |

This is **normal Apple WebKit + MSE behavior**, not a stall.

### Rule

**Never use `readyState < HAVE_METADATA` alone** on iOS to decide playback is broken.

Before any of these on Apple WebKit inline Stream tiles, call **`appleWebKitInlineStreamPlaybackLooksLive(el, minSec)`**:

- `bumpStreamAttach(...)` / `setStreamAttachKey`
- redundant `video.play()`
- swap **MSE → native HLS** (`tryMseNativeFallback`, `iosWantsNativeHls`)
- treat tile as "no decoded frame" for hero open

### Canonical helper

```javascript
function appleWebKitInlineStreamPlaybackLooksLive(el, minSec = 0.05) {
  return (
    Boolean(el) &&
    !el.paused &&
    !el.ended &&
    Number.isFinite(el.currentTime) &&
    el.currentTime > minSec
  )
}
```

**Related:** `streamInlineVideoHasDecodedFrame()` also treats looks-live as paintable.

### Gated call sites (grep before adding new timers)

| Reason / timer | Guard |
| --- | --- |
| `cf-hls-ready` attach bump | `!iosPlaybackLive` when rs < metadata |
| `CF_HLS_READY_NATIVE_FALLBACK_MS` (2800ms) | skip if looks live |
| `active-promote` bump | skip if looks live |
| `active-hls-stall` (4200ms) | skip if looks live |
| `openLightbox` attach bump | `!iosPlaybackLive` when rs < metadata |

**When adding a new iOS recovery path:** grep **`appleWebKitInlineStreamPlaybackLooksLive`** and extend the table above in this doc.

---

## Invariant 2 — Keep MSE for the whole hero session on iOS

Swapping **MSE → native HLS** when the hero **lands** (`heroPhase === 'open'`) detaches media and **`video.load()`** ... playback stops and layout can break.

### Rule

```javascript
const iosHeroMotionKeepMse =
  appleWebKitInlineStreamRef.current && lightboxOpen && heroPhase !== 'idle'
```

Keep **`preferMseHls: true`** for **opening, open, and closing** ... not only during FLIP animation.

Native HLS for **feed-wide sound** still applies when **`!lightboxOpen`**.

---

## Invariant 3 — Hero expand land must snap flyout to target rect

**WAAPI expand** (`runHeroExpandAnimation`) lays the flyout at the **feed tile** rect and animates **`transform`**. On finish:

1. **Cancel** the WAAPI animation (`animRef.cancel()`).
2. **Snap** to hero target via **`snapFlyoutToHeroOpen(flyout, targetRect)`** (clears tile box + transform, sets full-screen fixed rect).
3. Then set **`heroPhase = 'open'`** and **`tryHeroPlayback(v)`**.

**Do not** only call **`clearFlyoutHeroMotionStyles`** ... that clears transform but leaves tile **`top/left/width/height`**, which matches the "offset + rounded corners" bug.

**iOS expand** uses **imperative WAAPI** (same family as **`runHeroShrinkAnimation`**). Non-iOS may use CSS FLIP + `transitionend` ... both must call **`landHeroOpen()`**.

---

## Invariant 4 — Hero callback order (TDZ)

**`landHeroOpen`** depends on **`bumpHeroChrome`**. Define **`bumpHeroChrome` first** in the component. Defining `landHeroOpen` above it causes **`ReferenceError: Cannot access 'bumpHeroChrome' before initialization`** on lazy SocialFeed load (**`d1f6fdca`** hotfix).

---

## Invariant 5 — Expand vs shrink symmetry

| Motion | iOS path | Land / finish |
| --- | --- | --- |
| **Shrink** | WAAPI from hero frame → tile | `finishHeroCloseAnimation` |
| **Expand** | WAAPI from tile → hero frame | **`landHeroOpen`** + **`snapFlyoutToHeroOpen`** |

Expand historically used CSS `useLayoutEffect` while shrink used WAAPI ... React re-renders cleared transform mid-open. **Keep expand on WAAPI for iOS.**

---

## Smoke checklist (iPhone Safari or home-screen PWA)

After **any** change to Stream playback, hero, or HLS attach on Apple WebKit:

1. **Kill the PWA fully** (app switcher) and reopen from icon after deploy ... lazy chunks cache aggressively.
2. **Feed autoplay:** scroll to a playing tile ... video runs **10+ seconds** with **no restart** at ~2–3s.
3. **Hero open:** tap playing tile ... **no poster flash**, smooth **fly-in**, lands **centered**, **keeps playing** with chrome.
4. **Hero close:** swipe down ... smooth **fly-away**, feed tile resumes.
5. **Optional:** Tap for sound on feed ... handoff still OK (separate from hero MSE lock).
6. **EdgeiOS shell:** after unmute once, scroll handoff should keep audio. Sound sync follows Android (`!appleWebKitBlocksFeedSoundHandoff()`): unmute the new winner even if it was already playing muted in the prefetch ring. Safari/PWA stay per-tile / gesture-only. Do not key EdgeiOS sound off `detectAppleWebKitInlineStream()` (that flag is MSE/hero only).

---

## Historical context (May 2026)

**`8302abb`:** Native HLS caused ~frame-5 compositor freeze on Apple ... **`preferMseHls`** shipped for feed inline.

**May 20 hero WAAPI shrink** + **`preferMseHls`** introduced rs=0-while-playing. **Jul 24 CF HLS polling** added timers keyed only on `readyState` ... regressions resurfaced without anyone reverting May work.

---

## Agent checklist

Before merging Lounge Stream video changes:

- [ ] Grep new `readyState` checks in `LoungePostStreamVideo.jsx` ... iOS paths use **`appleWebKitInlineStreamPlaybackLooksLive`**?
- [ ] New hero motion ... **`landHeroOpen`** / WAAPI land snap still called?
- [ ] **`iosHeroMotionKeepMse`** still covers full lightbox session?
- [ ] Update **`docs/test-buildout-backlog.md`** Update log if behavior or smoke changed.
- [ ] iPhone smoke per section above (Ryan sign-off for hero/autoplay changes).

`AGENT_RULE_LOUNGE_STREAM_IOS_PLAYBACK` — searchability token.
