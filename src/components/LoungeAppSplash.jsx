import { useEffect, useRef } from 'react'
import edgeSplashData from '../assets/lottie/edge-splash-v1.json'

/**
 * Full-screen Edge logo Lottie splash. Shown during Lounge cold boot / long resume.
 * @param {{ dismissing?: boolean }} props
 */
export default function LoungeAppSplash({ dismissing = false }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let animation = null
    let cancelled = false

    import('lottie-web').then(({ default: lottie }) => {
      if (cancelled || !containerRef.current) return
      animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: edgeSplashData,
      })
    })

    return () => {
      cancelled = true
      animation?.destroy()
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
      <div
        ref={containerRef}
        className="pointer-events-none h-56 w-56 sm:h-64 sm:w-64"
        aria-hidden
      />
    </div>
  )
}
