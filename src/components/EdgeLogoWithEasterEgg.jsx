import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchLoungeActivityNavigate } from '../utils/loungeActivityInAppNavigate.js'

/**
 * EDGE mark in the title area.
 *
 * @param {'giggity' | 'goLounge' | 'static'} [behavior='giggity']
 *   - `giggity`: Lounge feed / lounge chrome easter egg
 *   - `goLounge`: other app screens → navigate to Lounge (`/?tab=home`)
 *   - `static`: decorative (no tap action)
 */
export default function EdgeLogoWithEasterEgg({ className = '', behavior = 'giggity' }) {
  const [showGiggity, setShowGiggity] = useState(false)
  const [giggityKey, setGiggityKey] = useState(0)
  const hideTimeoutRef = useRef(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  const handleGiggity = useCallback(() => {
    clearHideTimer()
    setGiggityKey((k) => k + 1)
    setShowGiggity(true)
    hideTimeoutRef.current = window.setTimeout(() => {
      setShowGiggity(false)
      hideTimeoutRef.current = null
    }, 1000)
  }, [clearHideTimer])

  const handleGoLounge = useCallback(() => {
    dispatchLoungeActivityNavigate({ url: '/?tab=home', markActivityRead: false })
  }, [])

  const logos = (
    <>
      <img src="/edge-lounge-logo-transparent.png" alt="" className={`edge-logo--dark ${className}`} draggable={false} />
      <img src="/edge-lounge-logo-light.png" alt="" className={`edge-logo--light ${className}`} draggable={false} />
    </>
  )

  if (behavior === 'static') {
    return <span className="relative inline-flex shrink-0">{logos}</span>
  }

  const isGoLounge = behavior === 'goLounge'
  const onClick = isGoLounge ? handleGoLounge : handleGiggity

  return (
    <span className="relative inline-flex shrink-0 touch-manipulation [-webkit-tap-highlight-color:transparent]">
      <button
        type="button"
        onClick={onClick}
        className="m-0 inline-flex cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-sm"
        aria-label={isGoLounge ? 'Go to Lounge' : 'EDGE'}
      >
        {logos}
      </button>
      {!isGoLounge && showGiggity ? (
        <span className="pointer-events-none absolute left-1/2 top-full z-[70] mt-1 -translate-x-1/2 whitespace-nowrap" aria-hidden>
          <span key={giggityKey} className="edge-giggity-fizzle inline-block text-sm font-semibold italic tracking-wide text-violet-200 drop-shadow-[0_0_10px_rgba(167,139,250,0.45)]">
            Giggity
          </span>
        </span>
      ) : null}
    </span>
  )
}
