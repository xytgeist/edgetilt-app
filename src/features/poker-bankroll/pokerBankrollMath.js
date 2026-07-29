/** @param {number} totalSeconds */
export function fmtPokerDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
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

/** @param {{ start_at?: string, end_at?: string | null }} session */
export function pokerSessionDurationHours(session) {
  if (!session?.start_at) return 0
  const start = new Date(session.start_at)
  const end = session.end_at ? new Date(session.end_at) : new Date()
  return Math.max(0, (end - start) / 3_600_000)
}

/** @param {{ buy_in?: number | string, cash_out?: number | string | null, bounty_winnings?: number | string | null }} session */
export function pokerSessionWinLoss(session) {
  if (session?.cash_out == null || session.cash_out === '') return null
  const buyIn = Number(session.buy_in) || 0
  const cashOut = Number(session.cash_out) || 0
  const bounties = Number(session.bounty_winnings) || 0
  return cashOut + bounties - buyIn
}

/** @param {object} session */
export function pokerSessionHourly(session) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return null
  const hrs = pokerSessionDurationHours(session)
  return hrs >= 0.02 ? wl / hrs : null
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

/** @param {object} session */
export function pokerSessionBbPerHour(session) {
  const bbWon = pokerSessionBbWon(session)
  if (bbWon == null) return null
  const hrs = pokerSessionDurationHours(session)
  return hrs >= 0.02 ? bbWon / hrs : null
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
