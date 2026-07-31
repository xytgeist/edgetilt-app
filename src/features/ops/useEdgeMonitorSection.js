import { useCallback, useEffect, useState } from 'react'
import {
  EDGE_MONITOR_DEFAULT_SECTION,
  buildMonitorSectionHref,
  parseMonitorSection,
} from './opsMonitorNavigation.js'

/**
 * @param {'mobile' | 'desktop'} layout
 */
export function useEdgeMonitorSection(layout) {
  const [section, setSectionState] = useState(() =>
    typeof window !== 'undefined' ? parseMonitorSection(window.location.search) : EDGE_MONITOR_DEFAULT_SECTION,
  )

  const setSection = useCallback(
    (next) => {
      const id = next || EDGE_MONITOR_DEFAULT_SECTION
      setSectionState(id)
      if (typeof window === 'undefined') return
      const href = buildMonitorSectionHref(id, { layout })
      window.history.replaceState(null, '', href)
    },
    [layout],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onPopState = () => setSectionState(parseMonitorSection(window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return { section, setSection }
}
