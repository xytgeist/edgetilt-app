export function formatGolfToPar(score) {
  if (score == null || !Number.isFinite(Number(score))) return '—'
  const n = Number(score)
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}

function golfDay(value) {
  const raw = String(value || '').trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) }
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  const dt = new Date(t)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

function golfDayDate(day) {
  return new Date(Date.UTC(day.y, day.m - 1, day.d))
}

const GOLF_DAY_UTC = { timeZone: 'UTC' }

export function formatGolfDateRange(start, end) {
  const a = golfDay(start)
  const b = golfDay(end)
  if (!a) return ''
  const aDate = golfDayDate(a)
  if (!b) {
    return aDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', ...GOLF_DAY_UTC })
  }
  const bDate = golfDayDate(b)
  if (a.m === b.m && a.y === b.y) {
    const month = aDate.toLocaleDateString(undefined, { month: 'long', ...GOLF_DAY_UTC })
    return `${month} ${a.d} - ${b.d}, ${a.y}`
  }
  return `${aDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...GOLF_DAY_UTC })} - ${bDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...GOLF_DAY_UTC })}`
}

export function formatGolfMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  return `$${Math.round(n).toLocaleString()}`
}

export function formatGolfAmerican(price) {
  const n = Math.round(Number(price))
  if (!Number.isFinite(n) || n === 0) return ''
  return n > 0 ? `+${n}` : String(n)
}

export function golferInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase()
}
