export function formatPostAge(createdAt) {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function periodLabel(sportKey, index, total) {
  const sk = String(sportKey || '')
  if (sk.includes('baseball')) return String(index + 1)
  if (sk.includes('hockey')) return index < 3 ? `${index + 1}` : 'OT'
  if (index >= 4) return 'OT'
  if (total <= 2) return index === 0 ? 'H1' : 'H2'
  return String(index + 1)
}

export function ordinal(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  const abs = Math.trunc(v)
  if (abs === 1) return '1st'
  if (abs === 2) return '2nd'
  if (abs === 3) return '3rd'
  return `${abs}th`
}

export function american(price) {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) === 0) return '-'
  const n = Number(price)
  return n > 0 ? `+${n}` : String(n)
}

export function signedPoint(point) {
  if (point == null || !Number.isFinite(Number(point))) return '-'
  const n = Number(point)
  if (n > 0) return `+${n}`
  return String(n)
}

export function scoreText(side, status) {
  if (status === 'pre' || side?.score == null) return '-'
  return String(side.score)
}

export function liveClockLabel(game, live) {
  if (game.status === 'post') return game.status_label || 'Final'
  if (game.status === 'pre') return game.status_label || 'Upcoming'
  const period = live?.period != null ? ordinal(live.period) : ''
  const clock = String(live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  if (clock) return clock
  if (period) return period
  return game.status_label || 'Live'
}

export function downDistanceLabel(live) {
  if (!live) return ''
  const down = live.down != null ? ordinal(live.down) : ''
  const dist = live.distance != null && Number.isFinite(Number(live.distance)) ? String(live.distance) : ''
  if (down && dist) return `${down} & ${dist}`
  if (down) return down
  return ''
}

export function yardLineLabel(game, live) {
  if (live?.yard_line == null) return ''
  const yard = Math.round(Number(live.yard_line))
  if (!Number.isFinite(yard)) return ''
  const side =
    live.yard_side === 'home'
      ? game.home?.abbrev
      : live.yard_side === 'away'
        ? game.away?.abbrev
        : live.possession === 'home'
          ? game.home?.abbrev
          : live.possession === 'away'
            ? game.away?.abbrev
            : ''
  return side ? `${side} ${yard}` : String(yard)
}

export function fieldPercent(live) {
  const yard = Number(live?.yard_line)
  if (!Number.isFinite(yard)) {
    if (live?.possession === 'home') return 62
    if (live?.possession === 'away') return 38
    return null
  }
  let pos = yard
  if (live.yard_side === 'home') pos = 100 - yard
  else if (live.yard_side === 'away') pos = yard
  else if (live.possession === 'home') pos = 100 - yard
  return Math.max(6, Math.min(94, pos))
}

export function formatKickoff(commenceTime) {
  if (!commenceTime) return ''
  const d = new Date(commenceTime)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function kalshiCents(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value) * 100)}¢`
}

/** Compact contract counts for Kalshi volume / OI / book size. */
export function kalshiContracts(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Math.round(Number(value))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
