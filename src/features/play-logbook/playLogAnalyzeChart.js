import { playLogCashReturnPct, playLogWinLoss } from './playLogMetrics.js'

/** @typedef {import('./playLogMetrics.js').PlayLogEntry} PlayLogEntry */

/**
 * @typedef {{
 *   label: string,
 *   capturedAt: string,
 *   cashReturnCumulativePct: number | null,
 *   cumulativeNetUsd: number | null,
 * }} PlayLogAnalyzeTrendPoint
 */

/**
 * @typedef {{
 *   chartable: boolean,
 *   labels: string[],
 *   points: PlayLogAnalyzeTrendPoint[],
 *   hasPnlTrend: boolean,
 *   minPlaysHint: string | null,
 * }} PlayLogAnalyzeTrendSeries
 */

/**
 * Chronological trend: cumulative cash return % and cumulative net P/L after each play.
 *
 * @param {PlayLogEntry[]} entries
 * @returns {PlayLogAnalyzeTrendSeries}
 */
export function buildPlayLogAnalyzeTrendSeries(entries) {
  const sorted = [...(entries || [])].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  )

  if (sorted.length === 0) {
    return {
      chartable: false,
      labels: [],
      points: [],
      hasPnlTrend: false,
      minPlaysHint: null,
    }
  }

  let sumIn = 0
  let sumOut = 0
  let cumulativeNet = 0
  let netPlayCount = 0
  /** @type {PlayLogAnalyzeTrendPoint[]} */
  const points = []

  sorted.forEach((entry, index) => {
    const inn = Number(entry?.values?.money_in)
    const outVal = Number(entry?.values?.money_out)
    if (Number.isFinite(inn)) sumIn += inn
    if (Number.isFinite(outVal)) sumOut += outVal

    const playNet = playLogWinLoss(
      entry?.values?.money_in,
      entry?.values?.money_out,
      entry?.values?.acquisition_fee,
    )
    if (playNet != null) {
      cumulativeNet += playNet
      netPlayCount += 1
    }

    points.push({
      label: String(index + 1),
      capturedAt: entry.captured_at || '',
      cashReturnCumulativePct: playLogCashReturnPct(sumIn, sumOut),
      cumulativeNetUsd: netPlayCount > 0 ? cumulativeNet : null,
    })
  })

  const withReturn = points.filter(p => p.cashReturnCumulativePct != null)
  const hasPnlTrend = points.filter(p => p.cumulativeNetUsd != null).length >= 2
  const chartable = withReturn.length >= 2

  return {
    chartable,
    labels: points.map(p => p.label),
    points,
    hasPnlTrend,
    minPlaysHint: chartable
      ? null
      : withReturn.length === 0
        ? 'Log cash in and cash out to see the return trend.'
        : 'Log at least 2 plays with cash in/out to see the trend.',
  }
}
