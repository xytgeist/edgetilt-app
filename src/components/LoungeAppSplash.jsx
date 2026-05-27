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

// 251 frames @ 60 fps ≈ 4.2 s. Force-dismiss after 7 s if complete event is late.
const SPLASH_MAX_MS = 7000

/**
 * Cold-boot Lottie splash.
 *
 * Layer stack (bottom → top inside the fixed container):
 *   1. overlay div  — bg-black, opacity driven by direct DOM ref (not React state).
 *                     Shows through the transparent D-hole pixels in the canvas.
 *                     Fades 1→0 during frames 157–190 to reveal the feed behind.
 *   2. canvas       — DotLottie renders here via OffscreenCanvas so the WASM path
 *                     calls set_background(0,0,0,0) → true transparent D-hole pixels.
 *   3. preFrameCover — bg-zinc-950 (theme-aware dark/light). Sits on top and covers
 *                     the blank canvas while WASM loads. Hidden on first Lottie frame.
 *
 * Overlay opacity is mutated directly on the DOM node — bypasses React batching so
 * the fade is reliable on iOS PWA where setState from native event listeners can stall.
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const preFrameCoverRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

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

    const done = () => onCompleteRef.current?.()
    const fallback = setTimeout(done, SPLASH_MAX_MS)

    player.addEventListener('frame', ({ currentFrame }) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(offscreen, 0, 0)

      // Remove the pre-frame cover the moment the first frame lands.
      if (preFrameCoverRef.current) {
        preFrameCoverRef.current.style.display = 'none'
        preFrameCoverRef.current = null
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

      {/* 3. Pre-frame cover — on top, hides blank canvas until WASM boots */}
      <div ref={preFrameCoverRef} className="absolute inset-0 bg-zinc-950" aria-hidden />
    </div>
  )
}
