import { useLayoutEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashData from '../assets/lottie/edge-splash-v2.json'

DotLottie.setWasmUrl(wasmUrl)
const EDGE_SPLASH_DATA = JSON.stringify(edgeSplashData)

export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  // useLayoutEffect so the first Lottie frame paints before the browser composites.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const player = new DotLottie({
      canvas,
      data: EDGE_SPLASH_DATA,
      autoplay: true,
      loop: false,
    })

    player.addEventListener('complete', () => onCompleteRef.current?.())

    return () => player.destroy()
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
        className="pointer-events-none aspect-[9/16] h-[min(72dvh,560px)] w-auto max-w-[min(92vw,315px)]"
        aria-hidden
      />
    </div>
  )
}
