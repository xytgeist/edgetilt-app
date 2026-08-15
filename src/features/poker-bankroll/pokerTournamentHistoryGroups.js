/**
 * Display-only history grouping for multi-flight / multi-bullet tournaments.
 * Sessions stay one row each in the DB; this only collapses the history list.
 */

import {
  pokerSessionDurationHours,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import {
  seriesSessionsFor,
  sessionSeriesBulletCount,
  sessionsInSameSeries,
} from './pokerTournamentSeries.js'

/**
 * Same personal (no deal) or same stake deal_id.
 * @param {object | null | undefined} a
 * @param {object | null | undefined} b
 */
export function historySessionsShareOwnershipScope(a, b) {
  if (!a || !b) return false
  return (a.deal_id || null) === (b.deal_id || null)
}

/**
 * @param {object | null | undefined} session
 */
export function historySessionSortAt(session) {
  return session?.end_at || session?.start_at || ''
}

/**
 * @param {object[]} sessions
 */
export function sortHistorySessionsNewestFirst(sessions) {
  return [...(sessions || [])].sort(
    (a, b) =>
      new Date(historySessionSortAt(b)).getTime() - new Date(historySessionSortAt(a)).getTime(),
  )
}

/**
 * Deduplicate swaps that fan out onto every series flight.
 * @param {object[]} swaps
 */
export function dedupeSwapsById(swaps) {
  /** @type {object[]} */
  const out = []
  const seen = new Set()
  for (const swap of swaps || []) {
    if (!swap?.id || seen.has(swap.id)) continue
    seen.add(swap.id)
    out.push(swap)
  }
  return out
}

/**
 * Collapse completed tournament sessions that share series identity + ownership.
 * Cash and one-off tournaments stay singletons. Active sessions are not passed in.
 *
 * @param {object[]} completedSessions Already scoped + filtered completed rows
 * @param {Record<string, object>} [eventsById]
 * @returns {{
 *   kind: 'session' | 'series',
 *   id: string,
 *   at: string,
 *   session: object,
 *   sessions: object[],
 * }[]}
 */
export function groupCompletedSessionsForHistory(completedSessions, eventsById = {}) {
  const list = Array.isArray(completedSessions) ? completedSessions : []
  /** @type {object[][]} */
  const groups = []
  /** @type {Set<string>} */
  const assigned = new Set()

  for (const session of list) {
    if (!session?.id || assigned.has(session.id)) continue

    if (session.session_type !== 'tournament') {
      groups.push([session])
      assigned.add(session.id)
      continue
    }

    const peers = list.filter(
      (other) =>
        other &&
        other.id &&
        !assigned.has(other.id) &&
        other.session_type === 'tournament' &&
        historySessionsShareOwnershipScope(session, other) &&
        sessionsInSameSeries(session, other, eventsById),
    )

    if (peers.length <= 1) {
      groups.push([session])
      assigned.add(session.id)
      continue
    }

    const ordered = sortHistorySessionsNewestFirst(peers)
    for (const row of ordered) assigned.add(row.id)
    groups.push(ordered)
  }

  return groups.map((sessions) => {
    const ordered = sortHistorySessionsNewestFirst(sessions)
    const anchor = ordered[0]
    const isSeries = ordered.length > 1
    return {
      kind: isSeries ? 'series' : 'session',
      id: isSeries ? `series:${ordered.map((s) => s.id).sort().join('+')}` : anchor.id,
      at: historySessionSortAt(anchor),
      session: anchor,
      sessions: ordered,
    }
  })
}

/**
 * History-card / detail totals for a tournament series group.
 * Does not reuse swap-settle aggregation.
 *
 * @param {object[]} seriesSessions
 * @param {Record<string, object>} [eventsById]
 */
export function aggregateSeriesHistoryDetail(seriesSessions, eventsById = {}) {
  const list = sortHistorySessionsNewestFirst(seriesSessions)
  let invested = 0
  let cashOut = 0
  let bounty = 0
  let hours = 0
  let gross = 0
  let grossCounted = 0
  let finishPlace = null
  let fieldSize = null
  let reentries = 0

  for (const session of list) {
    invested += pokerSessionTotalCost(session)
    hours += pokerSessionDurationHours(session)
    reentries += Number(session.reentries) || 0
    if (session.cash_out != null && session.cash_out !== '') {
      cashOut += Number(session.cash_out) || 0
    }
    bounty += Number(session.bounty_winnings) || 0
    const wl = pokerSessionWinLoss(session)
    if (wl != null) {
      gross += wl
      grossCounted += 1
    }
    const place = Number(session.finish_place)
    if (Number.isFinite(place) && place > 0 && (finishPlace == null || place < finishPlace)) {
      finishPlace = place
      fieldSize = session.field_size ?? fieldSize
    }
  }

  const bullets = list.reduce(
    (n, session) => n + sessionSeriesBulletCount(session, eventsById),
    0,
  )

  return {
    sessions: list,
    sessionCount: list.length,
    bullets,
    reentries,
    invested: Math.round(invested * 100) / 100,
    cashOut: Math.round(cashOut * 100) / 100,
    bounty: Math.round(bounty * 100) / 100,
    hours,
    gross: grossCounted > 0 ? Math.round(gross * 100) / 100 : null,
    finishPlace,
    fieldSize,
    anchor: list[0] || null,
  }
}

/**
 * Sum scope-aware metric W/L across flights without double-counting swaps.
 * resolveSessionMetricWinLoss already attaches settlement only to the linked session.
 *
 * @param {object[]} seriesSessions
 * @param {object[]} swaps
 * @param {string} userId
 * @param {Parameters<typeof import('./pokerSessionAttribution.js').resolveSessionMetricWinLoss>[3]} metricOpts
 * @param {(session: object, swaps: object[], userId: string, opts: object) => number | null} resolveMetric
 */
export function sumSeriesMetricWinLoss(
  seriesSessions,
  swaps,
  userId,
  metricOpts,
  resolveMetric,
) {
  let total = 0
  let counted = 0
  for (const session of seriesSessions || []) {
    const wl = resolveMetric(session, swaps, userId, metricOpts)
    if (wl == null) continue
    total += wl
    counted += 1
  }
  return counted > 0 ? Math.round(total * 100) / 100 : null
}

/**
 * Collect unique swaps for a series group from the per-session swap map.
 * @param {object[]} seriesSessions
 * @param {Record<string, object[]>} swapsBySessionId
 */
export function uniqueSwapsForSeriesSessions(seriesSessions, swapsBySessionId) {
  /** @type {object[]} */
  const collected = []
  for (const session of seriesSessions || []) {
    const rows = swapsBySessionId?.[session.id] || []
    for (const swap of rows) collected.push(swap)
  }
  return dedupeSwapsById(collected)
}

/**
 * @param {object[]} seriesSessions
 * @param {Record<string, object>} [eventsById]
 */
export function seriesHistoryContextLine(seriesSessions, eventsById = {}) {
  const agg = aggregateSeriesHistoryDetail(seriesSessions, eventsById)
  if (agg.sessionCount <= 1) return ''
  const sessionBit = `${agg.sessionCount} session${agg.sessionCount === 1 ? '' : 's'}`
  if (agg.bullets > 0) {
    return `${sessionBit} · ${agg.bullets} bullet${agg.bullets === 1 ? '' : 's'}`
  }
  return sessionBit
}

/**
 * Expand a series membership query from an already-filtered completed list.
 * Prefer this over seriesSessionsFor(global) so personal/stake filters stay intact.
 *
 * @param {object} anchor
 * @param {object[]} completedSessions
 * @param {Record<string, object>} [eventsById]
 */
export function seriesHistoryMembersFromList(anchor, completedSessions, eventsById = {}) {
  if (!anchor) return []
  const list = Array.isArray(completedSessions) ? completedSessions : []
  return sortHistorySessionsNewestFirst(
    list.filter(
      (session) =>
        session &&
        session.session_type === 'tournament' &&
        historySessionsShareOwnershipScope(anchor, session) &&
        sessionsInSameSeries(anchor, session, eventsById),
    ),
  )
}

/**
 * @param {object} anchor
 * @param {object[]} allSessions
 * @param {Record<string, object>} [eventsById]
 */
export function seriesHistoryMembersFromAll(anchor, allSessions, eventsById = {}) {
  return sortHistorySessionsNewestFirst(
    seriesSessionsFor(anchor, allSessions, eventsById).filter(
      (session) =>
        session.status !== 'active' && historySessionsShareOwnershipScope(anchor, session),
    ),
  )
}
