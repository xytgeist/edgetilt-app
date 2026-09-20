import { useEffect, useState } from 'react'
import { SLOTS_LANDSCAPE_SPLIT_QUERY } from './quickLinkDestinations.js'

/**
 * Landscape Slots two-column split (iPad and phone).
 * Name kept for call sites; query no longer requires the iPad height floor.
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
    return () => mq.removeEventListener('change', sync)
  }, [])

  return matches
}
