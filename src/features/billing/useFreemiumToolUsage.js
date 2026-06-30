import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FREE_BANKROLL_SESSION_LIMIT,
  FREE_PLAY_LOG_LIMIT,
  canCreateBankrollSession,
  canCreatePlayLog,
  fetchFreemiumToolUsageCounts,
  freemiumUsageRemaining,
  hasUnlimitedToolAccess,
} from './freemiumToolLimits.js'

/**
 * Tracks free-tier bankroll session + play log usage for non-subscribers.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   enabled?: boolean,
 *   isStaff?: boolean,
 *   hasSlotsEdge?: boolean,
 * }} opts
 */
export function useFreemiumToolUsage({
  supabaseClient,
  enabled = true,
  isStaff = false,
  hasSlotsEdge = false,
}) {
  const [userId, setUserId] = useState(null)
  const [counts, setCounts] = useState({ bankrollSessionCount: 0, playLogCount: 0 })
  const [loading, setLoading] = useState(false)

  const unlimited = hasUnlimitedToolAccess({ isStaff, hasSlotsEdge })

  useEffect(() => {
    if (!supabaseClient || !enabled) {
      setUserId(null)
      return undefined
    }

    let cancelled = false
    void supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null)
    })

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabaseClient, enabled])

  const refreshFreemiumUsage = useCallback(async () => {
    if (!supabaseClient || !userId || !enabled || unlimited) return
    setLoading(true)
    try {
      const next = await fetchFreemiumToolUsageCounts(supabaseClient, userId)
      setCounts(next)
    } catch {
      /* counts stay at last known values */
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, userId, enabled, unlimited])

  useEffect(() => {
    if (!userId || unlimited) {
      setCounts({ bankrollSessionCount: 0, playLogCount: 0 })
      setLoading(false)
      return
    }
    void refreshFreemiumUsage()
  }, [userId, unlimited, refreshFreemiumUsage])

  return useMemo(
    () => ({
      loading: loading && !unlimited,
      freemiumUsageLoading: loading && !unlimited,
      bankrollSessionCount: counts.bankrollSessionCount,
      playLogCount: counts.playLogCount,
      canCreateBankrollSession: canCreateBankrollSession({
        count: counts.bankrollSessionCount,
        isStaff,
        hasSlotsEdge,
      }),
      canCreatePlayLog: canCreatePlayLog({
        count: counts.playLogCount,
        isStaff,
        hasSlotsEdge,
      }),
      bankrollSessionsRemaining: freemiumUsageRemaining(
        FREE_BANKROLL_SESSION_LIMIT,
        counts.bankrollSessionCount,
        unlimited,
      ),
      playLogsRemaining: freemiumUsageRemaining(FREE_PLAY_LOG_LIMIT, counts.playLogCount, unlimited),
      refreshFreemiumUsage,
    }),
    [counts, hasSlotsEdge, isStaff, loading, refreshFreemiumUsage, unlimited],
  )
}
