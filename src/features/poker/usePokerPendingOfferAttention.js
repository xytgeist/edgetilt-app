import { useCallback, useEffect, useState } from 'react'
import {
  fetchPokerPendingOfferAttention,
  POKER_OFFER_ATTENTION_CHANGED_EVENT,
} from '../poker-stable/pokerPendingOfferAttention.js'

/**
 * Shell-level pending Accept/Decline signals for hamburger → Poker → tool breadcrumb dots.
 *
 * @param {{
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   userId?: string | null,
 *   enabled?: boolean,
 * }} opts
 */
export function usePokerPendingOfferAttention({
  supabaseClient = null,
  userId = null,
  enabled = true,
} = {}) {
  const [bankroll, setBankroll] = useState(false)
  const [stable, setStable] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled || !supabaseClient || !userId) {
      setBankroll(false)
      setStable(false)
      return
    }
    const next = await fetchPokerPendingOfferAttention(supabaseClient, userId)
    setBankroll(Boolean(next.bankroll))
    setStable(Boolean(next.stable))
  }, [enabled, supabaseClient, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const onChanged = () => {
      void refresh()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener(POKER_OFFER_ATTENTION_CHANGED_EVENT, onChanged)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener(POKER_OFFER_ATTENTION_CHANGED_EVENT, onChanged)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, refresh])

  return {
    bankrollAttention: bankroll,
    stableAttention: stable,
    pokerAttention: bankroll || stable,
    refreshPokerOfferAttention: refresh,
  }
}
