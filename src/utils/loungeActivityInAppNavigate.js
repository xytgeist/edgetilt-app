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

/** Build app URL for poker stable activity Alerts / push rows. */
export function buildPokerStableActivityNavigateUrl(event) {
  if (!event?.event_type) return '/?tab=home'
  const params = new URLSearchParams()
  const bankrollTab = POKER_STABLE_BANKROLL_EVENT_TYPES.has(event.event_type)
  params.set('tab', bankrollTab ? 'poker-bankroll' : 'poker-stable')
  if (
    event.poker_stable_deal_id &&
    !POKER_STABLE_TAB_ONLY_EVENT_TYPES.has(event.event_type)
  ) {
    params.set('stableDeal', String(event.poker_stable_deal_id))
  }
  if (
    bankrollTab &&
    event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_BACKER_OFFER
  ) {
    params.set('stakeOnboarding', '1')
  }
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
