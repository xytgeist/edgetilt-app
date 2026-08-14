/** @param {number} totalSeconds */
export function fmtPokerDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  // Compact after 1h so the live card clock never grows past ~3h + 2m digits.
  return `${h}h${String(m).padStart(2, '0')}m`
}

/** @param {number | null | undefined} n */
export function fmtPoker$(n) {
  if (n == null || Number.isNaN(Number(n))) return '-'
  const num = Number(n)
  const abs = Math.abs(num)
  const str =
    abs >= 10000
      ? `$${Math.round(abs).toLocaleString()}`
      : abs >= 100
        ? `$${abs.toFixed(0)}`
        : `$${abs.toFixed(2)}`
  return num < 0 ? `-${str}` : str
}

/** @param {number | null | undefined} n @returns {'gain' | 'loss' | 'neutral'} */
export function pokerPlTone(n) {
  if (n == null || Number.isNaN(Number(n)) || Math.abs(Number(n)) < 0.005) return 'neutral'
  return Number(n) > 0 ? 'gain' : 'loss'
}

/** @param {object | null | undefined} session */
export function pokerSessionIsPaused(session) {
  return Boolean(session?.paused_at) && session.status === 'active' && !session.end_at
}

/**
 * Completed pause seconds plus the open pause (if any).
 * @param {object | null | undefined} session
 * @param {number} [nowMs]
 */
export function pokerSessionPausedMs(session, nowMs = Date.now()) {
  const stored = Math.max(0, Number(session?.paused_seconds) || 0) * 1000
  if (!session?.paused_at) return stored
  const pauseStart = new Date(session.paused_at).getTime()
  if (Number.isNaN(pauseStart)) return stored
  const openEnd = session.end_at ? new Date(session.end_at).getTime() : nowMs
  if (Number.isNaN(openEnd)) return stored
  return stored + Math.max(0, openEnd - pauseStart)
}

/**
 * Played seconds (wall clock minus pauses).
 * @param {object | null | undefined} session
 * @param {number} [nowMs]
 */
export function pokerSessionElapsedSeconds(session, nowMs = Date.now()) {
  if (!session?.start_at) return 0
  const start = new Date(session.start_at).getTime()
  if (Number.isNaN(start)) return 0
  const end = session.end_at ? new Date(session.end_at).getTime() : nowMs
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.floor((end - start - pokerSessionPausedMs(session, nowMs)) / 1000))
}

/**
 * Hours played for a session.
 * Active sessions (no end_at) use a live clock minus pauses. Completed
 * tournaments without end_at (e.g. Hendon Mob cashes) assume 8 hours. Other
 * completed rows with no end_at contribute 0 so we never treat "years since
 * 2009" as play time.
 *
 * @param {{
 *   start_at?: string,
 *   end_at?: string | null,
 *   status?: string | null,
 *   session_type?: string | null,
 *   paused_at?: string | null,
 *   paused_seconds?: number | string | null,
 * }} session
 */
export function pokerSessionDurationHours(session) {
  if (!session?.start_at) return 0
  const start = new Date(session.start_at)
  if (Number.isNaN(start.getTime())) return 0
  if (session.end_at || session.status === 'active') {
    return pokerSessionElapsedSeconds(session) / 3600
  }
  // Hendon Mob / cashes-only imports often have no duration column.
  if (session.session_type === 'tournament') return 8
  return 0
}

/**
 * Total invested / “in for” (entry + re-buys + add-ons).
 * @param {{ buy_in?: number | string, rebuy_amount?: number | string | null, addon_amount?: number | string | null }} session
 */
export function pokerSessionTotalCost(session) {
  const buyIn = Number(session?.buy_in) || 0
  const rebuy = Number(session?.rebuy_amount) || 0
  const addon = Number(session?.addon_amount) || 0
  return buyIn + rebuy + addon
}

