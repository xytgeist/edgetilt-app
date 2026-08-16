import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchActiveLiveSessions,
  LIVE_BANKROLL_SESSIONS_CHANGED_EVENT,
} from './liveBankrollSessions.js'

/**
 * Active slots + poker live sessions for the EDGE title-bar chip.
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabase
 * @param {{ enabled?: boolean }} [opts]
 */
export function useActiveLiveSessions(supabase, { enabled = true } = {}) {
  const [slots, setSlots] = useState(null)
  const [poker, setPoker] = useState(null)
  const [pokerCount, setPokerCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const hasLiveRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || !enabled) {
      setSlots(null)
      setPoker(null)
      setPokerCount(0)
      hasLiveRef.current = false
      return
    }
    setLoading(true)
    try {
      const next = await fetchActiveLiveSessions(supabase)
      setSlots(next.slots)
      setPoker(next.poker)
      setPokerCount(next.pokerCount)
      hasLiveRef.current = Boolean(next.slots || next.poker)
    } catch {
      // Keep last good snapshot on transient errors.
    } finally {
      setLoading(false)
    }
  }, [supabase, enabled])

  useEffect(() => {
    if (!supabase || !enabled) {
      setSlots(null)
      setPoker(null)
      setPokerCount(0)
      hasLiveRef.current = false
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

  return {
    slots,
    poker,
    pokerCount,
    loading,
    hasLive: Boolean(slots || poker),
    refresh,
  }
}
