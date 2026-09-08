import { playLogWinLoss, playLogTemplateDisplayLabel } from './playLogMetrics.js'
import {
  playLogEntrySessionOwnerId,
  playLogPartnerLabel,
  playLogPartnerOutcomeShareUsdRounded,
  playLogPartnersViewerCanMarkPaid,
} from './playLogPartners.js'

/**
 * Combined shared-play ledger from the viewer's seat.
 *
 * Each play still clears through that play's manager. Two non-managers on the
 * same play do not get a direct tab. Paid partners and closed plays stay on the
 * book. Open totals only sum unpaid lines. Guests only appear when the viewer
 * is the manager of that play (they have no Logbook).
 *
 * Settle All is independent books (not a bank). It writes a pairwise settlement
 * on the actor's ledger and alerts the other Edge user to update theirs.
 */

/** @param {import('./playLogPartners.js').PlayLogPartnerRow} row */
export function playLogLedgerCounterpartKey(row) {
  if (row?.kind === 'guest') {
    return `guest:${String(row.guestLabel || '').trim().toLowerCase()}`
  }
  const uid = String(row?.userId || '').trim()
  return uid ? `user:${uid}` : ''
}

/** Whole-dollar money for ledger chips / columns. */
export function formatPlayLogLedgerUsd(n) {
  if (n == null || !Number.isFinite(n)) return '$0'
  const rounded = Math.round(n)
  const abs = Math.abs(rounded)
  const str = abs >= 1000 ? `$${abs.toLocaleString()}` : `$${abs}`
  return rounded < 0 ? `-${str}` : str
}

function emptyLedger(hasSharedPlays = false, partnersLoaded = false) {
  return {
    counterparts: [],
    theyOweYouTotal: 0,
    youOweThemTotal: 0,
    openUsd: 0,
    peopleCount: 0,
    settleablePlayCount: 0,
    hasSharedPlays,
    partnersLoaded,
  }
}

function counterpartLabel(row) {
  if (row.kind === 'guest') {
    const name = String(row.guestLabel || '').trim()
    return name || 'Guest'
  }
  return playLogPartnerLabel({
    display_name: row.displayName,
    handle: row.handle,
  })
}

function mergeCounterpartProfile(prev, row) {
  const next = { ...prev }
  if (row.kind === 'guest') {
    const label = String(row.guestLabel || '').trim()
    if (label) next.guestLabel = label
    next.kind = 'guest'
    return next
  }
  next.kind = 'user'
  next.userId = String(row.userId || next.userId || '')
  if (row.displayName) next.displayName = row.displayName
  if (row.handle) next.handle = row.handle
  if (row.avatarUrl) next.avatarUrl = row.avatarUrl
  return next
}

/**
 * Signed settlement for one unpaid share vs the manager.
 * Positive share = that person won their slice (manager owes them).
 * @param {number} shareUsd
 * @param {boolean} shareIsViewer
 */
function settlementFromShare(shareUsd, shareIsViewer) {
  if (shareIsViewer) {
    return {
      theyOweYou: shareUsd > 0 ? shareUsd : 0,
      youOweThem: shareUsd < 0 ? -shareUsd : 0,
    }
  }
  return {
    theyOweYou: shareUsd < 0 ? -shareUsd : 0,
    youOweThem: shareUsd > 0 ? shareUsd : 0,
  }
}

/**
 * @param {{
 *   viewerUserId?: string | null,
 *   entries?: object[],
 *   partnersBySessionId?: Map<string, import('./playLogPartners.js').PlayLogPartnerRow[]>,
 *   templateById?: Record<string, object>,
 *   templates?: object[],
 *   sessionMetaById?: Map<string, { created_by_user_id?: string }>,
 *   settlements?: object[],
 * }} args
 */
