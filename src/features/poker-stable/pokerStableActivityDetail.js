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
