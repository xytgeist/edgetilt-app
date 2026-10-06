/** American odds → decimal multiplier on stake (profit multiple, not including stake). */
export function americanProfitMultiple(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o) || o === 0) return null
  if (o > 0) return o / 100
  return 100 / Math.abs(o)
}

/** Profit in units for a settled bet (won/lost/push/void). Open → null. */
export function profitUnitsForStatus(status, stakeUnits, odds) {
  const stake = Number(stakeUnits)
  if (!Number.isFinite(stake) || stake <= 0) return null
  const s = String(status || '')
  if (s === 'open') return null
  if (s === 'push' || s === 'void') return 0
  if (s === 'lost') return -stake
  if (s === 'won') {
    const mult = americanProfitMultiple(odds)
    if (mult == null) return null
    return stake * mult
  }
  return null
}

export function formatAmericanOdds(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o)) return '—'
  return o > 0 ? `+${o}` : `${o}`
}

/** Implied probability 0-1 (Kalshi/Poly cents) → American odds. */
export function americanFromImplied(prob) {
  const p = Number(prob)
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null
  if (p >= 0.5) return Math.round(-100 * p / (1 - p))
  return Math.round(100 * (1 - p) / p)
}

export function formatLine(line, market) {
  if (line == null || line === '') return ''
  const n = Number(line)
  if (!Number.isFinite(n)) return String(line)
  if (market === 'h2h') return ''
  if (market === 'prop' || market === 'total') return String(n)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}`
}

export function summarizeBets(bets) {
  const list = Array.isArray(bets) ? bets : []
  let won = 0
  let lost = 0
  let push = 0
  let voided = 0
  let open = 0
  let profitUnits = 0
  let settledStake = 0
  let clvBeats = 0
  let clvMisses = 0
  let clvSum = 0
  let clvN = 0

  for (const b of list) {
    const status = String(b.status || 'open')
    if (status === 'open') open += 1
    else if (status === 'won') won += 1
    else if (status === 'lost') lost += 1
    else if (status === 'push') push += 1
    else if (status === 'void') voided += 1

    if (status === 'won' || status === 'lost' || status === 'push') {
      const stake = Number(b.stake_units) || 0
      settledStake += stake
      const p = b.profit_units != null
        ? Number(b.profit_units)
        : profitUnitsForStatus(status, stake, b.odds)
      if (Number.isFinite(p)) profitUnits += p
    }

    if (b.clv_pts != null && Number.isFinite(Number(b.clv_pts))) {
      const c = Number(b.clv_pts)
      clvSum += c
      clvN += 1
      if (c > 0) clvBeats += 1
      else if (c < 0) clvMisses += 1
    }
  }

  const decided = won + lost
  const roiPct = settledStake > 0 ? (profitUnits / settledStake) * 100 : null
  const clvBeatPct = clvBeats + clvMisses > 0
    ? (clvBeats / (clvBeats + clvMisses)) * 100
    : null

  let profitDollars = 0
  let hasDollarPnl = false
  for (const b of list) {
    const pd = profitDollarsForBet(b)
    if (pd == null) continue
    profitDollars += pd
    hasDollarPnl = true
  }

  return {
    won,
    lost,
    push,
    voided,
    open,
    profitUnits,
    profitDollars: hasDollarPnl || profitUnits !== 0 ? profitDollars : 0,
    settledStake,
    roiPct,
    recordLabel: decided + push > 0
      ? `${won}-${lost}${push ? `-${push}` : ''}`
      : '—',
    clvBeatPct,
    clvAvg: clvN ? clvSum / clvN : null,
    clvN,
  }
}

/** Realized $ P&L for a settled bet. Open → null. */
export function profitDollarsForBet(bet, fallbackUnitSize) {
  if (!bet) return null
  const status = String(bet.status || 'open')
  if (status === 'open') return null
  const dollars = Number(bet.stake_dollars)
  const unit = Number(bet.unit_size_dollars)
  const fallback = Number(fallbackUnitSize)
  const units = Number(bet.stake_units)
  const size =
    Number.isFinite(unit) && unit > 0
      ? unit
      : Number.isFinite(fallback) && fallback > 0
        ? fallback
        : null
  const stake =
    Number.isFinite(dollars) && dollars > 0
      ? dollars
      : size != null && Number.isFinite(units) && units > 0
        ? units * size
        : null
  if (stake == null) return null
  return profitUnitsForStatus(status, stake, bet.odds)
}

export function currentSportsBankroll(bankrollStart, bets, fallbackUnitSize) {
  const start = Number(bankrollStart)
  if (!Number.isFinite(start)) return null
  const list = Array.isArray(bets) ? bets : []
  let pnl = 0
  for (const b of list) {
    const pd = profitDollarsForBet(b, fallbackUnitSize)
    if (pd != null) pnl += pd
  }
  return start + pnl
}

export function buildSelectionLabel({
  market,
  side,
  homeTeam,
  awayTeam,
  line,
  selectionLabel,
  playerName,
  propStat,
}) {
  const custom = String(selectionLabel || '').trim()
  const m = String(market || 'spread')
  if (m === 'prop') {
    if (custom && !playerName) return custom
    const player = String(playerName || '').trim()
    const ou = side === 'under' ? 'Under' : 'Over'
    const ln = formatLine(line, 'prop')
    const stat = String(propStat || '').trim()
    const built = [player, ou, ln, stat].filter(Boolean).join(' ')
    return built || custom || 'Player prop'
  }
  if (custom) return custom
  const home = String(homeTeam || 'Home').trim()
  const away = String(awayTeam || 'Away').trim()
  const ln = formatLine(line, m)
  if (m === 'h2h') {
    if (side === 'home') return home
    if (side === 'away') return away
    if (side === 'draw') return 'Draw'
    return 'Moneyline'
  }
  if (m === 'total') {
    if (side === 'over') return `Over ${ln || ''}`.trim()
    if (side === 'under') return `Under ${ln || ''}`.trim()
    return `Total ${ln || ''}`.trim()
  }
  if (m === 'spread') {
    if (side === 'home') return `${home} ${ln}`.trim()
    if (side === 'away') return `${away} ${ln}`.trim()
  }
  return [home, away].filter(Boolean).join(' @ ') || 'Bet'
}
