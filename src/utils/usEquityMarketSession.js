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
