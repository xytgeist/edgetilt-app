/**
 * Thin read helpers for EDGE title-bar live-session chips.
 * Slots: bankroll_sessions. Poker: poker_bankroll_sessions (paused still active).
 */

import { fetchActiveBankrollSession } from '../../utils/nearbyCasinos.js'
import { pokerSessionIsPaused } from '../poker-bankroll/pokerBankrollMath.js'
import { pokerSessionStakesLabel } from '../poker-bankroll/pokerSessionLabels.js'

const POKER_ACTIVE_SELECT =
  'id, session_type, venue_name, venue_kind, game_variant, tournament_name, buy_in, small_blind, big_blind, third_blind, limit_type, deal_id, paused_at, paused_seconds, start_at, end_at, status'

/*
 * Labels are NOT abbreviated here ... the chip truncates with CSS so the pill
 * always shows as many characters as the title-bar gap allows.
 */

/**
 * @param {{ casino_name?: string | null, game_type?: string | null } | null} session
 */
export function slotsLiveSessionLabel(session) {
  const casino = String(session?.casino_name || '').trim() || 'Slots'
  const gt = String(session?.game_type || '').toLowerCase()
  if (gt === 'tables' && casino.length <= 12) return `${casino} · Tables`
  return casino
}

/**
 * @param {object | null} session
 */
export function pokerLiveSessionLabel(session) {
  return String(pokerSessionStakesLabel(session) || '').trim() || 'Poker'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchActivePokerBankrollSessions(supabase) {
  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select(POKER_ACTIVE_SELECT)
    .eq('status', 'active')
    .order('start_at', { ascending: false })
    .limit(8)
  if (error) throw error
  return data || []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{
 *   slots: { kind: 'slots', id: string, label: string, paused: false, startAt: string | null } | null,
 *   poker: { kind: 'poker', id: string, label: string, paused: boolean, startAt: string | null } | null,
 *   pokerCount: number,
 * }>}
 */
export async function fetchActiveLiveSessions(supabase) {
  /** @type {{ kind: 'slots', id: string, label: string, paused: false, startAt: string | null } | null} */
  let slots = null
  /** @type {{ kind: 'poker', id: string, label: string, paused: boolean, startAt: string | null } | null} */
  let poker = null
  let pokerCount = 0

  const [slotsRow, pokerRows] = await Promise.all([
    fetchActiveBankrollSession(supabase).catch(() => null),
    fetchActivePokerBankrollSessions(supabase).catch(() => []),
  ])

  if (slotsRow?.id) {
    slots = {
      kind: 'slots',
      id: String(slotsRow.id),
      label: slotsLiveSessionLabel(slotsRow),
      paused: false,
      startAt: slotsRow.start_at ? String(slotsRow.start_at) : null,
    }
  }

  const list = Array.isArray(pokerRows) ? pokerRows : []
  pokerCount = list.length
  const newest = list[0] || null
  if (newest?.id) {
    poker = {
      kind: 'poker',
      id: String(newest.id),
      label: pokerLiveSessionLabel(newest),
      paused: pokerSessionIsPaused(newest),
      startAt: newest.start_at ? String(newest.start_at) : null,
    }
  }

  return { slots, poker, pokerCount }
}

/** Dispatched after local bankroll start/end/pause so the title chip can refresh. */
export const LIVE_BANKROLL_SESSIONS_CHANGED_EVENT = 'edge-live-bankroll-sessions-changed'

export function notifyLiveBankrollSessionsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LIVE_BANKROLL_SESSIONS_CHANGED_EVENT))
}
