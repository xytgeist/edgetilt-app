/**
 * Calculator → Logbook snapshot fields (Current EV / Average Case / acquisition fee at log time).
 * Stored in play_log_entries.values when using "Log play in Logbook".
 */

/**
 * Recommended finder's fee = EV mult × bet × scout%.
 * @param {{ evMult?: number | null, betSize?: number | null, scoutPercent?: number | null }} args
 * @returns {number | null}
 */
export function recommendedAcquisitionFeeUsd({ evMult = null, betSize = null, scoutPercent = null }) {
  const mult = Number(evMult)
  const bet = Number(betSize)
  const pct = Number(scoutPercent)
  if (!Number.isFinite(mult) || !Number.isFinite(bet) || !Number.isFinite(pct)) return null
  const fee = mult * bet * (pct / 100)
  if (!Number.isFinite(fee) || fee <= 0) return null
  return Math.round(Math.abs(fee) * 100) / 100
}

/**
 * @param {{
 *   currentRtpPct?: number | null,
 *   averageCaseMult?: number | null,
 *   betSize?: number | null,
 *   expectedEvUsd?: number | null,
 *   acquisitionFeeUsd?: number | null,
 * }} args
 * @returns {Record<string, number>}
 */
export function playLogCalcEvPrefill({
  currentRtpPct = null,
  averageCaseMult = null,
  betSize = null,
  expectedEvUsd = null,
  acquisitionFeeUsd = null,
}) {
  /** @type {Record<string, number>} */
  const out = {}
  if (Number.isFinite(currentRtpPct)) {
    out.current_ev_rtp = Math.round(currentRtpPct * 10) / 10
  }
  if (Number.isFinite(averageCaseMult)) {
    out.average_case_mult = Math.round(averageCaseMult * 10) / 10
    const bet = Number(betSize)
    if (Number.isFinite(bet)) {
      out.average_case_usd = Math.round(averageCaseMult * bet * 100) / 100
    }
  }
  if (Number.isFinite(expectedEvUsd)) {
    out.expected_ev_usd = Math.round(expectedEvUsd * 100) / 100
  }
  const fee =
    acquisitionFeeUsd != null
      ? Number(acquisitionFeeUsd)
      : null
  if (Number.isFinite(fee)) {
    out.acquisition_fee = Math.round(Math.abs(fee) * 100) / 100
  }
  return out
}
/** @param {string} slug @param {unknown} v @param {import('../features/play-logbook/playLogMetrics.js').PlayLogValueType} [type] */
export function formatPlayLogCalcMetricDisplay(slug, v, type = 'decimal') {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (slug === 'current_ev_rtp') return `${n.toFixed(1)}%`
  if (slug === 'average_case_mult') return `${n.toFixed(1)}×`
  if (slug === 'average_case_usd' || slug === 'expected_ev_usd') {
    const abs = Math.abs(n)
    const str =
      abs >= 1000 ? `$${Math.round(abs).toLocaleString()}` : `$${abs.toFixed(abs >= 100 ? 0 : 2)}`
    return n < 0 ? `-${str}` : str
  }
  return String(v)
}

export const PLAY_LOG_CALC_SNAPSHOT_SLUGS = [
  'current_ev_rtp',
  'average_case_mult',
  'average_case_usd',
  'expected_ev_usd',
  'acquisition_fee',
]
