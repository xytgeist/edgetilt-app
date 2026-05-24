import { useEffect, useRef, useState } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import drawDataRaw from '../assets/lottie/edge-splash-v1.json'
import zoomDataRaw from '../assets/lottie/edge-zoom-v1.json'

// WASM must be configured before any DotLottie instance is created.
DotLottie.setWasmUrl(wasmUrl)

const DRAW_DATA = JSON.stringify(drawDataRaw)

// Patch EdgeZoomLottie: start the D at 600% scale so it already fills the
// viewport at frame 0. Without this the D starts tiny and transparent areas
// around it would show the app during the early zoom frames.
const _zoomPatched = JSON.parse(JSON.stringify(zoomDataRaw))
const _dLayer = _zoomPatched.layers.find(l => l.nm === 'd')
if (_dLayer?.ks?.s?.a === 1) _dLayer.ks.s.k[0].s = [600, 600, 100]
const ZOOM_DATA = JSON.stringify(_zoomPatched)

/**
 * Two-phase Edge logo splash shown during Lounge cold boot / long resume.
 *
 * Phase 1 — "draw": EdgeLottie1 draws the logo on a solid dark background.
 * Phase 2 — "zoom": EdgeZoomLottie zooms the D in from viewport-filling to
 *   full-bleed. The container switches to an isolated compositing group and
 *   the canvas uses mix-blend-mode:destination-in so the D's counter (hole)
 *   becomes a live window into the app beneath — opaque everywhere else.
 *
 * @param {{ dismissing?: boolean, onAnimationComplete?: () => void }} props
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete
  const [phase, setPhase] = useState('draw') // 'draw' | 'zoom'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let active = null

    // ── Phase 1: draw-on animation ────────────────────────────────────────
    active = new DotLottie({
      canvas,
      data: DRAW_DATA,
      autoplay: true,
      loop: false,
      useFrameInterpolation: false,
    })

    active.addEventListener('complete', () => {
      active?.destroy()
      active = null

      // ── Phase 2: zoom reveal ────────────────────────────────────────────
      const zoom = new DotLottie({
        canvas,
        data: ZOOM_DATA,
        autoplay: true,
        loop: false,
        useFrameInterpolation: false,
      })
      active = zoom

      // Switch blend mode only after the first frame is rendered so there's
      // no single-frame blank-canvas flash between the two phases.
      zoom.addEventListener('play', () => setPhase('zoom'))

      zoom.addEventListener('complete', () => {
        onCompleteRef.current?.()
      })
    })

    return () => {
      active?.destroy()
    }
  }, [])

  const isZoom = phase === 'zoom'

  return (
    <div
      className={`lounge-cold-boot-splash fixed inset-0 z-[120] flex flex-col items-center justify-center bg-zinc-950 ${
        dismissing ? 'lounge-cold-boot-splash--out' : ''
      }`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Lounge"
    >
      <div className="lounge-cold-boot-splash__glow pointer-events-none absolute inset-0" aria-hidden />
      <canvas
        ref={canvasRef}
        // Draw phase: centered square, scaled 1.5× to fill the logo nicely.
        // Zoom phase: absolute full-screen so the D fills edge-to-edge with
        //   no rectangular canvas frame or letterbox bands.
        className={
          isZoom
            ? 'pointer-events-none absolute inset-0 w-full h-full'
            : 'pointer-events-none relative h-[80vw] w-[80vw] max-h-[380px] max-w-[380px]'
        }
        style={{
          background: 'transparent',
          transform: isZoom ? 'none' : 'scale(1.5)',
          transformOrigin: 'center',
        }}
        aria-hidden
      />
    </div>
  )
}
