import { useEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashDark from '../assets/lottie/edge-splash-v2.json'
import edgeSplashLight from '../assets/lottie/edge-splash-v2-light.json'

DotLottie.setWasmUrl(wasmUrl)

// Pre-stringify both at module load (expensive JSON.stringify done once, not per-render).
// The CORRECT one is selected inside useLayoutEffect/render where applyTheme() has
// already run - module-level code executes before main.jsx's own statements fire.
const EDGE_SPLASH_DATA_DARK = JSON.stringify(edgeSplashDark)
const EDGE_SPLASH_DATA_LIGHT = JSON.stringify(edgeSplashLight)

// Black Solid 1 ends at frame 157 → D fly-through begins.
// Overlay fully transparent at frame 190 (~1 s before animation ends at 251).
const FLY_THROUGH_START = 157
const FLY_THROUGH_END = 190
// Bottom cover lags overlay fade - was dismissing ~10 frames early when locked together.
const BOTTOM_COVER_FADE_LAG_FRAMES = 10
const BOTTOM_COVER_FADE_START = FLY_THROUGH_START + BOTTOM_COVER_FADE_LAG_FRAMES
const BOTTOM_COVER_FADE_END = FLY_THROUGH_END + BOTTOM_COVER_FADE_LAG_FRAMES

// Shift canvas up so the animation reads centered under the status bar.
const CANVAS_OFFSET_Y = -40

// 251 frames @ 60 fps ≈ 4.2 s. Force-dismiss after 7 s if complete event is late.
const SPLASH_MAX_MS = 7000

/** Viewport height used to detect iOS URL-bar / dvh settle before canvas measure. */
function readSplashViewportHeight() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return vv?.height ?? window.innerHeight
}

/**
 * Wait for visual viewport height to stop jumping (URL bar, dvh, safe-area) before
 * sizing the Lottie canvas. Caps wait so cold boot never feels stuck.
 */
function waitForStableSplashViewport({ maxWaitMs = 240, stableFrames = 2 } = {}) {
  let rafId = 0
  let bootRafId = 0
  let settled = false

  const promise = new Promise((resolve) => {
    let lastHeight = readSplashViewportHeight()
    let stableCount = 0
    const deadline = performance.now() + maxWaitMs

    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const tick = () => {
      if (settled) return
      const height = readSplashViewportHeight()
      if (Math.abs(height - lastHeight) < 1) stableCount += 1
      else {
        stableCount = 0
        lastHeight = height
      }

      if (stableCount >= stableFrames || performance.now() >= deadline) {
        finish()
        return
      }
      rafId = window.requestAnimationFrame(tick)
    }

    // Two rAFs: let mount layout paint before comparing heights.
    bootRafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(tick)
    })
  })

  const cancel = () => {
    if (settled) return
    settled = true
    window.cancelAnimationFrame(bootRafId)
    window.cancelAnimationFrame(rafId)
  }

  return { promise, cancel }
}

function measureSplashCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const width = Math.round(rect.width * dpr)
  const height = Math.round(rect.height * dpr)
  if (width <= 0 || height <= 0) return false
  canvas.width = width
  canvas.height = height
  return true
}

