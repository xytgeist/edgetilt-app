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

/** Pre-game: show ATS spread (same shape as feed pills). Live/final: score. */
export function scoreText(side, status) {
  if (status === 'pre') {
    const point = side?.spread
    if (point == null || !Number.isFinite(Number(point))) return '-'
    const n = Number(point)
    if (n === 0) return 'PK'
    const abs = Math.abs(n)
    const body = Number.isInteger(abs) ? String(abs) : String(abs)
    return n > 0 ? `+${body}` : `-${body}`
  }
  if (side?.score == null) return '-'
  return String(side.score)
}

export function liveClockLabel(game, live) {
  if (game.status === 'post') return game.status_label || 'Final'
  if (game.status === 'pre') {
    return formatKickoff(game.commence_time) || stripTimeZoneSuffix(game.status_label) || 'Upcoming'
  }
  const period = live?.period != null ? ordinal(live.period) : ''
  const clock = String(live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  if (clock) return clock
  if (period) return period
  return game.status_label || 'Live'
}

/** Drop trailing zone tokens (PDT, EST, GMT+1, …) from a kickoff label. */
export function stripTimeZoneSuffix(label) {
  const s = String(label || '').trim()
  if (!s) return ''
  return s
    .replace(/\s+(?:[A-Z]{2,5}|GMT[+-]?\d{0,2}|UTC[+-]?\d{0,2})$/i, '')
    .trim()
}

export function downDistanceLabel(live) {
  if (!live) return ''
  const down = live.down != null ? ordinal(live.down) : ''
  const dist = live.distance != null && Number.isFinite(Number(live.distance)) ? String(live.distance) : ''
  if (down && dist) return `${down} & ${dist}`
  if (down) return down
  return ''
}

/**
 * Big center-field banner for stoppages … TIMEOUT / End of 1st / HALFTIME / End of 3rd / GAME OVER.
 */
export function fieldCenterBanner(game, live) {
  if (!game) return ''
  if (game.status === 'post') return 'GAME OVER'

  const statusName = String(live?.status_name || '').toUpperCase().replace(/\s+/g, '_')
  const detail = String(live?.status_detail || game.status_label || '').trim()
  const detailLower = detail.toLowerCase()
  const clock = String(live?.clock || '').trim()
  const clockLower = clock.toLowerCase()
  const lastPlay = String(live?.last_play || '').toLowerCase()
  const period = Number(live?.period)
  const hay = `${statusName} ${detailLower} ${clockLower}`

  if (
    /STATUS_TIMEOUT|STATUS_TV_TIMEOUT|TIMEOUT/.test(statusName)
    || /\btimeout\b/.test(detailLower)
    || /\btimeout\b/.test(clockLower)
    || /\btimeout\b/.test(lastPlay)
  ) {
    return 'TIMEOUT'
  }

  if (
    /STATUS_HALFTIME|HALFTIME/.test(statusName)
    || /\bhalf\s*time\b|\bhalftime\b|\bht\b/.test(detailLower)
    || /\bhalf\s*time\b|\bhalftime\b/.test(clockLower)
  ) {
    return 'HALFTIME'
  }

  if (/STATUS_FINAL|STATUS_FULL_TIME/.test(statusName) || /\bfinal\b|\bgame over\b/.test(detailLower)) {
    return 'GAME OVER'
  }

  if (/STATUS_END_PERIOD|END_PERIOD|END_OF_PERIOD/.test(statusName) || /end of\b/.test(detailLower)) {
    if (/1st|first|\bq1\b/.test(detailLower) || period === 1) return 'End of 1st'
    if (/3rd|third|\bq3\b/.test(detailLower) || period === 3) return 'End of 3rd'
    if (/2nd|second|\bq2\b/.test(detailLower) || period === 2) return 'HALFTIME'
    if (/4th|fourth|\bq4\b/.test(detailLower) || period === 4) return 'GAME OVER'
    if (Number.isFinite(period) && period >= 1) {
      if (period === 1) return 'End of 1st'
      if (period === 2) return 'HALFTIME'
      if (period === 3) return 'End of 3rd'
      return 'GAME OVER'
    }
  }

  // Clock at :00 with a known quarter often means the period just ended.
  if (/^(?:0:00|00:00|0\.00)$/.test(clock) && Number.isFinite(period) && period >= 1) {
    if (period === 1) return 'End of 1st'
    if (period === 2) return 'HALFTIME'
    if (period === 3) return 'End of 3rd'
    if (period >= 4) return 'GAME OVER'
  }

  // Detail-only phrases without STATUS_* keys (Rundown).
  if (/end of\s*(the\s*)?(1st|first)/i.test(hay)) return 'End of 1st'
  if (/end of\s*(the\s*)?(3rd|third)/i.test(hay)) return 'End of 3rd'

  return ''
}

/**
 * Field position label … "IU 35" / "NU 37" / "50".
 * Territory is whose half the ball is on (not who has possession).
 * Yard number is always 1–50 (bare "50" at midfield).
 */
export function yardLineLabel(game, live) {
  const normalized = normalizeYardTerritory(live)
  if (!normalized) return ''
  if (normalized.midfield) return '50'
  if (!normalized.side) return String(normalized.yard)
  const abbrev =
    normalized.side === 'home'
      ? String(game?.home?.abbrev || '').trim()
      : String(game?.away?.abbrev || '').trim()
  if (!abbrev) return String(normalized.yard)
  return `${abbrev} ${normalized.yard}`
}

/** Map live yard fields onto 0–100 field percent (away endzone left → home right). */
export function fieldPercent(live) {
  const normalized = normalizeYardTerritory(live)
  if (!normalized) {
    if (live?.possession === 'home') return 62
    if (live?.possession === 'away') return 38
    return null
  }
  if (normalized.midfield) return 50
  const pos = normalized.side === 'home' ? 100 - normalized.yard : normalized.yard
  return Math.max(6, Math.min(94, pos))
}

/**
 * Resolve territory + 1–50 yard line.
 * Prefers explicit `yard_side`. Values above 50 are treated as ESPN absolute
 * (0 = home endzone, 100 = away endzone) … scoreboard should already fold
 * yards-to-endzone into 1–50 + side before the client sees them.
 */
export function normalizeYardTerritory(live) {
  if (!live) return null
  let yard = live.yard_line == null ? null : Math.round(Number(live.yard_line))
  if (yard != null && !Number.isFinite(yard)) yard = null
  if (yard == null) return null

  const side = live.yard_side === 'home' || live.yard_side === 'away' ? live.yard_side : null

  if (yard === 50) return { midfield: true, side: null, yard: 50 }

  if (side) {
    const n = yard > 50 ? 100 - yard : yard
    return { midfield: false, side, yard: Math.max(1, Math.min(50, n)) }
  }

  // Safety net for raw ESPN absolute (e.g. 99 → away 1).
  if (yard > 50 && yard <= 100) {
    return { midfield: false, side: 'away', yard: Math.max(1, 100 - yard) }
  }
  if (yard >= 0 && yard < 50 && live.espn_absolute === true) {
    return { midfield: false, side: 'home', yard: Math.max(1, yard) }
  }

  if (yard >= 1 && yard <= 50) return { midfield: false, side: null, yard }
  return null
}

export function formatKickoff(commenceTime) {
  if (!commenceTime) return ''
  const d = new Date(commenceTime)
  if (Number.isNaN(d.getTime())) return ''
  // Local wall time … no timeZoneName (PDT/EST) so it reads as the viewer's clock.
  return d.toLocaleString(undefined, {
    weekday: 'short',
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
