import { useCallback, useEffect, useRef, useState } from 'react'
import { syncEdgeLiveBankrollActivity } from '../../utils/edgeNative.js'
import {
  fetchActiveLiveSessions,
  LIVE_BANKROLL_SESSIONS_CHANGED_EVENT,
} from './liveBankrollSessions.js'

/**
 * Active slots + poker live sessions for the EDGE title-bar chip.
 * Poker lives are scoped to `userId` (player in session), not backer-visible stake rows.
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {{ enabled?: boolean, userId?: string | null }} [opts]
 */
export function useActiveLiveSessions(supabase, { enabled = true, userId = null } = {}) {
  const [slots, setSlots] = useState(null)
  const [poker, setPoker] = useState(null)
  const [pokerCount, setPokerCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [nativeIslandActive, setNativeIslandActive] = useState(false)
  const [islandHydrated, setIslandHydrated] = useState(false)
  const hasLiveRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || !enabled) {
      setSlots(null)
      setPoker(null)
      setPokerCount(0)
      hasLiveRef.current = false
      setNativeIslandActive(false)
      setIslandHydrated(false)
      return
    }
    setLoading(true)
    try {
      const next = await fetchActiveLiveSessions(supabase, { userId })
      setSlots(next.slots)
      setPoker(next.poker)
      setPokerCount(next.pokerCount)
      hasLiveRef.current = Boolean(next.slots || next.poker)
    } catch {
      // Keep last good snapshot on transient errors.
    } finally {
      setLoading(false)
      setIslandHydrated(true)
    }
  }, [supabase, enabled, userId])

  useEffect(() => {
    if (!supabase || !enabled) {
      setSlots(null)
      setPoker(null)
      setPokerCount(0)
      hasLiveRef.current = false
      setNativeIslandActive(false)
      setIslandHydrated(false)
      void syncEdgeLiveBankrollActivity({ slots: null, poker: null })
      return undefined
    }

    void refresh()

    const onFocus = () => void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onChanged = () => void refresh()

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(LIVE_BANKROLL_SESSIONS_CHANGED_EVENT, onChanged)

    const timer = window.setInterval(() => {
      void refresh()
    }, hasLiveRef.current ? 45_000 : 90_000)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(LIVE_BANKROLL_SESSIONS_CHANGED_EVENT, onChanged)
      window.clearInterval(timer)
    }
  }, [supabase, enabled, refresh])

  useEffect(() => {
    if (enabled && !islandHydrated) return undefined
    let cancelled = false
    void syncEdgeLiveBankrollActivity({
      slots: slots
        ? {
            id: slots.id,
            label: slots.label,
            startAt: slots.startAt,
            elapsedSeconds: slots.elapsedSeconds,
          }
        : null,
      poker: poker
        ? {
            id: poker.id,
            label: poker.label,
            paused: poker.paused,
            startAt: poker.startAt,
            elapsedSeconds: poker.elapsedSeconds,
          }
        : null,
    }).then((result) => {
      if (cancelled) return
      setNativeIslandActive(Boolean(result?.ok && result?.supported && !result?.disabled))
    })
    return () => {
      cancelled = true
    }
  }, [slots, poker, enabled, islandHydrated])

  return {
    slots,
    poker,
    pokerCount,
    loading,
    hasLive: Boolean(slots || poker),
    nativeIslandActive,
    refresh,
  }
}
