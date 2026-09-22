import { useEffect, useState } from 'react'
import { SLOTS_LANDSCAPE_SPLIT_QUERY } from './quickLinkDestinations.js'

/**
 * Landscape Slots two-column split (iPad and phone).
 * Name kept for call sites; query no longer requires the iPad height floor.
 *
 * Also sync on orientationchange / resize ... WKWebView often lags matchMedia
 * `orientation` alone when rotating back to portrait, which left split layout stuck.
 */
export function useIpadSlotsLandscape() {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SLOTS_LANDSCAPE_SPLIT_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(SLOTS_LANDSCAPE_SPLIT_QUERY)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    window.addEventListener('orientationchange', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('orientationchange', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return matches
}
