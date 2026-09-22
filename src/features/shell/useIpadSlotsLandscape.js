import { useLayoutEffect, useState } from 'react'
import { SLOTS_LANDSCAPE_SPLIT_QUERY } from './quickLinkDestinations.js'

function readSlotsLandscapeSplit() {
  if (typeof window === 'undefined') return false
  const splitMq = window.matchMedia(SLOTS_LANDSCAPE_SPLIT_QUERY)
  const portraitMq = window.matchMedia('(orientation: portrait)')
  // Portrait clears immediately … WKWebView can keep the landscape split MQ true briefly after rotate.
  return splitMq.matches && !portraitMq.matches
}

/**
 * Landscape Slots two-column split (iPad and phone).
 * Name kept for call sites; query no longer requires the iPad height floor.
 *
 * Also sync on orientationchange / resize … WKWebView often lags matchMedia
 * `orientation` alone when rotating back to portrait, which left split layout stuck.
 */
export function useIpadSlotsLandscape() {
  const [matches, setMatches] = useState(readSlotsLandscapeSplit)

  useLayoutEffect(() => {
    const splitMq = window.matchMedia(SLOTS_LANDSCAPE_SPLIT_QUERY)
    const portraitMq = window.matchMedia('(orientation: portrait)')
    const sync = () => setMatches(splitMq.matches && !portraitMq.matches)
    sync()
    splitMq.addEventListener('change', sync)
    portraitMq.addEventListener('change', sync)
    const onOrient = () => {
      sync()
      requestAnimationFrame(sync)
    }
    window.addEventListener('orientationchange', onOrient)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      splitMq.removeEventListener('change', sync)
      portraitMq.removeEventListener('change', sync)
      window.removeEventListener('orientationchange', onOrient)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return matches
}
