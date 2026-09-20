import { useEffect, useState } from 'react'
import { IPAD_NAV_RAIL_QUERY } from './quickLinkDestinations.js'

/** Left Lounge rail: iPad shell, or phone/tablet landscape. */
export function useIpadNavRail() {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(IPAD_NAV_RAIL_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(IPAD_NAV_RAIL_QUERY)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return matches
}
