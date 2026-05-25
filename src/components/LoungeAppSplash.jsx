import { useLayoutEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashData from '../assets/lottie/edge-splash-v2.json'

DotLottie.setWasmUrl(wasmUrl)
const EDGE_SPLASH_DATA = JSON.stringify(edgeSplashData)

/**
 * Edge cold-boot splash.
 *
 * The Lottie is fully self-contained:
 *   – "Black Solid 1" covers the entire canvas (opaque black) frames 0–165, giving
 *     the draw-on phase its dark background.
 *   – At frame 166–172 both Black Solid 1 (full bg) AND Black Solid 2 (the D hole
 *     fill) fade opacity 100→0 together. After frame 172 the canvas has genuinely
 *     transparent pixels in the D counter and the background, so the feed beneath
 *     z-[120] naturally shows through — no blend-mode compositing required.
 *   – The D then scales 100%→2146% (frames 168–194), growing the transparent hole
 *     to fill the viewport and completing the fly-through reveal.
 *
 * @param {{ dismissing?: boolean, onAnimationComplete?: () => void }} props
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
    </div>
  )
}
