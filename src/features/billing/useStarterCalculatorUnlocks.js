import { useEffect, useMemo, useState } from 'react'
import {
  buildStarterUnlockedCalculatorKeys,
  fetchPublishedGuideRowsForStarterCalcUnlocks,
} from '../guides/starterGuideCalculatorUnlocks.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{
 *   enabled?: boolean,
 *   starterUnlockedGuideSlugs?: Set<string> | null,
 * }} [opts]
 */
export function useStarterCalculatorUnlocks(supabaseClient, opts = {}) {
  const { enabled = false, starterUnlockedGuideSlugs = null } = opts
  const [keys, setKeys] = useState(() => new Set())

  const weeklyKey = useMemo(() => {
    if (!(starterUnlockedGuideSlugs instanceof Set) || starterUnlockedGuideSlugs.size === 0) return ''
    return [...starterUnlockedGuideSlugs].sort().join(',')
  }, [starterUnlockedGuideSlugs])

  useEffect(() => {
    if (!enabled || !supabaseClient) {
      setKeys(new Set())
      return undefined
    }

    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchPublishedGuideRowsForStarterCalcUnlocks(supabaseClient)
        if (cancelled) return
        setKeys(buildStarterUnlockedCalculatorKeys(rows, starterUnlockedGuideSlugs))
      } catch {
        if (!cancelled) setKeys(new Set())
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, supabaseClient, weeklyKey, starterUnlockedGuideSlugs])

  return keys
}
