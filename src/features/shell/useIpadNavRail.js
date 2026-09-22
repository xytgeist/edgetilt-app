import { useLayoutEffect, useState } from 'react'
import { IPAD_NAV_RAIL_QUERY } from './quickLinkDestinations.js'

/**
 * True when the left nav rail should show.
 * IPAD_NAV_RAIL_QUERY covers iPad shell + phone landscape. On portrait rotate,
 * WKWebView can briefly fail the shell MQ (and iPad mini portrait is 744px wide,
 * under the 768 shell floor) … keep the rail for tablet-class short sides.
 */
function readIpadNavRail() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia(IPAD_NAV_RAIL_QUERY).matches) return true
  const portrait = window.matchMedia('(orientation: portrait)').matches
  if (!portrait) return false
  if (!window.matchMedia('(pointer: coarse)').matches) return false
  const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  return shortSide >= 700
}

/**
 * Left Lounge rail: iPad shell, or phone/tablet landscape.
 * orientationchange / resize … same WKWebView lag as useIpadSlotsLandscape.
 *
 * Do NOT force the rail off on portrait … that dropped the sidebar while shell MQ
 * was catching up (and permanently on iPad mini portrait width).
 */
export function useIpadNavRail() {
  const [matches, setMatches] = useState(readIpadNavRail)

  useLayoutEffect(() => {
    const railMq = window.matchMedia(IPAD_NAV_RAIL_QUERY)
    const portraitMq = window.matchMedia('(orientation: portrait)')
    const sync = () => setMatches(readIpadNavRail())
    sync()
    railMq.addEventListener('change', sync)
    portraitMq.addEventListener('change', sync)
    const onOrient = () => {
      sync()
      requestAnimationFrame(sync)
    }
    window.addEventListener('orientationchange', onOrient)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      railMq.removeEventListener('change', sync)
      portraitMq.removeEventListener('change', sync)
      window.removeEventListener('orientationchange', onOrient)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return matches
}
