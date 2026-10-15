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

/** Composer / draft string … always keep `+` on positive American odds. */
export function americanOddsInputString(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o) || o === 0) return ''
  const n = Math.round(o)
  return n > 0 ? `+${n}` : `${n}`
}

/** Implied probability 0-1 (Kalshi/Poly cents) → American odds. */
export function americanFromImplied(prob) {
  const p = Number(prob)
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null
  if (p >= 0.5) return Math.round(-100 * p / (1 - p))
  return Math.round(100 * (1 - p) / p)
}

/**
 * Stake + payout (includes stake) → American odds.
 * FanDuel settled slips often omit ticket odds but show TOTAL WAGER + WON.
 */
export function americanFromStakeAndPayout(stake, payoutInclusive) {
  const s = Number(stake)
  const p = Number(payoutInclusive)
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null
  const profit = p - s
  if (Math.abs(profit) < 1e-9) return null
  if (profit > 0) return Math.round((profit / s) * 100)
  // Favorite: stake returns less profit than even money
  return Math.round(-100 * s / profit)
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

/** Strip rotation / summary / odds junk to a short pick name. */
export function pickSeedFromLabel(selectionLabel) {
  let raw = String(selectionLabel || '').trim()
  if (!raw) return ''
  if (raw.includes(' · ')) raw = raw.split(' · ')[0].trim()
  raw = raw.replace(/\s+ML\b/i, '').trim()
  raw = raw.replace(/\s+[+-]\d{2,5}\s*$/i, '').trim()
  raw = raw.replace(/^\[\d+\]\s*/, '').replace(/^\d{2,5}\s+/, '')
  raw = raw.replace(/\bMLB\b/gi, '').replace(/\s{2,}/g, ' ').trim()
  return raw
}

function formatStakePart(draft) {
  const dollars = Number(draft?.stake_dollars)
  if (Number.isFinite(dollars) && dollars > 0) {
    const rounded = Number.isInteger(dollars) ? dollars : Number(dollars.toFixed(2))
    return `$${rounded.toLocaleString('en-US')}`
  }
  const units = Number(draft?.stake_units)
  if (Number.isFinite(units) && units > 0) return `${units}u`
  return ''
}

function formatCommenceShort(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`
}

function buildPickHead(draft) {
  const market = String(draft?.market || 'spread')
  const side = String(draft?.side || '')
  const home = String(draft?.home_team || '').trim()
  const away = String(draft?.away_team || '').trim()
  const ln = formatLine(draft?.line, market)
  let seed = pickSeedFromLabel(draft?.selection_label)
  if (/\s@\s|\svs\s/i.test(seed)) seed = ''

  if (market === 'prop') {
    const player = String(draft?.player_name || seed || '').trim()
    const ou = side === 'under' ? 'Under' : 'Over'
    const stat = String(draft?.prop_stat || '').trim()
    return [player, ou, ln, stat].filter(Boolean).join(' ') || 'Player prop'
  }
  if (market === 'total') {
    const ou = side === 'under' ? 'Under' : 'Over'
    // Keep "Rounds" / "Knockdowns" / "by KO" from the parse seed when present
    if (seed && /\b(over|under)\b/i.test(seed)) {
      const rest = seed.replace(/^\s*(over|under)\s*/i, '').trim()
      if (rest && !/^[+-]?\d+(?:\.\d+)?\s*$/.test(rest)) {
        return `${ou} ${rest}`.replace(/\s{2,}/g, ' ').trim()
      }
    }
    return `${ou} ${ln || ''}`.trim()
  }
  if (market === 'spread') {
    const team = side === 'home' ? (home || seed) : side === 'away' ? (away || seed) : (seed || away || home)
    return `${team || 'Spread'} ${ln}`.trim()
  }
  if (market === 'h2h') {
    let team = seed
    if (!team) {
      if (side === 'home') team = home
      else if (side === 'away') team = away
      else team = away || home
    }
    if (side === 'draw') return 'Draw ML'
    return team ? `${team} ML` : 'ML'
  }
  if (market === 'parlay') {
    const legs = draft?.legs || draft?.sports_bet_legs
    const n = Array.isArray(legs) ? legs.length : 0
    if (seed && /^parlay\b/i.test(seed)) return seed
    return n ? `Parlay (${n} leg${n === 1 ? '' : 's'})` : 'Parlay'
  }
  return seed || [away, home].filter(Boolean).join(' @ ') || 'Bet'
}

/**
 * Soften older stored labels that used a middot between pick and odds
 * ("49ers ML · +120 · $…" → "49ers ML +120 · $…").
 */
export function softenBetSummaryOddsSeparator(label) {
  const s = String(label || '').trim()
  if (!s) return ''
  return s
    .replace(/^(.+?)\s·\s([+-]\d{2,})\s·\s/, '$1 $2 · ')
    .replace(/^(.+?)\s·\s([+-]\d{2,})$/, '$1 $2')
}

/**
 * Card / Label summary … e.g. "49ers ML +120 · $500,000 · 2/2/2020"
 * (space between pick and odds; middot before stake/date).
 */
export function buildBetSummaryLabel(draft) {
  const head = buildPickHead(draft)
  const oddsPart = formatAmericanOdds(draft?.odds)
  const oddsOk = oddsPart && oddsPart !== '—'
  const pick = oddsOk ? `${head} ${oddsPart}`.trim() : head
  const stakePart = formatStakePart(draft)
  const datePart = formatCommenceShort(draft?.commence_time)
  return [pick, stakePart, datePart].filter(Boolean).join(' · ')
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
  legs,
  odds,
  stakeDollars,
  stakeUnits,
  commenceTime,
}) {
  // Prefer the rich summary when we have odds/stake/date context (slip + save path).
  const summary = buildBetSummaryLabel({
    market,
    side,
    home_team: homeTeam,
    away_team: awayTeam,
    line,
    selection_label: selectionLabel,
    player_name: playerName,
    prop_stat: propStat,
    legs,
    odds,
    stake_dollars: stakeDollars,
    stake_units: stakeUnits,
    commence_time: commenceTime,
  })
  if (odds != null && String(odds).trim() !== '') return summary

  const custom = pickSeedFromLabel(selectionLabel) || String(selectionLabel || '').trim()
  const m = String(market || 'spread')
  if (m === 'parlay') {
    if (custom && /^parlay\b/i.test(custom)) return custom
    const n = Array.isArray(legs) ? legs.length : 0
    return n ? `Parlay (${n} leg${n === 1 ? '' : 's'})` : 'Parlay'
  }
  if (m === 'prop') {
    const player = String(playerName || custom || '').trim()
    const ou = side === 'under' ? 'Under' : 'Over'
    const ln = formatLine(line, 'prop')
    const stat = String(propStat || '').trim()
    const built = [player, ou, ln, stat].filter(Boolean).join(' ')
    return built || custom || 'Player prop'
  }
  if (custom && !/^\d{2,5}\s+/.test(String(selectionLabel || '').trim())) return custom
  const home = String(homeTeam || 'Home').trim()
  const away = String(awayTeam || 'Away').trim()
  const ln = formatLine(line, m)
  if (m === 'h2h') {
    if (side === 'home') return home
    if (side === 'away') return away
    if (side === 'draw') return 'Draw'
    return custom || 'Moneyline'
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
