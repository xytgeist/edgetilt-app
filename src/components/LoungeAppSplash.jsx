import { useLayoutEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashData from '../assets/lottie/edge-splash-v2.json'

DotLottie.setWasmUrl(wasmUrl)
const EDGE_SPLASH_DATA = JSON.stringify(edgeSplashData)

// Black Solid 1 ends at frame 157 → D fly-through begins.
// Overlay fully transparent at frame 190 (~1 s before animation ends at 251).
const FLY_THROUGH_START = 157
const FLY_THROUGH_END = 190

// Frame at which the status bar flips from black to the app theme color.
// Tune this if the flip happens too early or too late relative to when the D crosses the top.
const STATUS_BAR_FLIP_FRAME = 175

// 251 frames @ 60 fps ≈ 4.2 s. Force-dismiss after 7 s if complete event is late.
const SPLASH_MAX_MS = 7000

// Derive the correct theme color from the current <html> class.
function splashThemeColor() {
  const isDark = document.documentElement.classList.contains('dark')
  return { bg: isDark ? '#09090b' : '#fafafa', meta: isDark ? '#09090b' : '#ffffff' }
}

/**
 * Cold-boot Lottie splash.
 *
 * Layer stack (bottom → top inside the fixed container):
 *   1. overlay div  — bg-black, opacity driven by direct DOM ref (not React state).
 *                     Shows through the transparent D-hole pixels in the canvas.
 *                     Fades 1→0 during frames 157–190 to reveal the feed behind.
 *   2. canvas       — DotLottie renders here via OffscreenCanvas so the WASM path
 *                     calls set_background(0,0,0,0) → true transparent D-hole pixels.
 *   3. preFrameCover — always bg-black. Hides the blank canvas while WASM boots,
 *                     and keeps the iOS translucent status bar dark from the start.
 *                     Removed one rAF after the first Lottie frame to avoid a
 *                     transparent-canvas white flash.
 *
 *   4. statusBar strip — absolutely-positioned div, height env(safe-area-inset-top),
 *                     topmost layer. Starts black. Its background changes at
 *                     STATUS_BAR_FLIP_FRAME as a belt-and-suspenders backup to the
 *                     primary apple-mobile-web-app-status-bar-style meta flip.
 *
 * Status bar flip mechanism:
 *   iOS does not resample DOM content for the translucent bar dynamically. The ONLY
 *   reliable trigger is changing apple-mobile-web-app-status-bar-style meta content.
 *   At STATUS_BAR_FLIP_FRAME: black-translucent → default (white opaque bar).
 *   At done(): restored to black-translucent under the --out fade so app layout
 *   shifts are hidden behind the fading splash.
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const preFrameCoverRef = useRef(null)
  const statusBarRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  useLayoutEffect(() => {
    // ── Status bar control ──────────────────────────────────────────────────────
    // The ONLY reliable way to dynamically change the iOS PWA status bar color is
    // to change the apple-mobile-web-app-status-bar-style meta tag. iOS does not
    // continuously resample DOM content for the translucent status bar — it only
    // re-evaluates when this meta tag value changes.
    //
    // black-translucent → dark bar, content extends behind it (what the app uses)
    // default           → opaque white bar, content does NOT extend behind it
    //
    // Switching black-translucent↔default changes the safe-area inset and would
    // normally cause a layout shift, but the splash's fixed inset-0 overlay hides
    // any app-content movement during the transition.
    const sbMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    // sbMeta starts as black-translucent (set in index.html) → dark status bar ✓

    function flipStatusBarLight() {
      // Switch to opaque default (white bar) — triggers iOS re-evaluation.
      // Belt-and-suspenders: also update body background + theme-color.
      if (sbMeta) sbMeta.setAttribute('content', 'default')
      const { bg, meta } = splashThemeColor()
      document.documentElement.style.setProperty('background', bg, 'important')
      document.body.style.setProperty('background', bg, 'important')
      const tc = document.querySelector('meta[name="theme-color"]')
      if (tc) tc.setAttribute('content', meta)
      if (statusBarRef.current) statusBarRef.current.style.backgroundColor = bg
    }

    function restoreStatusBarStyle() {
      // Restore black-translucent before splash fully fades — layout shift is
      // hidden behind the --out animation's remaining opacity.
      if (sbMeta) sbMeta.setAttribute('content', 'black-translucent')
      document.documentElement.style.removeProperty('background')
      document.body.style.removeProperty('background')
    }

    const canvas = canvasRef.current
    if (!canvas) {
      restoreStatusBarStyle()
      return
    }

    // getBoundingClientRect() measures the actual rendered CSS size after layout —
    // correct on iOS PWA with viewport-fit:cover where window.innerHeight ≠ full screen.
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)

    // OffscreenCanvas forces the dotlottie-web WASM rendering path which calls
    // set_background(0,0,0,0) → genuinely transparent clear color → D-hole pixels
    // in the visible canvas are transparent, letting the overlay show through.
    const offscreen = new OffscreenCanvas(canvas.width, canvas.height)
    const ctx = canvas.getContext('2d')

    const player = new DotLottie({
      canvas: offscreen,
      data: EDGE_SPLASH_DATA,
      autoplay: true,
      loop: false,
      useFrameInterpolation: false,
      backgroundColor: '#00000000',
      layout: { fit: 'cover', align: [0.5, 0.5] },
      renderConfig: { autoResize: false },
    })

    let barFlipped = false
    const done = () => {
      if (!barFlipped) { barFlipped = true; flipStatusBarLight() }
      // Restore black-translucent now — --out animation (320ms) hides any layout shift.
      restoreStatusBarStyle()
      onCompleteRef.current?.()
    }
    const fallback = setTimeout(done, SPLASH_MAX_MS)

    player.addEventListener('frame', ({ currentFrame }) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(offscreen, 0, 0)

      // Delay hiding the preFrameCover by one rAF so the canvas drawImage has been
      // composited to screen first — prevents a transparent-canvas white flash.
      if (preFrameCoverRef.current) {
        const cover = preFrameCoverRef.current
        preFrameCoverRef.current = null
        requestAnimationFrame(() => { cover.style.display = 'none' })
      }

      // Flip status bar as the D crosses the top of the screen.
      // Primary: change apple-mobile-web-app-status-bar-style → iOS re-evaluates.
      if (!barFlipped && currentFrame >= STATUS_BAR_FLIP_FRAME) {
        barFlipped = true
        flipStatusBarLight()
      }

      // Fade the overlay via direct DOM mutation — not setState — so it works
      // reliably inside DotLottie's native event listener on iOS PWA.
      if (currentFrame >= FLY_THROUGH_START && overlayRef.current) {
        const t = Math.min(1, (currentFrame - FLY_THROUGH_START) / (FLY_THROUGH_END - FLY_THROUGH_START))
        overlayRef.current.style.opacity = String(1 - t)
      }
    })

    player.addEventListener('complete', () => {
      clearTimeout(fallback)
      done()
    })

    return () => {
      restoreStatusBarStyle()
      clearTimeout(fallback)
      player.destroy()
    }
  }, [])

  return (
    <div
      className={`lounge-cold-boot-splash fixed inset-0 z-[120] pointer-events-none ${
        dismissing ? 'lounge-cold-boot-splash--out' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading Lounge"
    >
      {/* 1. Overlay — behind canvas, shows through transparent D-hole */}
      <div ref={overlayRef} className="absolute inset-0 bg-black pointer-events-none" aria-hidden />

      {/* 2. Canvas — Lottie renders here via OffscreenCanvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />

      {/* 3. Pre-frame cover — on top, hides blank canvas until WASM boots.
               Always black: seamless with the Lottie's Black Solid 1 opener. */}
      <div ref={preFrameCoverRef} className="absolute inset-0 bg-black" aria-hidden />

      {/* 4. Status bar strip — covers only env(safe-area-inset-top), the exact pixels
               iOS samples for its translucent status bar tint. Sits above everything else.
               Starts black (matches the Lottie opener). At STATUS_BAR_FLIP_FRAME we set
               its background to the theme color so iOS sees white/dark directly in those
               pixels and updates the status bar accordingly. */}
      <div
        ref={statusBarRef}
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: 'env(safe-area-inset-top)',
          backgroundColor: '#000',
          willChange: 'background-color',
          transform: 'translateZ(0)',
        }}
        aria-hidden
      />
    </div>
  )
}
