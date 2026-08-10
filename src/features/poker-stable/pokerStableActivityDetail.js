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
const AMOUNT_PART_RE = /^(?:table\s+)?([+-])?\$?([\d,]+)(?:\.(\d+))?$/i

/**
 * Parse stake session-complete activity detail.
 * New: `Deal · Wynn 10/20 · +$1,252`
 * Legacy: `Deal · table +1,234.56`
 * @param {string | null | undefined} detail
 * @returns {{
 *   dealLabel: string,
 *   mid: string,
 *   grossPl: number | null,
 *   isWin: boolean,
 *   isLoss: boolean,
 * }}
 */
export function parsePokerStableSessionCompleteDetail(detail) {
  const raw = String(detail || '').trim()
  if (!raw) {
    return { dealLabel: '', mid: '', grossPl: null, isWin: false, isLoss: false }
  }

  // Legacy fast-path
  const tableIdx = raw.indexOf(SESSION_COMPLETE_TABLE_MARKER)
  if (tableIdx !== -1) {
    const dealLabel = raw.slice(0, tableIdx).trim()
    const amountRaw = raw.slice(tableIdx + SESSION_COMPLETE_TABLE_MARKER.length).trim()
    const grossPl = Number(amountRaw.replace(/,/g, '').replace(/^\$/, ''))
    if (!Number.isFinite(grossPl)) {
      return { dealLabel, mid: '', grossPl: null, isWin: false, isLoss: false }
    }
    return {
      dealLabel,
      mid: '',
      grossPl,
      isWin: grossPl > 0,
      isLoss: grossPl < 0,
    }
  }

  const parts = raw
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) {
    return { dealLabel: '', mid: '', grossPl: null, isWin: false, isLoss: false }
  }

  let amountIdx = -1
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (AMOUNT_PART_RE.test(parts[i])) {
      amountIdx = i
      break
    }
  }

  const dealLabel = parts[0] || ''
  if (amountIdx === -1) {
    return {
      dealLabel,
      mid: parts.slice(1).join(' · '),
      grossPl: null,
      isWin: false,
      isLoss: false,
    }
  }

  const amountMatch = parts[amountIdx].match(AMOUNT_PART_RE)
  const sign = amountMatch?.[1] === '-' ? -1 : 1
  const abs = Number(String(amountMatch?.[2] || '').replace(/,/g, ''))
  const grossPl = Number.isFinite(abs) ? sign * abs : null
  const mid = parts.slice(1, amountIdx).join(' · ')

  return {
    dealLabel,
    mid,
    grossPl,
    isWin: grossPl != null && grossPl > 0,
    isLoss: grossPl != null && grossPl < 0,
  }
}

/**
 * Display line for session-complete detail (whole dollars, no "table").
 * @param {string | null | undefined} detail
 */
export function formatPokerStableSessionCompleteDetailDisplay(detail) {
  const { dealLabel, mid, grossPl } = parsePokerStableSessionCompleteDetail(detail)
  if (!dealLabel && grossPl == null) return String(detail || '').trim()
  /** @type {string[]} */
  const bits = []
  if (dealLabel) bits.push(dealLabel)
  if (mid) bits.push(mid)
  if (grossPl != null) {
    const abs = Math.round(Math.abs(grossPl))
    const sign = grossPl >= 0 ? '+' : '-'
    bits.push(`${sign}$${abs.toLocaleString('en-US')}`)
  }
  return bits.join(' · ')
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
