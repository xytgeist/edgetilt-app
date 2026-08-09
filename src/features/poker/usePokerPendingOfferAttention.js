import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPokerPendingOfferAttention,
  POKER_OFFER_ATTENTION_CHANGED_EVENT,
} from '../poker-stable/pokerPendingOfferAttention.js'

/**
 * Shell-level pending Accept/Decline signals + breadcrumb dismiss / first-open pulse.
 *
 * Dots clear per step as the viewer opens hamburger → Poker → Bankroll/Stable.
 * Opening a tool clears that tool's dot even if the offer is still pending.
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
  const [dismissedHamburger, setDismissedHamburger] = useState(false)
  const [dismissedPoker, setDismissedPoker] = useState(false)
  const [dismissedBankroll, setDismissedBankroll] = useState(false)
  const [dismissedStable, setDismissedStable] = useState(false)
  const [pulseBankrollOffer, setPulseBankrollOffer] = useState(false)
  const [pulseStableOffer, setPulseStableOffer] = useState(false)

  const prevBankrollRef = useRef(false)
  const prevStableRef = useRef(false)
  const pulsedBankrollRef = useRef(false)
  const pulsedStableRef = useRef(false)

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

  // New pending attention reopens the breadcrumb trail + allows pulse again.
  useEffect(() => {
    if (bankroll && !prevBankrollRef.current) {
      setDismissedHamburger(false)
      setDismissedPoker(false)
      setDismissedBankroll(false)
      pulsedBankrollRef.current = false
      setPulseBankrollOffer(false)
    }
    if (!bankroll) {
      setDismissedBankroll(false)
      pulsedBankrollRef.current = false
      setPulseBankrollOffer(false)
    }
    prevBankrollRef.current = bankroll
  }, [bankroll])

  useEffect(() => {
    if (stable && !prevStableRef.current) {
      setDismissedHamburger(false)
      setDismissedPoker(false)
      setDismissedStable(false)
      pulsedStableRef.current = false
      setPulseStableOffer(false)
    }
    if (!stable) {
      setDismissedStable(false)
      pulsedStableRef.current = false
      setPulseStableOffer(false)
    }
    prevStableRef.current = stable
  }, [stable])

  useEffect(() => {
    if (!userId) {
      setDismissedHamburger(false)
      setDismissedPoker(false)
      setDismissedBankroll(false)
      setDismissedStable(false)
      setPulseBankrollOffer(false)
      setPulseStableOffer(false)
      pulsedBankrollRef.current = false
      pulsedStableRef.current = false
      prevBankrollRef.current = false
      prevStableRef.current = false
    }
  }, [userId])

  const pokerRaw = bankroll || stable

  const acknowledgeHamburger = useCallback(() => {
    if (!pokerRaw) return
    setDismissedHamburger(true)
  }, [pokerRaw])

  const acknowledgePoker = useCallback(() => {
    if (!pokerRaw) return
    setDismissedPoker(true)
  }, [pokerRaw])

  const acknowledgeBankrollTool = useCallback(() => {
    if (!bankroll) {
      setDismissedBankroll(true)
      return
    }
    setDismissedBankroll(true)
    if (!pulsedBankrollRef.current) {
      pulsedBankrollRef.current = true
      setPulseBankrollOffer(true)
    }
  }, [bankroll])

  const acknowledgeStableTool = useCallback(() => {
    if (!stable) {
      setDismissedStable(true)
      return
    }
    setDismissedStable(true)
    if (!pulsedStableRef.current) {
      pulsedStableRef.current = true
      setPulseStableOffer(true)
    }
  }, [stable])

  const clearBankrollOfferPulse = useCallback(() => {
    setPulseBankrollOffer(false)
  }, [])

  const clearStableOfferPulse = useCallback(() => {
    setPulseStableOffer(false)
  }, [])

  return {
    bankrollAttention: bankroll && !dismissedBankroll,
    stableAttention: stable && !dismissedStable,
    pokerAttention: pokerRaw && !dismissedPoker,
    hamburgerAttention: pokerRaw && !dismissedHamburger,
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