export function buildPlayLogLedger({
  viewerUserId,
  entries = [],
  partnersBySessionId,
  templateById = {},
  templates = [],
  sessionMetaById,
  settlements = [],
} = {}) {
  const uid = String(viewerUserId || '').trim()
  const hasSharedPlays = (entries || []).some(entry => Boolean(entry?.session_id))
  const partnersLoaded = Boolean(partnersBySessionId?.size)
  if (!uid || !partnersLoaded) return emptyLedger(hasSharedPlays, partnersLoaded)
  const overlayClosed = playLogLedgerOverlayClosedSet(settlements, uid)

  /** @type {Map<string, object>} */
  const byKey = new Map()

  for (const entry of entries) {
    const sessionId = String(entry?.session_id || '').trim()
    if (!sessionId) continue
    const partners = partnersBySessionId.get(sessionId)
    if (!partners?.length) continue

    const viewerRow = partners.find(
      p => p.kind === 'user' && String(p.userId || '') === uid,
    )
    if (!viewerRow) continue

    const managerRow = partners.find(p => p.isManager) || null
    if (!managerRow) continue

    const netOutcome = playLogWinLoss(
      entry.values?.money_in,
      entry.values?.money_out,
      entry.values?.acquisition_fee,
    )
    if (netOutcome == null || !Number.isFinite(netOutcome)) continue

    const tpl = templateById[entry.template_id]
    const gameLabel = playLogTemplateDisplayLabel(tpl, templates) || 'Unknown game'
    const ownerId = playLogEntrySessionOwnerId(entry, sessionMetaById)
    const canSettle = playLogPartnersViewerCanMarkPaid(partners, uid, ownerId)
    const playMeta = {
      sessionId,
      entryId: String(entry.id),
      capturedAt: entry.captured_at || null,
      casinoName: String(entry.casino_name || '').trim(),
      gameLabel,
      canSettle,
      ownerId,
    }

    /** @param {import('./playLogPartners.js').PlayLogPartnerRow} counterpart @param {import('./playLogPartners.js').PlayLogPartnerRow} shareRow @param {boolean} paid */
    const addLine = (counterpart, shareRow, paid) => {
      const key = playLogLedgerCounterpartKey(counterpart)
      if (!key) return
      const shareUsd = playLogPartnerOutcomeShareUsdRounded(
        netOutcome,
        shareRow.sharePercent,
      )
      if (shareUsd == null) return

      const shareIsViewer =
        shareRow.kind === 'user' && String(shareRow.userId || '') === uid
      const { theyOweYou, youOweThem } = settlementFromShare(shareUsd, shareIsViewer)

      const prev = byKey.get(key) || {
        key,
        kind: counterpart.kind,
        userId: counterpart.userId || '',
        guestLabel: counterpart.guestLabel || '',
        handle: counterpart.handle || '',
        displayName: counterpart.displayName || '',
        avatarUrl: counterpart.avatarUrl || '',
        theyOweYou: 0,
        youOweThem: 0,
        plays: [],
      }
      const overlay = overlayClosed.has(`${key}::${sessionId}`)
      const closedOnMyBooks = Boolean(paid) || overlay
      const next = mergeCounterpartProfile(prev, counterpart)
      if (!closedOnMyBooks) {
        next.theyOweYou += theyOweYou
        next.youOweThem += youOweThem
      }
      next.plays.push({
        ...playMeta,
        theyOweYou,
        youOweThem,
        paid: closedOnMyBooks,
        canSettle: !closedOnMyBooks,
      })
      byKey.set(key, next)
    }

    if (viewerRow.isManager) {
      for (const partner of partners) {
        if (partner.kind === 'user' && String(partner.userId || '') === uid) continue
        addLine(partner, partner, Boolean(partner.paid))
      }
      continue
    }

    if (managerRow.kind === 'user' && String(managerRow.userId || '') === uid) continue
    addLine(managerRow, viewerRow, Boolean(viewerRow.paid))
  }

  const counterparts = [...byKey.values()]
    .map(row => {
      const openPlays = row.plays.filter(play => !play.paid)
      const closedPlays = row.plays.filter(play => play.paid)
      const plays = [...row.plays].sort((a, b) => {
        if (Boolean(a.paid) !== Boolean(b.paid)) return a.paid ? 1 : -1
        const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0
        const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0
        return tb - ta
      })
      const net = row.theyOweYou - row.youOweThem
      return {
        ...row,
        net,
        label: counterpartLabel(row),
        plays,
        openPlays,
        closedPlays,
        settleablePlayCount: plays.filter(play => play.canSettle).length,
      }
    })
    .sort((a, b) => {
      const aOpen = Math.abs(a.net)
      const bOpen = Math.abs(b.net)
      if (bOpen !== aOpen) return bOpen - aOpen
      return String(a.label).localeCompare(String(b.label), undefined, {
        sensitivity: 'base',
      })
    })

  const theyOweYouTotal = counterparts.reduce((acc, row) => acc + row.theyOweYou, 0)
  const youOweThemTotal = counterparts.reduce((acc, row) => acc + row.youOweThem, 0)
  const openUsd = counterparts.reduce((acc, row) => acc + Math.abs(row.net), 0)
  const settleablePlayCount = counterparts.reduce(
    (acc, row) => acc + row.settleablePlayCount,
    0,
  )
  const peopleCount = counterparts.filter(row => row.net !== 0).length

  return {
    counterparts,
    theyOweYouTotal,
    youOweThemTotal,
    openUsd,
    peopleCount,
    settleablePlayCount,
    hasSharedPlays,
    partnersLoaded: true,
  }
}

