import { useEffect } from 'react'
import { autoSyncFantasyOnOpen } from './fantasyApi.js'

/**
 * Keeps linked fantasy leagues fresh without opening Fantasy: re-syncs stale links in the background when the app
 * opens and whenever it comes back to the foreground (the Fantasy screen joins a sync already running).
 */
export function useFantasyBackgroundSync(supabaseClient, { enabled = true, userId = '' } = {}) {
  useEffect(() => {
    if (!enabled || !supabaseClient || !userId) return undefined
    const run = () => {
      void autoSyncFantasyOnOpen(supabaseClient).catch(() => {})
    }
    run()
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled, supabaseClient, userId])
}
