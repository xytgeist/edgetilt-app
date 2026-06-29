/** @typedef {import('./playLogMetrics.js').PlayLogEntry} PlayLogEntry */

/** @typedef {'last_week' | 'last_month' | 'ytd' | 'year' | 'all'} PlayLogAnalyzePeriodId */

export const PLAY_LOG_ANALYZE_PERIOD_ALL = 'all'

/** @type {{ id: PlayLogAnalyzePeriodId, label: string }[]} */
export const PLAY_LOG_ANALYZE_PERIODS = [
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
]

/**
 * Inclusive lower bound for `captured_at` (local calendar where noted).
 * @param {PlayLogAnalyzePeriodId | string} periodId
 * @param {Date} [now]
 * @returns {Date | null}
 */
export function playLogAnalyzePeriodStart(periodId, now = new Date()) {
  switch (periodId) {
    case 'last_week': {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'last_month': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    case 'year': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'all':
    default:
      return null
  }
}

/**
 * @param {PlayLogEntry[]} entries
 * @param {PlayLogAnalyzePeriodId | string} periodId
 * @param {Date} [now]
 */
export function filterPlayLogEntriesByPeriod(entries, periodId, now = new Date()) {
  const start = playLogAnalyzePeriodStart(periodId, now)
  if (!start) return entries || []
  const startMs = start.getTime()
  return (entries || []).filter(entry => {
    const t = new Date(entry?.captured_at || '').getTime()
    return Number.isFinite(t) && t >= startMs
  })
}

/**
 * @param {PlayLogAnalyzePeriodId | string} periodId
 */
export function playLogAnalyzePeriodEmptyLabel(periodId) {
  const row = PLAY_LOG_ANALYZE_PERIODS.find(p => p.id === periodId)
  if (!row || row.id === 'all') return 'No plays logged yet.'
  return `No plays in ${row.label.toLowerCase()}.`
}