/**
 * Mark unpaid ledger counterpart rows Paid on one session.
 * Manager/owner: the selected counterparts. Partner who can mark Paid: their own row.
 * @param {import('./playLogPartners.js').PlayLogPartnerRow[]} partners
 * @param {string} viewerUserId
 * @param {Set<string>} counterpartKeys
 */
export function playLogLedgerPartnersMarkedPaid(partners, viewerUserId, counterpartKeys) {
  const uid = String(viewerUserId || '').trim()
  const viewerRow = (partners || []).find(
    row => row.kind === 'user' && String(row.userId || '') === uid,
  )
  if (!viewerRow) return null
  let changed = false
  const next = partners.map(row => {
    if (viewerRow.isManager) {
      if (row.kind === 'user' && String(row.userId || '') === uid) return row
      if (row.paid) return row
      if (!counterpartKeys?.has(playLogLedgerCounterpartKey(row))) return row
      changed = true
      return { ...row, paid: true }
    }
    if (row.key !== viewerRow.key || row.paid) return row
    changed = true
    return { ...row, paid: true }
  })
  return changed ? next : null
}

/**
 * One paid-RPC patch per session for Settle All (whole ledger or one person).
 * @param {{
 *   ledger: ReturnType<typeof buildPlayLogLedger>,
 *   viewerUserId?: string | null,
 *   partnersBySessionId?: Map<string, import('./playLogPartners.js').PlayLogPartnerRow[]>,
 *   sessionMetaById?: Map<string, { created_by_user_id?: string }>,
 *   counterpartKey?: string | null,
 * }} args
 */
export function buildPlayLogLedgerSettlePatches({
  ledger,
  viewerUserId,
  partnersBySessionId,
  sessionMetaById,
  counterpartKey = null,
} = {}) {
  const uid = String(viewerUserId || '').trim()
  const counterparts = (ledger?.counterparts || []).filter(
    row => !counterpartKey || row.key === counterpartKey,
  )
  /** @type {Map<string, Set<string>>} */
  const keysBySession = new Map()
  for (const row of counterparts) {
    for (const play of row.plays || []) {
      if (!play.canSettle) continue
      const sid = String(play.sessionId || '')
      if (!sid) continue
      const set = keysBySession.get(sid) || new Set()
      set.add(row.key)
      keysBySession.set(sid, set)
    }
  }

  /** @type {{ sessionId: string, partners: import('./playLogPartners.js').PlayLogPartnerRow[] }[]} */
  const patches = []
  for (const [sessionId, keys] of keysBySession) {
    const partners = partnersBySessionId?.get(sessionId)
    if (!partners?.length) continue
    const firstPlayOwner = (ledger?.counterparts || [])
      .flatMap(row => row.plays || [])
      .find(play => String(play.sessionId) === sessionId)?.ownerId
    const ownerId = sessionMetaById?.get(sessionId)?.created_by_user_id || firstPlayOwner
    if (!playLogPartnersViewerCanMarkPaid(partners, uid, ownerId)) continue
    const next = playLogLedgerPartnersMarkedPaid(partners, uid, keys)
    if (!next) continue
    patches.push({ sessionId, partners: next })
  }
  return patches
}

