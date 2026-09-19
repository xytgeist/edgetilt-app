import { useEffect, useState } from 'react'
import { IPAD_LANDSCAPE_QUERY } from './quickLinkDestinations.js'

export function useIpadSlotsLandscape() {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(IPAD_LANDSCAPE_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(IPAD_LANDSCAPE_QUERY)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return matches
}
