/** Betting-calc math for Bet Tracker Tools. American is the stored format. */

import { americanFromImplied, americanProfitMultiple, formatAmericanOdds } from './sportsBetMath.js'

export { americanFromImplied, americanProfitMultiple, formatAmericanOdds }

export function parseAmerican(value) {
  const raw = String(value ?? '').trim().replace(/,/g, '')
  if (!raw || raw === '+' || raw === '-') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return null
  return n
}

export function americanToDecimal(odds) {
  const a = parseAmerican(odds)
  if (a == null) return null
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a)
}

export function decimalToAmerican(decimal) {
  const d = Number(decimal)
  if (!Number.isFinite(d) || d <= 1) return null
  if (d >= 2) return Math.round((d - 1) * 100)
  return Math.round(-100 / (d - 1))
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

export function americanToFractional(odds) {
  const a = parseAmerican(odds)
  if (a == null) return null
  const num = a > 0 ? a : 100
  const den = a > 0 ? 100 : Math.abs(a)
  const g = gcd(num, den)
  return `${num / g}/${den / g}`
}

export function fractionalToAmerican(value) {
  const raw = String(value ?? '').trim()
  const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const num = Number(m[1])
  const den = Number(m[2])
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num <= 0) return null
  return decimalToAmerican(1 + num / den)
}

export function impliedFromAmerican(odds) {
  const a = parseAmerican(odds)
  if (a == null) return null
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100)
}

/** Detect +150 / 2.50 / 3/2 and return American. */
export function parseAnyOdds(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.includes('/')) return fractionalToAmerican(raw)
  if (raw.startsWith('+') || raw.startsWith('-')) return parseAmerican(raw)
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n) || n === 0) return null
  if (n > 1 && n < 50 && !Number.isInteger(n)) return decimalToAmerican(n)
  if (n > 1 && n < 20 && String(raw).includes('.')) return decimalToAmerican(n)
  return parseAmerican(n)
}

export function payoutFromStake(stake, odds) {
  const s = Number(stake)
  const mult = americanProfitMultiple(odds)
  if (!Number.isFinite(s) || s <= 0 || mult == null) return null
  const profit = s * mult
  return { stake: s, profit, payout: s + profit, decimal: americanToDecimal(odds), american: parseAmerican(odds) }
}

export function noVigTwoWay(oddsA, oddsB) {
  const a = impliedFromAmerican(oddsA)
  const b = impliedFromAmerican(oddsB)
  if (a == null || b == null || a + b <= 0) return null
  const overround = a + b
  const fairA = a / overround
  const fairB = b / overround
  return {
    impliedA: a,
    impliedB: b,
    overround,
    vigPct: (overround - 1) * 100,
    fairA,
    fairB,
    fairAmericanA: americanFromImplied(fairA),
    fairAmericanB: americanFromImplied(fairB),
  }
}

export function evFromTrueProb(odds, winProb) {
  const p = Number(winProb)
  const dec = americanToDecimal(odds)
  if (!Number.isFinite(p) || p <= 0 || p >= 1 || dec == null) return null
  const ev = p * dec - 1
  return {
    ev,
    evPct: ev * 100,
    implied: impliedFromAmerican(odds),
    decimal: dec,
  }
}

/** Full Kelly fraction of bankroll. Negative = no bet. */
export function kellyFraction(odds, winProb) {
  const p = Number(winProb)
  const b = americanProfitMultiple(odds)
  if (!Number.isFinite(p) || p <= 0 || p >= 1 || b == null || b <= 0) return null
  const q = 1 - p
  return (b * p - q) / b
}

export function kellyStake(bankroll, odds, winProb, fraction = 0.5) {
  const f = kellyFraction(odds, winProb)
  const br = Number(bankroll)
  const frac = Number(fraction)
  if (f == null || !Number.isFinite(br) || br <= 0 || !Number.isFinite(frac) || frac <= 0) return null
  const used = Math.max(0, f) * frac
  return {
    fullFraction: f,
    usedFraction: used,
    stake: br * used,
    noBet: f <= 0,
  }
}

/**
 * Hedge to lock the same P&L either way.
 * `hedgeStake = openToWin / hedgeDecimal` … openToWin is stake * openDecimal.
 */
export function hedgeToLock(openStake, openOdds, hedgeOdds) {
  const stake = Number(openStake)
  const openDec = americanToDecimal(openOdds)
  const hedgeDec = americanToDecimal(hedgeOdds)
  if (!Number.isFinite(stake) || stake <= 0 || openDec == null || hedgeDec == null) return null
  const hedgeStake = (stake * openDec) / hedgeDec
  const ifOpenWins = stake * (openDec - 1) - hedgeStake
  const ifHedgeWins = hedgeStake * (hedgeDec - 1) - stake
  return {
    hedgeStake,
    lockedProfit: ifOpenWins,
    ifOpenWins,
    ifHedgeWins,
  }
}

export function parlayFromOdds(oddsList) {
  const decimals = (Array.isArray(oddsList) ? oddsList : [])
    .map((o) => americanToDecimal(o))
    .filter((d) => d != null && d > 1)
  if (!decimals.length) return null
  const combined = decimals.reduce((acc, d) => acc * d, 1)
  return {
    legs: decimals.length,
    decimal: combined,
    american: decimalToAmerican(combined),
    profitMultiple: combined - 1,
  }
}

export function arbTwoWay(oddsA, oddsB, bank = 100) {
  const decA = americanToDecimal(oddsA)
  const decB = americanToDecimal(oddsB)
  const total = Number(bank)
  if (decA == null || decB == null || !Number.isFinite(total) || total <= 0) return null
  const inv = 1 / decA + 1 / decB
  const stakeA = total * (1 / decA) / inv
  const stakeB = total * (1 / decB) / inv
  const payoutA = stakeA * decA
  const payoutB = stakeB * decB
  const profit = Math.min(payoutA, payoutB) - total
  return {
    isArb: inv < 1,
    overround: inv,
    profit,
    profitPct: (profit / total) * 100,
    stakeA,
    stakeB,
    payoutA,
    payoutB,
  }
}

export function formatPct(n, digits = 1) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return `${x.toFixed(digits)}%`
}

export function formatSignedUsd(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  const abs = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(x))
  if (x > 0) return `+${abs}`
  if (x < 0) return `-${abs}`
  return abs
}