export function formatPlayLogLedgerSettlementCopy({
  otherLabel,
  theyOweYou = 0,
  youOweThem = 0,
  playCount = 0,
}) {
  const net = theyOweYou - youOweThem
  const plays = playCount === 1 ? '1 play' : `${playCount} plays`
  let netBit = 'even'
  if (net > 0) netBit = `net ${formatPlayLogLedgerUsd(net)} to you`
  else if (net < 0) netBit = `net ${formatPlayLogLedgerUsd(-net)} to them`
  const detail = `They owed you ${formatPlayLogLedgerUsd(theyOweYou)} · You owed them ${formatPlayLogLedgerUsd(youOweThem)} · ${netBit} · ${plays}`
  const title = `Settled with ${otherLabel}`
  return { title, detail, message: `${title} · ${detail}` }
}

/** Counterpart key for the other person on a stored Settle All row. */
export function playLogLedgerSettlementOtherKey(row, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  if (String(row?.actor_user_id || '') === uid) {
    if (row.counterpart_kind === 'guest') {
      return `guest:${String(row.counterpart_guest_label || '').trim().toLowerCase()}`
    }
    const id = String(row.counterpart_user_id || '').trim()
    return id ? `user:${id}` : ''
  }
  const actor = String(row?.actor_user_id || '').trim()
  return actor ? `user:${actor}` : ''
}

/** Flip they/you when the viewer is the counterpart, not the person who tapped Settle All. */
export function playLogLedgerSettlementView(row, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  const viewerIsActor = String(row?.actor_user_id || '') === uid
  const theyOweYou = viewerIsActor
    ? Number(row.they_owe_you) || 0
    : Number(row.you_owe_them) || 0
  const youOweThem = viewerIsActor
    ? Number(row.you_owe_them) || 0
    : Number(row.they_owe_you) || 0
  const otherLabel = viewerIsActor
    ? counterpartLabel({
        kind: row.counterpart_kind,
        guestLabel: row.counterpart_guest_label,
        displayName: row.counterpartDisplayName,
        handle: row.counterpartHandle,
      })
    : playLogPartnerLabel({
        display_name: row.actorDisplayName,
        handle: row.actorHandle,
      })
  const copy = formatPlayLogLedgerSettlementCopy({
    otherLabel,
    theyOweYou,
    youOweThem,
    playCount: Number(row.play_count) || 0,
  })
  const viewerIsCounterpart = String(row?.counterpart_user_id || '') === uid
  const acceptedAt = row.counterpart_accepted_at || null
  const declinedAt = row.counterpart_declined_at || null
  return {
    id: row.id,
    createdAt: row.created_at,
    counterpartKey: playLogLedgerSettlementOtherKey(row, uid),
    otherLabel,
    theyOweYou,
    youOweThem,
    playCount: Number(row.play_count) || 0,
    sessionIds: Array.isArray(row.session_ids) ? row.session_ids.map(String) : [],
    viewerIsActor,
    viewerIsCounterpart,
    needsAccept: viewerIsCounterpart && !acceptedAt && !declinedAt,
    waitingOnThem:
      viewerIsActor && row.counterpart_kind === 'user' && !acceptedAt && !declinedAt,
    leftOpenByYou: viewerIsCounterpart && !acceptedAt && Boolean(declinedAt),
    leftOpenByThem: viewerIsActor && !acceptedAt && Boolean(declinedAt),
    counterpartAcceptedAt: acceptedAt,
    counterpartDeclinedAt: declinedAt,
    ...copy,
  }
}