/**
 * Cold-boot Lottie splash.
 *
 * Layer stack (bottom → top inside the fixed container):
 *   1. overlay div    - bg-black, opacity driven by direct DOM ref (not React state).
 *                       Shows through the transparent D-hole pixels in the canvas.
 *                       Fades 1→0 during frames 157–190 to reveal the feed behind.
 *   2. canvas         - DotLottie renders here via OffscreenCanvas so the WASM path
 *                       calls set_background(0,0,0,0) → true transparent D-hole pixels.
 *                       Canvas size is measured after visualViewport height stabilizes
 *                       (iOS URL bar / dvh) so the bitmap is not vertically stretched.
 *   3. preFrameCover  - always bg-black. Hides the blank canvas while WASM boots.
 *                       Removed one rAF after the first Lottie frame to avoid a
 *                       transparent-canvas white flash.
 *   4. statusBar strip - height env(safe-area-inset-top), always bg-black. Sits in
 *                       the exact pixels iOS samples for its translucent status bar tint,
 *                       keeping the status bar dark for the full duration of the splash.
 *   5. bottomCover strip - masks the viewport band below the shifted canvas so the feed
 *                       cannot leak through transparent canvas pixels during fly-through.
 *                       Fades out frames 167–200 (10f after overlay), then removed.
 *
 * Status bar: iOS PWA caches apple-mobile-web-app-status-bar-style at install time
 * and does not resample translucent-bar content dynamically during JS execution.
 * The black preFrameCover + statusBar strip give a dark status bar throughout the
 * splash. The bar transitions to the app theme color naturally when the splash fades
 * out and the app's own background becomes the topmost content.
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationStart, onAnimationComplete }) {
  // applyTheme() in main.jsx runs before React renders, so classList is correct here.
  const isDark = document.documentElement.classList.contains('dark')
  const splashBg = isDark ? '#000' : '#fff'

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const preFrameCoverRef = useRef(null)
  const bottomCoverRef = useRef(null)
  const statusBarRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete
  const onStartRef = useRef(onAnimationStart)
  onStartRef.current = onAnimationStart

  useEffect(() => {
    const isDarkEffect = document.documentElement.classList.contains('dark')
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let cancelled = false
    let player = null
    let fallback = 0
    let cancelViewportWait = null
    let animationStartReported = false

    const startPlayer = () => {
      if (cancelled) return
      if (!measureSplashCanvas(canvas)) {
        window.requestAnimationFrame(startPlayer)
        return
      }

      // OffscreenCanvas forces the dotlottie-web WASM rendering path which calls
      // set_background(0,0,0,0) → genuinely transparent clear color → D-hole pixels
      // in the visible canvas are transparent, letting the overlay show through.
      const offscreen = new OffscreenCanvas(canvas.width, canvas.height)
      const ctx = canvas.getContext('2d')

      player = new DotLottie({
        canvas: offscreen,
        data: isDarkEffect ? EDGE_SPLASH_DATA_DARK : EDGE_SPLASH_DATA_LIGHT,
        autoplay: true,
        loop: false,
        useFrameInterpolation: false,
        backgroundColor: '#00000000',
        layout: { fit: 'cover', align: [0.5, 0.5] },
        renderConfig: { autoResize: false },
      })

      const done = () => onCompleteRef.current?.()
      fallback = window.setTimeout(done, SPLASH_MAX_MS)

      const fadeOpacity = (currentFrame, start, end) => {
        if (currentFrame < start) return 1
        const t = Math.min(1, (currentFrame - start) / (end - start))
        return 1 - t
      }

      player.addEventListener('frame', ({ currentFrame }) => {
        if (!animationStartReported) {
          animationStartReported = true
          onStartRef.current?.()
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(offscreen, 0, 0)

        // Delay hiding the preFrameCover by one rAF so the canvas drawImage has been
        // composited to screen first - prevents a transparent-canvas white flash.
        if (preFrameCoverRef.current) {
          const cover = preFrameCoverRef.current
          preFrameCoverRef.current = null
          requestAnimationFrame(() => { cover.style.display = 'none' })
        }

        // Fade overlay + bottom cover via direct DOM mutation - not setState - so it works
        // reliably inside DotLottie's native event listener on iOS PWA.
        if (currentFrame >= FLY_THROUGH_START && overlayRef.current) {
          overlayRef.current.style.opacity = String(fadeOpacity(currentFrame, FLY_THROUGH_START, FLY_THROUGH_END))
        }
        if (currentFrame >= BOTTOM_COVER_FADE_START && bottomCoverRef.current) {
          bottomCoverRef.current.style.opacity = String(
            fadeOpacity(currentFrame, BOTTOM_COVER_FADE_START, BOTTOM_COVER_FADE_END),
          )
        }

        if (currentFrame >= BOTTOM_COVER_FADE_END && bottomCoverRef.current) {
          bottomCoverRef.current.style.display = 'none'
          bottomCoverRef.current = null
        }
      })

      player.addEventListener('complete', () => {
        window.clearTimeout(fallback)
        if (bottomCoverRef.current) {
          bottomCoverRef.current.style.display = 'none'
          bottomCoverRef.current = null
        }
        done()
      })
    }

    const { promise, cancel } = waitForStableSplashViewport()
    cancelViewportWait = cancel
    promise.then(() => {
      if (!cancelled) startPlayer()
    })

    return () => {
      cancelled = true
      cancelViewportWait?.()
      window.clearTimeout(fallback)
      player?.destroy()
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
      {/* 1. Overlay - behind canvas, shows through transparent D-hole.
               Dark mode: black overlay fades out during fly-through to reveal feed.
               Light mode: white overlay (matches light Lottie background). */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: splashBg }}
        aria-hidden
      />

      {/* 2. Canvas - Lottie renders here via OffscreenCanvas.
               Shifted up slightly to visually center under the status bar (light + dark). */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ top: `${CANVAS_OFFSET_Y}px` }} aria-hidden />

      {/* 3. Pre-frame cover - on top, hides blank canvas until WASM boots.
               Matches the Lottie opener: black in dark mode, white in light mode. */}
      <div
        ref={preFrameCoverRef}
        className="absolute inset-0"
        style={{ backgroundColor: splashBg }}
        aria-hidden
      />

      {/* 4. Bottom cover - opaque band below shifted canvas; blocks feed leak outside D-hole.
               Fades 167–200 (10f after overlay); removed at frame 200. */}
      <div
        ref={bottomCoverRef}
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: `calc(${-CANVAS_OFFSET_Y}px + env(safe-area-inset-bottom, 0px))`,
          backgroundColor: splashBg,
        }}
        aria-hidden
      />

      {/* 5. Status bar strip - covers only env(safe-area-inset-top).
               Matches the Lottie opener color so the iOS translucent status bar
               tint is consistent with the animation background. */}
      <div
        ref={statusBarRef}
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: 'env(safe-area-inset-top)', backgroundColor: splashBg }}
        aria-hidden
      />
    </div>
  )
}
