/** @typedef {'user' | 'guest'} PlayLogPartnerKind */

/**
 * @typedef {Object} PlayLogPartnerRow
 * @property {string} key — stable React key
 * @property {PlayLogPartnerKind} kind
 * @property {string} [userId]
 * @property {string} [handle]
 * @property {string} [displayName]
 * @property {string} [avatarUrl]
 * @property {string} [guestLabel]
 * @property {string} sharePercent — form string, e.g. "50"
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
      }
    }
    return {
      kind: 'user',
      user_id: row.userId,
      share_percent,
    }
  })
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
  }
}

/** @param {Array<Record<string, unknown>>} rows */
export function playLogPartnersFromSessionList(rows) {
  return (rows || []).map(row => {
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
    }
  })
}

/** @param {{ handle?: string, display_name?: string, user_id?: string, avatar_url?: string }} profile */
export function playLogPartnerLabel(profile) {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handle = String(profile?.handle || '').trim()
  if (handle) return handle.startsWith('@') ? handle : `@${handle}`
  return 'Member'
}
