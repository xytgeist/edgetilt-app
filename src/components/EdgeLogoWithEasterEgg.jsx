import { useCallback, useEffect, useRef, useState } from 'react'

/** EDGE mark in the title area; tap triggers a short “Giggity” easter egg. */
export default function EdgeLogoWithEasterEgg({ className = '' }) {
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

  const handleClick = useCallback(() => {
    clearHideTimer()
    setGiggityKey((k) => k + 1)
    setShowGiggity(true)
    hideTimeoutRef.current = window.setTimeout(() => {
      setShowGiggity(false)
      hideTimeoutRef.current = null
    }, 1000)
  }, [clearHideTimer])

  return (
    <span className="relative inline-flex shrink-0 touch-manipulation [-webkit-tap-highlight-color:transparent]">
      <button
        type="button"
        onClick={handleClick}
        className="m-0 inline-flex cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-sm"
        aria-label="EDGE"
      >
        <img src="/edge-lounge-logo.png" alt="" className={`edge-logo--dark ${className}`} draggable={false} />
        <img src="/edge-lounge-logo-transparent.png" alt="" className={`edge-logo--light ${className}`} draggable={false} />
      </button>
      {showGiggity ? (
        <span className="pointer-events-none absolute left-1/2 top-full z-[70] mt-1 -translate-x-1/2 whitespace-nowrap" aria-hidden>
          <span key={giggityKey} className="edge-giggity-fizzle inline-block text-sm font-semibold italic tracking-wide text-violet-200 drop-shadow-[0_0_10px_rgba(167,139,250,0.45)]">
            Giggity
          </span>
        </span>
      ) : null}
    </span>
  )
}
