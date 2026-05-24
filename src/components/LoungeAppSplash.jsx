import { useLayoutEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import drawData from '../assets/lottie/edge-splash-v1.json'
import zoomData from '../assets/lottie/edge-zoom-v1.json'

DotLottie.setWasmUrl(wasmUrl)
const DRAW_DATA = JSON.stringify(drawData)
const ZOOM_DATA = JSON.stringify(zoomData)

export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  // useLayoutEffect so the first Lottie frame paints before the browser composites.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let active = null

    active = new DotLottie({ canvas, data: DRAW_DATA, autoplay: true, loop: false })

    active.addEventListener('complete', () => {
      active?.destroy()
      active = new DotLottie({ canvas, data: ZOOM_DATA, autoplay: true, loop: false })
      active.addEventListener('complete', () => onCompleteRef.current?.())
    })

    return () => active?.destroy()
  }, [])

  return (
    <div
      className={`lounge-cold-boot-splash fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950 ${
        dismissing ? 'lounge-cold-boot-splash--out' : ''
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="status"
      aria-live="polite"
      aria-label="Loading Lounge"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none h-[80vw] w-[80vw] max-h-[380px] max-w-[380px]"
        style={{ transform: 'scale(1.5)', transformOrigin: 'center' }}
        aria-hidden
      />
    </div>
  )
}
