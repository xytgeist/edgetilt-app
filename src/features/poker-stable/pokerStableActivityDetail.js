/** Split poker stable activity `detail_text` (`Backer name · Deal label`). */

/**
 * @param {string | null | undefined} detail
 * @returns {{ backerName: string, dealLabel: string }}
 */
export function parsePokerStableActivityDetail(detail) {
  const raw = String(detail || '').trim()
  if (!raw) return { backerName: '', dealLabel: '' }
  const sep = raw.indexOf(' · ')
  if (sep === -1) return { backerName: '', dealLabel: raw }
  return {
    backerName: raw.slice(0, sep).trim(),
    dealLabel: raw.slice(sep + 3).trim(),
  }
}

/**
 * @param {string | null | undefined} backerName
 * @param {string | null | undefined} dealLabel
 */
export function formatPokerStableActivityDetail(backerName, dealLabel) {
  const name = String(backerName || '').trim()
  const label = String(dealLabel || '').trim()
  if (name && label) return `${name} · ${label}`
  return label || name
}

/** Lounge Alerts + push prefix for a losing stake session (backer notification). */
export const POKER_STABLE_SESSION_LOSS_NOTIFICATION_EMOJI = '🐡'

/** Lounge Alerts + push prefix for a winning stake session (backer notification). */
export const POKER_STABLE_SESSION_WIN_NOTIFICATION_EMOJI = '🦈'

const SESSION_COMPLETE_TABLE_MARKER = ' · table '

/**
 * Parse stake session-complete activity detail (`Deal · table +1,234.56`).
 * @param {string | null | undefined} detail
 */
export function parsePokerStableSessionCompleteDetail(detail) {
  const raw = String(detail || '').trim()
  const tableIdx = raw.indexOf(SESSION_COMPLETE_TABLE_MARKER)
  if (tableIdx === -1) {
    return { dealLabel: raw, grossPl: null, isWin: false, isLoss: false }
  }
  const dealLabel = raw.slice(0, tableIdx).trim()
  const amountRaw = raw.slice(tableIdx + SESSION_COMPLETE_TABLE_MARKER.length).trim()
  const grossPl = Number(amountRaw.replace(/,/g, ''))
  if (!Number.isFinite(grossPl)) {
    return { dealLabel, grossPl: null, isWin: false, isLoss: false }
  }
  return {
    dealLabel,
    grossPl,
    isWin: grossPl > 0,
    isLoss: grossPl < 0,
  }
}

/**
 * @param {{ event_type?: string, detail_text?: string | null }} event
 * @returns {string | null}
 */
export function pokerStableSessionCompleteNotificationEmoji(event) {
  if (event?.event_type !== 'poker_stable_session_complete') return null
  const { isWin, isLoss } = parsePokerStableSessionCompleteDetail(event?.detail_text)
  if (isLoss) return POKER_STABLE_SESSION_LOSS_NOTIFICATION_EMOJI
  if (isWin) return POKER_STABLE_SESSION_WIN_NOTIFICATION_EMOJI
  return null
}
