import { useLayoutEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashData from '../assets/lottie/edge-splash-v2.json'

DotLottie.setWasmUrl(wasmUrl)
const EDGE_SPLASH_DATA = JSON.stringify(edgeSplashData)

/**
 * Edge cold-boot splash.
 *
 * The Lottie (edge-splash-v2.json) is fully self-contained:
 *   – "Black Solid 1" covers the entire canvas with opaque black during frames 0–165,
 *     providing the dark background for the draw-on phase.
 *   – At frames 166–172, Black Solid 1 fades 100→0, handing off to the zoom structure.
 *   – "Black Solid 2" (luma-matted to the area surrounding the D body) stays fully
 *     opaque throughout — it is the persistent black surround, not the hole fill.
 *   – The D shape layer uses an even-odd fill rule (two paths: outer D + inner counter),
 *     which produces genuinely transparent canvas pixels in the D counter/hole. No
 *     blend-mode compositing is needed from our side — the hole transparency is native.
 *   – The D then scales 100%→2146% (frames 168–194), growing the transparent hole
 *     to fill the viewport and completing the fly-through reveal into the feed.
 *
 * @param {{ dismissing?: boolean, onAnimationComplete?: () => void }} props
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const preFrameCoverRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const player = new DotLottie({
      canvas,
      data: EDGE_SPLASH_DATA,
      autoplay: true,
      loop: false,
      useFrameInterpolation: false,
      backgroundColor: 'transparent',
      layout: { fit: 'cover', align: [0.5, 0.5] },
      renderConfig: { autoResize: true },
    })

    // Hide the dark pre-frame cover the moment the first Lottie frame paints.
    // By that point the canvas has opaque content (Black Solid 1 = full black),
    // so removing the cover produces no visible jump.
    player.addEventListener('frame', () => {
      const cover = preFrameCoverRef.current
      if (cover) {
        cover.style.display = 'none'
        preFrameCoverRef.current = null
      }
    })

    player.addEventListener('complete', () => onCompleteRef.current?.())

    return () => player?.destroy()
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
      {/* Covers the transparent canvas gap before WASM boots and the first frame renders */}
      <div ref={preFrameCoverRef} className="absolute inset-0 bg-[#09090b]" aria-hidden />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
    </div>
  )
}