/** @param {{ buy_in?: number | string, rebuy_amount?: number | string | null, addon_amount?: number | string | null, cash_out?: number | string | null, bounty_winnings?: number | string | null }} session */
export function pokerSessionWinLoss(session) {
  if (session?.cash_out == null || session.cash_out === '') return null
  const invested = pokerSessionTotalCost(session)
  const cashOut = Number(session.cash_out) || 0
  const bounties = Number(session.bounty_winnings) || 0
  return cashOut + bounties - invested
}

/** @param {object} session */
export function pokerSessionHourly(session) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return null
  const hrs = pokerSessionDurationHours(session)
  return hrs >= 0.02 ? wl / hrs : null
}

/**
 * Concurrent tables for hand-rate scaling (online cash multi-tabling).
 * Live / club / tournament always 1.
 * @param {{ session_type?: string | null, venue_kind?: string | null, tables_count?: number | string | null }} session
 */
export function pokerSessionTablesCount(session) {
  if (session?.venue_kind !== 'online' || session?.session_type !== 'cash') return 1
  const n = Math.floor(Number(session.tables_count))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 24)
}

/**
 * Assumed hands/hour for rate metrics.
 * Live 25; online 6-max (and HU) 75; online full-ring 60.
 * Online multi-tabling multiplies by tables_count.
 * @param {{ venue_kind?: string | null, table_size?: string | null, tables_count?: number | string | null }} session
 */
export function pokerSessionHandsPerHour(session) {
  const tables = pokerSessionTablesCount(session)
  if (session?.venue_kind === 'online') {
    const perTable = session.table_size === 'full_ring' ? 60 : 75
    return perTable * tables
  }
  return 25
}

/** @param {object} session */
export function pokerSessionEstimatedHands(session) {
  const hrs = pokerSessionDurationHours(session)
  if (hrs < 0.02) return null
  return hrs * pokerSessionHandsPerHour(session)
}

/**
 * Big blinds won for cash games when blinds are known.
 * @param {object} session
 */
export function pokerSessionBbWon(session) {
  if (session?.session_type !== 'cash') return null
  const bb = Number(session.big_blind)
  if (!Number.isFinite(bb) || bb <= 0) return null
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return null
  return wl / bb
}

/** @param {number | null | undefined} n */
export function fmtPokerBbPerHour(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const num = Number(n)
  const absStr = Math.abs(num).toFixed(2).replace(/\.?0+$/, '')
  return `${num < 0 ? '-' : ''}${absStr} bb/hr`
}

/** @param {object} session */
export function pokerSessionBbPerHour(session) {
  const bbWon = pokerSessionBbWon(session)
  if (bbWon == null) return null
  const hrs = pokerSessionDurationHours(session)
  return hrs >= 0.02 ? bbWon / hrs : null
}

/** @param {object} session */
export function pokerSessionBbPer100(session) {
  const bbWon = pokerSessionBbWon(session)
  const hands = pokerSessionEstimatedHands(session)
  if (bbWon == null || hands == null || hands <= 0) return null
  return (bbWon / hands) * 100
}

/** Profit per 100 hands using assumed hand rates. */
export function pokerSessionDollarsPer100(session) {
  const wl = pokerSessionWinLoss(session)
  const hands = pokerSessionEstimatedHands(session)
  if (wl == null || hands == null || hands <= 0) return null
  return (wl / hands) * 100
}

/** YYYY-MM-DD in device timezone. */
export function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {string} dateYmd @param {string} timeHm */
export function localDateTimeToIso(dateYmd, timeHm) {
  if (!dateYmd || !timeHm) return new Date().toISOString()
  const [y, m, day] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  if ([y, m, day, hh, mm].some((n) => Number.isNaN(n))) return new Date().toISOString()
  return new Date(y, m - 1, day, hh, mm).toISOString()
}

export function formatDurationHoursField(hours) {
  const q = Math.max(0, Math.round(Number(hours) * 4) / 4)
  return Number.isInteger(q) ? String(q) : String(q)
}

export function parseDurationHoursField(raw) {
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}
