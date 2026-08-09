import { useCallback, useEffect, useState } from 'react'
import {
  fetchPokerPendingOfferAttention,
  hasUnaackedAttentionIds,
  mergeAttentionAckIds,
  POKER_OFFER_ATTENTION_CHANGED_EVENT,
  prunePokerOfferAttentionAcks,
  readPokerOfferAttentionAcks,
  writePokerOfferAttentionAcks,
} from '../poker-stable/pokerPendingOfferAttention.js'

/**
 * Shell-level pending Accept/Decline signals + breadcrumb dismiss / first-open pulse.
 *
 * Dots clear per step as the viewer opens hamburger → Poker → Bankroll/Stable.
 * Acks persist in localStorage per offer id so a reopen does not resurrect a
 * step the user already tapped (even if they never Accept/Decline).
 *
 * Opening Bankroll/Stable also acks hamburger + poker for those offer ids and
 * pulses the offer card once (first arrival only).
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
  const [bankrollIds, setBankrollIds] = useState(/** @type {string[]} */ ([]))
  const [stableIds, setStableIds] = useState(/** @type {string[]} */ ([]))
  const [acks, setAcks] = useState(() => readPokerOfferAttentionAcks(userId))
  const [pulseBankrollOffer, setPulseBankrollOffer] = useState(false)
  const [pulseStableOffer, setPulseStableOffer] = useState(false)

  useEffect(() => {
    setAcks(readPokerOfferAttentionAcks(userId))
    setPulseBankrollOffer(false)
    setPulseStableOffer(false)
  }, [userId])

  const commitAcks = useCallback(
    (updater) => {
      setAcks((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        writePokerOfferAttentionAcks(userId, next)
        return next
      })
    },
    [userId],
  )

  const refresh = useCallback(async () => {
    if (!enabled || !supabaseClient || !userId) {
      setBankrollIds([])
      setStableIds([])
      return
    }
    const next = await fetchPokerPendingOfferAttention(supabaseClient, userId)
    const nextBankroll = next.bankrollIds || []
    const nextStable = next.stableIds || []
    const pendingIds = next.pendingIds || [...nextBankroll, ...nextStable]
    setBankrollIds(nextBankroll)
    setStableIds(nextStable)
    commitAcks((prev) => prunePokerOfferAttentionAcks(prev, pendingIds))
  }, [commitAcks, enabled, supabaseClient, userId])

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

  const pendingIds = [...bankrollIds, ...stableIds]

  const acknowledgeHamburger = useCallback(() => {
    if (!pendingIds.length) return
    commitAcks((prev) => ({
      ...prev,
      hamburger: mergeAttentionAckIds(prev.hamburger, pendingIds),
    }))
  }, [commitAcks, pendingIds])

  const acknowledgePoker = useCallback(() => {
    if (!pendingIds.length) return
    commitAcks((prev) => ({
      ...prev,
      poker: mergeAttentionAckIds(prev.poker, pendingIds),
    }))
  }, [commitAcks, pendingIds])

  const acknowledgeBankrollTool = useCallback(() => {
    if (!bankrollIds.length) return
    let shouldPulse = false
    commitAcks((prev) => {
      shouldPulse = hasUnaackedAttentionIds(bankrollIds, prev.pulsedBankroll)
      return {
        ...prev,
        hamburger: mergeAttentionAckIds(prev.hamburger, bankrollIds),
        poker: mergeAttentionAckIds(prev.poker, bankrollIds),
        bankroll: mergeAttentionAckIds(prev.bankroll, bankrollIds),
        pulsedBankroll: shouldPulse
          ? mergeAttentionAckIds(prev.pulsedBankroll, bankrollIds)
          : prev.pulsedBankroll,
      }
    })
    if (shouldPulse) setPulseBankrollOffer(true)
  }, [bankrollIds, commitAcks])

  const acknowledgeStableTool = useCallback(() => {
    if (!stableIds.length) return
    let shouldPulse = false
    commitAcks((prev) => {
      shouldPulse = hasUnaackedAttentionIds(stableIds, prev.pulsedStable)
      return {
        ...prev,
        hamburger: mergeAttentionAckIds(prev.hamburger, stableIds),
        poker: mergeAttentionAckIds(prev.poker, stableIds),
        stable: mergeAttentionAckIds(prev.stable, stableIds),
        pulsedStable: shouldPulse
          ? mergeAttentionAckIds(prev.pulsedStable, stableIds)
          : prev.pulsedStable,
      }
    })
    if (shouldPulse) setPulseStableOffer(true)
  }, [commitAcks, stableIds])

  const clearBankrollOfferPulse = useCallback(() => {
    setPulseBankrollOffer(false)
  }, [])

  const clearStableOfferPulse = useCallback(() => {
    setPulseStableOffer(false)
  }, [])

  return {
    bankrollAttention: hasUnaackedAttentionIds(bankrollIds, acks.bankroll),
    stableAttention: hasUnaackedAttentionIds(stableIds, acks.stable),
    pokerAttention: hasUnaackedAttentionIds(pendingIds, acks.poker),
    hamburgerAttention: hasUnaackedAttentionIds(pendingIds, acks.hamburger),
    pulseBankrollOffer,
    pulseStableOffer,
    acknowledgeHamburger,
    acknowledgePoker,
    acknowledgeBankrollTool,
    acknowledgeStableTool,
    clearBankrollOfferPulse,
    clearStableOfferPulse,
    refreshPokerOfferAttention: refresh,
  }
}
