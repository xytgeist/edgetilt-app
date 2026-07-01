import { useEffect, useState } from 'react'
import { normalizeGuideAccessSlug } from '../guides/guideAccess.js'

/**
 * Accumulated weekly-drop guide slugs for the signed-in Starter subscriber.
 * Source of truth: `starter_weekly_guide_unlocks` via `get_my_starter_weekly_guide_slugs()`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean }} [opts]
 */
export function useStarterWeeklyDropGuideSlugs(supabaseClient, opts = {}) {
  const { enabled = false } = opts
  const [slugs, setSlugs] = useState(() => new Set())

  useEffect(() => {
    if (!enabled || !supabaseClient) {
      setSlugs(new Set())
      return undefined
    }

    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('get_my_starter_weekly_guide_slugs')
        if (cancelled) return
        if (error) {
          if (error.code === 'PGRST202' || error.message?.includes('get_my_starter_weekly_guide_slugs')) {
            setSlugs(new Set())
            return
          }
          setSlugs(new Set())
          return
        }
        const list = Array.isArray(data) ? data : []
        setSlugs(
          new Set(list.map((s) => normalizeGuideAccessSlug(s)).filter(Boolean)),
        )
      } catch {
        if (!cancelled) setSlugs(new Set())
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, supabaseClient])

  return slugs
}
