import { LOUNGE_ACTIVITY_EVENT_TYPES } from './loungeActivityApi.js'

const POKER_STABLE_BANKROLL_EVENT_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_BACKER_OFFER,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_DECLINED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_DECLINED,
])

/** Stable tab only — open manager, not deal detail sheet. */
const POKER_STABLE_TAB_ONLY_EVENT_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SESSION_COMPLETE,
])

/**
 * Stable deep links that keep `stableDeal` for carousel focus but must not open Overview.
 * PokerStableScreen focuses the pending horse invite card instead.
 */
export const POKER_STABLE_CAROUSEL_FOCUS_EVENT_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_INVITE,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_NUDGE,
])

/** Settle / commit sync: stakee → Bankroll hero; backers → Stable manager. */
const POKER_STABLE_STAKE_ROLE_ROUTED_EVENT_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_COMMIT_RECORDED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_PROPOSED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_RESOLVED,
])

/** @param {object | null | undefined} event */
export function pokerStableActivityNeedsStakeeLookup(event) {
  if (!event?.poker_stable_deal_id) return false
  if (POKER_STABLE_STAKE_ROLE_ROUTED_EVENT_TYPES.has(event.event_type)) return true
  return Boolean(event.poker_stable_commit_id || event.poker_stable_settlement_request_id)
}

/**
 * @param {object | null | undefined} event
 * @param {string | null | undefined} viewerUserId
 * @param {string | null | undefined} dealStakeeUserId
 */
export function pokerStableActivityTabForViewer(event, viewerUserId, dealStakeeUserId) {
  if (!event?.event_type) return 'poker-stable'
  if (POKER_STABLE_BANKROLL_EVENT_TYPES.has(event.event_type)) return 'poker-bankroll'
  if (POKER_STABLE_TAB_ONLY_EVENT_TYPES.has(event.event_type)) return 'poker-stable'
  if (
    pokerStableActivityNeedsStakeeLookup(event) &&
    viewerUserId &&
    dealStakeeUserId &&
    viewerUserId === dealStakeeUserId
  ) {
    return 'poker-bankroll'
  }
  return 'poker-stable'
}

/**
 * Build app URL for poker stable activity Alerts / push rows.
 * @param {object | null | undefined} event
 * @param {{ viewerUserId?: string | null, dealStakeeUserId?: string | null }} [opts]
 */
export function buildPokerStableActivityNavigateUrl(event, opts = {}) {
  if (!event?.event_type) return '/?tab=home'
  const { viewerUserId = null, dealStakeeUserId = null } = opts
  const params = new URLSearchParams()
  const tab = pokerStableActivityTabForViewer(event, viewerUserId, dealStakeeUserId)
  params.set('tab', tab)
  if (
    event.poker_stable_deal_id &&
    !POKER_STABLE_TAB_ONLY_EVENT_TYPES.has(event.event_type)
  ) {
    params.set('stableDeal', String(event.poker_stable_deal_id))
  }
  // Edge Alert/push: Bankroll stake card only. Guest claim still uses stakeOnboarding=1.
  if (event.poker_stable_commit_id) {
    params.set('stableCommit', String(event.poker_stable_commit_id))
  } else if (event.poker_stable_settlement_request_id) {
    params.set('stableSettlement', String(event.poker_stable_settlement_request_id))
  }
  return `/?${params.toString()}`
}

/**
 * Navigate from Alerts row tap (updates URL + notifies AppShell; closes lounge dock).
 * Always dispatches even when the URL is unchanged so pending deal state refreshes.
 */
export function dispatchLoungeActivityNavigate({
  url,
  activityEventId = null,
  activityBatchId = null,
  markActivityRead = true,
} = {}) {
  if (typeof window === 'undefined') return
  const relative = typeof url === 'string' && url.trim() ? url.trim() : '/?tab=home'
  const parsed = new URL(relative, window.location.origin)
  const nextPath = `${parsed.pathname}${parsed.search}`
  if (window.location.pathname + window.location.search !== nextPath) {
    window.history.pushState({}, '', nextPath)
  }
  window.dispatchEvent(
    new CustomEvent('lounge-activity-navigate', {
      detail: {
        url: nextPath,
        activityEventId: activityEventId ? String(activityEventId) : null,
        activityBatchId: activityBatchId ? String(activityBatchId) : null,
        markActivityRead: markActivityRead !== false,
      },
    }),
  )
}

/** Navigate from a Lounge activity push / in-app toast payload (relative app URL). */
export function navigateFromLoungeActivityPayload(payload) {
  const empty = {
    activityEventId: null,
    activityBatchId: null,
    tab: 'home',
    roomId: null,
    callId: null,
    missedCallId: null,
    playLogEntryId: null,
    pokerSessionId: null,
    guideSlug: null,
    stableDealId: null,
    stableCommitId: null,
    stableSettlementRequestId: null,
    urlChanged: false,
  }
  if (typeof window === 'undefined') return empty

  const relative =
    typeof payload?.url === 'string' && payload.url.trim() ? payload.url.trim() : '/?tab=home'
  const parsed = new URL(relative, window.location.origin)
  const nextPath = `${parsed.pathname}${parsed.search}`
  const urlChanged = window.location.pathname + window.location.search !== nextPath
  if (urlChanged) {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const activityEventId =
    payload?.activityEventId || parsed.searchParams.get('activityEvent') || null
  const activityBatchId =
    payload?.activityBatchId || parsed.searchParams.get('activityBatch') || null

  return {
    activityEventId: activityEventId ? String(activityEventId) : null,
    activityBatchId: activityBatchId ? String(activityBatchId) : null,
    tab: parsed.searchParams.get('tab') || 'home',
    roomId: (parsed.searchParams.get('room') || '').trim() || null,
    callId: (parsed.searchParams.get('call') || '').trim() || null,
    missedCallId: (parsed.searchParams.get('missedCall') || '').trim() || null,
    playLogEntryId: (parsed.searchParams.get('playLogEntry') || '').trim() || null,
    pokerSessionId: (parsed.searchParams.get('pokerSession') || '').trim() || null,
    guideSlug: (parsed.searchParams.get('guide') || '').trim() || null,
    stableDealId: (parsed.searchParams.get('stableDeal') || '').trim() || null,
    stableCommitId:
      (parsed.searchParams.get('stableCommit') || parsed.searchParams.get('stableSettlement') || '')
        .trim() || null,
    stableSettlementRequestId:
      (parsed.searchParams.get('stableSettlement') || '').trim() || null,
    urlChanged,
  }
}

export function loungeActivityInAppPayloadFromMessage(data) {
  if (!data || data.type !== 'lounge-activity-inapp') return null
  return {
    title: data.title || 'Edge Lounge',
    body: data.body || '',
    url: data.url || '/?tab=home',
    activityEventId: data.activityEventId || null,
    activityBatchId: data.activityBatchId || null,
    icon: data.icon || '/android-icon-192x192.png',
  }
}
