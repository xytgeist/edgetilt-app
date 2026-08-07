/** US equity regular session (Mon–Fri 9:30–16:00 ET). Keep in sync with `supabase/functions/_shared/usEquityMarketSession.ts`. */

const ET = 'America/New_York'

function etParts(d) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const map = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[String(map.weekday)] ?? 0,
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

/** Mon–Fri 9:30–16:00 ET (no holiday calendar yet). */
export function isUsEquityRegularSessionOpen(now = new Date()) {
  const p = etParts(now)
  if (p.weekday < 1 || p.weekday > 5) return false
  const mins = p.hour * 60 + p.minute
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}

/**
 * Reject synthetic calendar-24h diagonals (~32 pts / ~24h span).
 * Keep in sync with `supabase/functions/_shared/usEquityMarketSession.ts`.
 * @param {Array<{ t: number, c: number }> | null | undefined} bars
 */
export function isUsableStockIntradayBars(bars) {
  if (!Array.isArray(bars) || bars.length < 10) return false
  const sorted = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .map((b) => ({
      t: Math.floor(b.t > 1e12 ? b.t / 1000 : b.t),
      c: b.c,
    }))
    .sort((a, b) => a.t - b.t)
  if (sorted.length < 10) return false
  const span = sorted[sorted.length - 1].t - sorted[0].t
  return span > 0 && span <= 8 * 3600
}

/**
 * If bars span more than one session (~24h Yahoo period1/period2), keep the trailing
 * ≤8h slice so feed minis / 1D can still paint until Edge returns RTH-only series.
 * @param {Array<{ t: number, c: number, [key: string]: unknown }> | null | undefined} bars
 */
export function clipStockBarsToUsableIntraday(bars) {
  if (isUsableStockIntradayBars(bars)) return Array.isArray(bars) ? bars : []
  if (!Array.isArray(bars) || bars.length < 10) return []
  const sorted = bars
    .filter((b) => Number.isFinite(b?.t) && Number.isFinite(b?.c))
    .map((b) => {
      const t = Math.floor(b.t > 1e12 ? b.t / 1000 : b.t)
      return { ...b, t }
    })
    .sort((a, b) => a.t - b.t)
  if (sorted.length < 10) return []
  const end = sorted[sorted.length - 1].t
  const clipped = sorted.filter((b) => b.t >= end - 8 * 3600)
  return isUsableStockIntradayBars(clipped) ? clipped : []
}
