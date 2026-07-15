/** @typedef {'user' | 'guest'} PlayLogPartnerKind */

/**
 * @typedef {Object} PlayLogPartnerRow
 * @property {string} key - stable React key
 * @property {PlayLogPartnerKind} kind
 * @property {string} [userId]
 * @property {string} [handle]
 * @property {string} [displayName]
 * @property {string} [avatarUrl]
 * @property {string} [guestLabel]
 * @property {string} sharePercent - form string, e.g. "50"
 * @property {boolean} [isManager]
 * @property {boolean} [paid]
 */

const PERCENT_SUM_TARGET = 100
const PERCENT_SUM_TOLERANCE = 0.02

/** @param {PlayLogPartnerRow[]} rows */
export function playLogPartnersPercentSum(rows) {
  return rows.reduce((acc, row) => {
    const n = Number(String(row.sharePercent ?? '').replace(/[^0-9.]/g, ''))
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/** @param {PlayLogPartnerRow[]} rows */
export function playLogPartnersSumValid(rows) {
  const sum = playLogPartnersPercentSum(rows)
  return Math.abs(sum - PERCENT_SUM_TARGET) < PERCENT_SUM_TOLERANCE
}

/** @param {PlayLogPartnerRow[]} rows */
export function playLogPartnersSplitForDisplay(rows) {
  const users = (rows || []).filter(r => r.kind === 'user')
  const guests = (rows || []).filter(r => r.kind === 'guest')
  return { users, guests }
}

/** @param {PlayLogPartnerRow[]} rows */
export function playLogPartnersHasExtraPartner(rows, creatorUserId) {
  const creator = String(creatorUserId || '').trim()
  return rows.some(row => {
    if (row.kind === 'guest') return true
    return row.kind === 'user' && String(row.userId || '') !== creator
  })
}

/** @param {PlayLogPartnerRow[]} rows @param {string} creatorUserId */
export function playLogPartnersValidationError(rows, creatorUserId) {
  if (!rows.length) return 'Add your share percent.'
  const creator = String(creatorUserId || '').trim()
  if (!rows.some(r => r.kind === 'user' && String(r.userId) === creator)) {
    return 'Include yourself in partners.'
  }
  if (!playLogPartnersSumValid(rows)) {
    const sum = playLogPartnersPercentSum(rows)
    return `Partner shares must total 100% (currently ${sum.toFixed(1)}%).`
  }
  const managerCount = rows.filter(r => r.isManager).length
  if (managerCount !== 1) return 'Select exactly one play manager.'
  for (const row of rows) {
    const n = Number(String(row.sharePercent ?? '').replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n) || n <= 0 || n > 100) return 'Each partner needs a share between 0 and 100%.'
    if (row.kind === 'guest' && !String(row.guestLabel || '').trim()) return 'Enter a name for each guest partner.'
  }
  return null
}

/** @param {PlayLogPartnerRow[]} rows */
export function playLogPartnersToRpcPayload(rows) {
  return rows.map(row => {
    const share_percent = Number(String(row.sharePercent ?? '').replace(/[^0-9.]/g, ''))
    if (row.kind === 'guest') {
      return {
        kind: 'guest',
        guest_label: String(row.guestLabel || '').trim(),
        share_percent,
        is_manager: Boolean(row.isManager),
        paid: Boolean(row.paid),
      }
    }
    return {
      kind: 'user',
      user_id: row.userId,
      share_percent,
      is_manager: Boolean(row.isManager),
      paid: Boolean(row.paid),
    }
  })
}

/** @param {PlayLogPartnerRow[]} rows @param {string} managerKey */
export function playLogPartnersWithManager(rows, managerKey) {
  return rows.map(row => ({
    ...row,
    isManager: row.key === managerKey,
    paid: row.key === managerKey ? true : row.paid,
  }))
}

/** Session owner is play manager when none is selected. */
/** @param {PlayLogPartnerRow[]} rows @param {string} ownerUserId */
export function playLogPartnersEnsureManager(rows, ownerUserId) {
  if (rows.filter(r => r.isManager).length === 1) return rows
  const ownerKey = rows.find(
    r => r.kind === 'user' && String(r.userId) === String(ownerUserId),
  )?.key
  if (!ownerKey) return rows
  return playLogPartnersWithManager(rows, ownerKey)
}

/** @param {Array<Record<string, unknown>>} rows @param {string} [ownerUserId] */
export function playLogPartnersFromSessionList(rows, ownerUserId) {
  const mapped = (rows || []).map(row => {
    const kind = row.participant_kind === 'guest' ? 'guest' : 'user'
    const userId = row.user_id ? String(row.user_id) : ''
    const guestLabel = row.guest_label ? String(row.guest_label) : ''
    return {
      key: kind === 'guest' ? `guest:${row.id}` : `user:${userId}`,
      kind,
      userId: kind === 'user' ? userId : undefined,
      handle: row.handle ? String(row.handle) : '',
      displayName: row.display_name ? String(row.display_name) : '',
      avatarUrl: row.avatar_url ? String(row.avatar_url) : '',
      guestLabel: kind === 'guest' ? guestLabel : undefined,
      sharePercent: String(row.share_percent ?? ''),
      isManager: Boolean(row.is_manager),
      paid: Boolean(row.paid),
    }
  })
  const owner = String(ownerUserId || '').trim()
  return owner ? playLogPartnersEnsureManager(mapped, owner) : mapped
}

/** @param {PlayLogPartnerRow[]} rows @param {string} ownerUserId */
export function playLogPartnersForSave(rows, ownerUserId) {
  return playLogPartnersEnsureManager(rows, ownerUserId)
}

/** @param {PlayLogPartnerRow[]} rows @param {string} userId */
export function playLogPartnersViewerIsManager(rows, userId) {
  return rows.some(
    r => r.isManager && r.kind === 'user' && String(r.userId) === String(userId),
  )
}

/** Creator (session owner) or designated manager may mark partners paid. */
export function playLogPartnersViewerCanMarkPaid(rows, userId, creatorUserId) {
  const uid = String(userId || '').trim()
  if (!uid) return false
  if (String(creatorUserId || '').trim() === uid) return true
  return playLogPartnersViewerIsManager(rows, uid)
}

/** @param {string} userId @param {{ handle?: string, display_name?: string } | null} [profile] */
export function defaultCreatorPartnerRow(userId, profile) {
  return {
    key: `user:${userId}`,
    kind: 'user',
    userId,
    handle: profile?.handle || '',
    displayName: profile?.display_name || '',
    avatarUrl: '',
    sharePercent: '100',
    isManager: true,
    paid: true,
  }
}

/**
 * When the first partner is added, ensure the session owner row exists for share split UI.
 * @param {PlayLogPartnerRow[]} rows
 * @param {string} ownerUserId
 * @param {string} userId
 * @param {{ handle?: string, display_name?: string } | null} [profile]
 */
export function playLogPartnersEnsureCreatorRow(rows, ownerUserId, userId, profile) {
  const owner = String(ownerUserId || userId || '').trim()
  if (!owner) return rows
  if (rows.some(r => r.kind === 'user' && String(r.userId) === owner)) return rows
  const creator = defaultCreatorPartnerRow(userId, profile)
  return [{ ...creator, sharePercent: '', isManager: true, paid: true }, ...rows]
}

/**
 * Partner attribution: share of session net P&L (money out − money in − acquisition fee).
 * @param {number | null | undefined} netOutcome
 * @param {string} sharePercentStr
 * @returns {number | null}
 */
export function playLogPartnerOutcomeShareUsd(netOutcome, sharePercentStr) {
  if (netOutcome == null || !Number.isFinite(netOutcome)) return null
  const pct = Number(String(sharePercentStr ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(pct) || pct <= 0) return null
  return netOutcome * (pct / 100)
}

/** Partner row display: nearest whole dollar. */
export function playLogPartnerOutcomeShareUsdRounded(netOutcome, sharePercentStr) {
  const usd = playLogPartnerOutcomeShareUsd(netOutcome, sharePercentStr)
  if (usd == null) return null
  return Math.round(usd)
}

/** @param {number | null | undefined} netOutcome @param {string} sharePercentStr */
export function formatPlayLogPartnerOutcomeShare(netOutcome, sharePercentStr) {
  const usd = playLogPartnerOutcomeShareUsdRounded(netOutcome, sharePercentStr)
  if (usd == null) return null
  const abs = Math.abs(usd)
  const str = abs >= 1000 ? `$${abs.toLocaleString()}` : `$${abs}`
  return usd < 0 ? `-${str}` : str
}

/** @param {number | null | undefined} usd */
export function playLogPartnerOutcomeShareToneClass(usd) {
  if (usd == null || !Number.isFinite(usd)) return 'text-zinc-400'
  if (usd > 0) return 'text-emerald-300'
  if (usd < 0) return 'text-red-300'
  return 'text-zinc-300'
}

/**
 * Session owner (`play_log_sessions.created_by_user_id`) for a shared entry.
 * @param {{ session_id?: string | null, play_log_sessions?: { created_by_user_id?: string } | null }} entry
 * @param {Map<string, { created_by_user_id?: string }>} sessionMetaById
 */
export function playLogEntrySessionOwnerId(entry, sessionMetaById) {
  const sid = entry?.session_id
  if (!sid) return null
  const embedded = entry?.play_log_sessions?.created_by_user_id
  if (embedded) return String(embedded)
  const meta = sessionMetaById?.get(String(sid))
  if (meta?.created_by_user_id) return String(meta.created_by_user_id)
  return null
}

/** Solo entries: viewer owns the row. Shared: only session owner. */
export function playLogEntryIsSessionOwner(entry, viewerUserId, sessionMetaById) {
  if (!entry?.session_id) return true
  const ownerId = playLogEntrySessionOwnerId(entry, sessionMetaById)
  if (!ownerId) return false
  return String(ownerId) === String(viewerUserId || '')
}

/** @param {{ handle?: string, display_name?: string, user_id?: string, avatar_url?: string }} profile */
export function playLogPartnerLabel(profile) {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handle = String(profile?.handle || '').trim()
  if (handle) return handle.startsWith('@') ? handle : `@${handle}`
  return 'Member'
}
