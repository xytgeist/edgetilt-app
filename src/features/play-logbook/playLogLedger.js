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
 * same play do not get a direct tab. Paid partner rows drop out. Guests only
 * appear when the viewer is the manager of that play (they have no Logbook).
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

/** @param {{ openUsd: number, peopleCount: number }} args */
export function formatPlayLogLedgerOpenChip({ openUsd, peopleCount }) {
  const money = formatPlayLogLedgerUsd(Math.abs(openUsd || 0))
  const people = peopleCount === 1 ? '1 person' : `${peopleCount} people`
  return `Open ${money} · ${people}`
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
 * }} args
 */
export function buildPlayLogLedger({
  viewerUserId,
  entries = [],
  partnersBySessionId,
  templateById = {},
  templates = [],
  sessionMetaById,
} = {}) {
  const uid = String(viewerUserId || '').trim()
  const hasSharedPlays = (entries || []).some(entry => Boolean(entry?.session_id))
  const partnersLoaded = Boolean(partnersBySessionId?.size)
  if (!uid || !partnersLoaded) return emptyLedger(hasSharedPlays, partnersLoaded)

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

    /** @param {import('./playLogPartners.js').PlayLogPartnerRow} counterpart @param {import('./playLogPartners.js').PlayLogPartnerRow} shareRow */
    const addLine = (counterpart, shareRow) => {
      const key = playLogLedgerCounterpartKey(counterpart)
      if (!key) return
      const shareUsd = playLogPartnerOutcomeShareUsdRounded(
        netOutcome,
        shareRow.sharePercent,
      )
      if (shareUsd == null || shareUsd === 0) return

      const shareIsViewer =
        shareRow.kind === 'user' && String(shareRow.userId || '') === uid
      const { theyOweYou, youOweThem } = settlementFromShare(shareUsd, shareIsViewer)
      if (!theyOweYou && !youOweThem) return

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
      const next = mergeCounterpartProfile(prev, counterpart)
      next.theyOweYou += theyOweYou
      next.youOweThem += youOweThem
      next.plays.push({
        ...playMeta,
        theyOweYou,
        youOweThem,
      })
      byKey.set(key, next)
    }

    if (viewerRow.isManager) {
      for (const partner of partners) {
        if (partner.kind === 'user' && String(partner.userId || '') === uid) continue
        if (partner.paid) continue
        addLine(partner, partner)
      }
      continue
    }

    if (viewerRow.paid) continue
    if (managerRow.kind === 'user' && String(managerRow.userId || '') === uid) continue
    addLine(managerRow, viewerRow)
  }

  const counterparts = [...byKey.values()]
    .map(row => {
      const net = row.theyOweYou - row.youOweThem
      const plays = [...row.plays].sort((a, b) => {
        const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0
        const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0
        return tb - ta
      })
      return {
        ...row,
        net,
        label: counterpartLabel(row),
        plays,
        settleablePlayCount: plays.filter(play => play.canSettle).length,
      }
    })
    .filter(row => row.net !== 0)
    .sort((a, b) => {
      const absDiff = Math.abs(b.net) - Math.abs(a.net)
      if (absDiff) return absDiff
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

  return {
    counterparts,
    theyOweYouTotal,
    youOweThemTotal,
    openUsd,
    peopleCount: counterparts.length,
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
