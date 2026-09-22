import { useLayoutEffect, useState } from 'react'
import { IPAD_NAV_RAIL_QUERY, IPAD_SHELL_QUERY } from './quickLinkDestinations.js'

function readIpadNavRail() {
  if (typeof window === 'undefined') return false
  const railMq = window.matchMedia(IPAD_NAV_RAIL_QUERY)
  const ipadShell = window.matchMedia(IPAD_SHELL_QUERY).matches
  const portrait = window.matchMedia('(orientation: portrait)').matches
  // Phone landscape rail only … drop immediately in portrait unless the tall iPad shell stage is active.
  return railMq.matches && (ipadShell || !portrait)
}

/**
 * Left Lounge rail: iPad shell, or phone/tablet landscape.
 * orientationchange / resize … same WKWebView lag as useIpadSlotsLandscape.
 */
export function useIpadNavRail() {
  const [matches, setMatches] = useState(readIpadNavRail)

  useLayoutEffect(() => {
    const railMq = window.matchMedia(IPAD_NAV_RAIL_QUERY)
    const shellMq = window.matchMedia(IPAD_SHELL_QUERY)
    const portraitMq = window.matchMedia('(orientation: portrait)')
    const sync = () =>
      setMatches(railMq.matches && (shellMq.matches || !portraitMq.matches))
    sync()
    railMq.addEventListener('change', sync)
    shellMq.addEventListener('change', sync)
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
      shellMq.removeEventListener('change', sync)
      portraitMq.removeEventListener('change', sync)
      window.removeEventListener('orientationchange', onOrient)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])

  return matches
}
