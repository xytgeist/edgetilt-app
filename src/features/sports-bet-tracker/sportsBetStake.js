const UNIT_KEY = 'edge.sportsBet.unitSize.v1'
const BANKROLL_KEY = 'edge.sportsBet.bankrollStart.v1'

export const DEFAULT_UNIT_SIZE_DOLLARS = 100
export const DEFAULT_STAKE_UNITS = 1

function readPositive(key, fallback) {
  try {
    const n = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : '')
    if (Number.isFinite(n) && n > 0) return n
  } catch {
    /* ignore */
  }
  return fallback
}

function writeNumber(key, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return
  try {
    localStorage.setItem(key, String(n))
  } catch {
    /* ignore */
  }
}

export function readUnitSizeDollars() {
  return readPositive(UNIT_KEY, DEFAULT_UNIT_SIZE_DOLLARS)
}

export function writeUnitSizeDollars(dollars) {
  const n = Number(dollars)
  if (!Number.isFinite(n) || n <= 0) return
  writeNumber(UNIT_KEY, n)
}

export function readBankrollStart() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BANKROLL_KEY) : null
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeBankrollStart(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return
  writeNumber(BANKROLL_KEY, n)
}

/** Stake units on a new log. Hold-to-log always starts at 1u. */
export function readLastStakeUnits() {
  return DEFAULT_STAKE_UNITS
}

export function writeLastStakeUnits() {
  /* Stake defaults to 1u; unit size is the setting that sticks. */
}

export function roundMoney(n, digits = 2) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  const p = 10 ** digits
  return Math.round(x * p) / p
}

export function formatUsd(n, { empty = '—' } = {}) {
  const x = Number(n)
  if (!Number.isFinite(x)) return empty
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(x)
}

export function stakeDollarsFromUnits(units, unitSize) {
  const u = Number(units)
  const size = Number(unitSize)
  if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(size) || size <= 0) return ''
  const n = roundMoney(u * size)
  return n == null ? '' : String(n)
}

export function stakeUnitsFromDollars(dollars, unitSize) {
  const d = Number(dollars)
  const size = Number(unitSize)
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(size) || size <= 0) return ''
  const n = roundMoney(d / size, 4)
  return n == null ? '' : String(n)
}
