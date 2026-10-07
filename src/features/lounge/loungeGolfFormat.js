export function formatGolfToPar(score) {
  if (score == null || !Number.isFinite(Number(score))) return '—'
  const n = Number(score)
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}

export function formatGolfDateRange(start, end) {
  const a = start ? new Date(start) : null
  const b = end ? new Date(end) : null
  if (!a || Number.isNaN(a.getTime())) return ''
  const month = a.toLocaleDateString(undefined, { month: 'long' })
  const day = a.getDate()
  const year = a.getFullYear()
  if (!b || Number.isNaN(b.getTime())) return `${month} ${day}, ${year}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${month} ${day} - ${b.getDate()}, ${year}`
  }
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric, year' })}`
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
