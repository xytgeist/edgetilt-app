import { useEffect, useRef } from 'react'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url'
import edgeSplashData from '../assets/lottie/edge-splash-v1.json'

// Set WASM URL once at module load — must happen before any DotLottie instance is created
DotLottie.setWasmUrl(wasmUrl)
const SPLASH_DATA = JSON.stringify(edgeSplashData)

/**
 * Full-screen Edge logo Lottie splash. Shown during Lounge cold boot / long resume.
 * @param {{ dismissing?: boolean, onAnimationComplete?: () => void }} props
 */
export default function LoungeAppSplash({ dismissing = false, onAnimationComplete }) {
  const canvasRef = useRef(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dotLottie = new DotLottie({
      canvas,
      data: SPLASH_DATA,
      autoplay: true,
      loop: false,
      useFrameInterpolation: false,
    })

    dotLottie.addEventListener('complete', () => {
      onCompleteRef.current?.()
    })

    return () => {
      dotLottie.destroy()
    }
  }, [])

  return (
    <div
      className={`lounge-cold-boot-splash fixed inset-0 z-[120] flex flex-col items-center justify-center bg-zinc-950 ${
        dismissing ? 'lounge-cold-boot-splash--out' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading Lounge"
    >
      <div className="lounge-cold-boot-splash__glow pointer-events-none absolute inset-0" aria-hidden />
      <canvas
        ref={canvasRef}
        className="pointer-events-none h-56 w-56 sm:h-64 sm:w-64"
        aria-hidden
      />
    </div>
  )
}