/**
 * Session ids closed on the viewer's books via Settle All (actor immediately,
 * counterpart only after they update their books).
 * @param {object[]} settlements
 * @param {string} viewerUserId
 */
export function playLogLedgerOverlayClosedSet(settlements, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  const closed = new Set()
  for (const row of settlements || []) {
    const otherKey = playLogLedgerSettlementOtherKey(row, uid)
    if (!otherKey) continue
    const isActor = String(row.actor_user_id || '') === uid
    const isCounterpartAccepted =
      String(row.counterpart_user_id || '') === uid && Boolean(row.counterpart_accepted_at)
    if (!isActor && !isCounterpartAccepted) continue
    for (const sid of row.session_ids || []) {
      const sessionId = String(sid || '').trim()
      if (sessionId) closed.add(`${otherKey}::${sessionId}`)
    }
  }
  return closed
}

/** Snapshot of each pair about to be squared (one insert per counterpart). */
export function buildPlayLogLedgerSettlementInserts({
  ledger,
  counterpartKey = null,
  sessionId = null,
} = {}) {
  const sessionFilter = String(sessionId || '').trim()
  const counterparts = (ledger?.counterparts || []).filter(
    row => !counterpartKey || row.key === counterpartKey,
  )
  return counterparts
    .map(row => {
      const settlePlays = (row.plays || []).filter(play => {
        if (!play.canSettle) return false
        if (sessionFilter && String(play.sessionId) !== sessionFilter) return false
        return true
      })
      if (!settlePlays.length) return null
      const theyOweYou = settlePlays.reduce((acc, play) => acc + (play.theyOweYou || 0), 0)
      const youOweThem = settlePlays.reduce((acc, play) => acc + (play.youOweThem || 0), 0)
      const net = theyOweYou - youOweThem
      const copy = formatPlayLogLedgerSettlementCopy({
        otherLabel: row.label,
        theyOweYou,
        youOweThem,
        playCount: settlePlays.length,
      })
      return {
        counterpart_kind: row.kind,
        counterpart_user_id: row.kind === 'user' ? row.userId || null : null,
        counterpart_guest_label:
          row.kind === 'guest' ? String(row.guestLabel || '').trim() || null : null,
        they_owe_you: theyOweYou,
        you_owe_them: youOweThem,
        net,
        play_count: settlePlays.length,
        session_ids: [...new Set(settlePlays.map(play => play.sessionId).filter(Boolean))],
        message: copy.message,
      }
    })
    .filter(Boolean)
}

/** Counterpart keys closed on the viewer's books for one session. */
export function playLogLedgerClosedKeysForSession(settlements, viewerUserId, sessionId) {
  const sid = String(sessionId || '').trim()
  /** @type {Set<string>} */
  const keys = new Set()
  if (!sid) return keys
  const overlay = playLogLedgerOverlayClosedSet(settlements, viewerUserId)
  const suffix = `::${sid}`
  for (const token of overlay) {
    if (String(token).endsWith(suffix)) keys.add(String(token).slice(0, -suffix.length))
  }
  return keys
}

export function playLogPaidSettleSearch({ actorUserId, entryId, sessionId } = {}) {
  const params = new URLSearchParams()
  params.set('tab', 'logbook')
  params.set('playLogLedger', '1')
  const actor = String(actorUserId || '').trim()
  if (actor) params.set('playLogPartner', `user:${actor}`)
  const session = String(sessionId || '').trim()
  if (session) params.set('playLogSession', session)
  const entry = String(entryId || '').trim()
  if (entry) params.set('playLogEntry', entry)
  return params
}
