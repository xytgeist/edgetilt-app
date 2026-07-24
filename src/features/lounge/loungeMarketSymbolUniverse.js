import { getLoungeCashtagSymbolSeedRows } from './loungeCashtagSymbolSeed.js'

const RESOLVED_STORAGE_KEY = 'lounge-market-symbol-resolved-v1'
const RESOLVED_MAX_ROWS = 200

const SEED_ROWS = getLoungeCashtagSymbolSeedRows()

/** @type {object[] | null} */
let memoryResolvedRows = null

function readResolvedStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RESOLVED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.rows) ? parsed.rows : []
  } catch {
    return []
  }
}

function writeResolvedStorage(rows) {
  if (typeof window === 'undefined' || !rows.length) return
  try {
    window.localStorage.setItem(RESOLVED_STORAGE_KEY, JSON.stringify({ rows }))
  } catch {
    // quota / private mode
  }
}

function mergeRows(baseRows, incomingRows) {
  const byKey = new Map()
  for (const row of baseRows) {
    const key = `${row?.asset_class || ''}:${row?.symbol || ''}`.toLowerCase()
    if (key !== ':') byKey.set(key, row)
  }
  for (const row of incomingRows) {
    const key = `${row?.asset_class || ''}:${row?.symbol || ''}`.toLowerCase()
    if (key !== ':') byKey.set(key, row)
  }
  return [...byKey.values()].slice(-RESOLVED_MAX_ROWS)
}

/** Instant bundled rows (crypto + popular US tickers) — no network. */
export function getLoungeCashtagSymbolSeedUniverse() {
  return { rows: SEED_ROWS, full: false }
}

/** Seed + any previously resolved symbols from localStorage (incremental, capped). */
export function getLoungeCashtagSymbolUniverse() {
  const resolved = memoryResolvedRows ?? readResolvedStorage()
  const rows = mergeRows(SEED_ROWS, resolved)
  return { rows, full: rows.length > SEED_ROWS.length }
}

/** Merge resolve_symbol hits into local seed extension (no full-universe download). */
export function mergeLoungeMarketSymbolUniverseRows(newRows) {
  const incoming = Array.isArray(newRows) ? newRows : []
  if (!incoming.length) return getLoungeCashtagSymbolUniverse()

  const resolved = mergeRows(memoryResolvedRows ?? readResolvedStorage(), incoming)
  memoryResolvedRows = resolved
  writeResolvedStorage(resolved)
  return getLoungeCashtagSymbolUniverse()
}

/** Hydrate resolved rows from localStorage once per session. */
export function hydrateLoungeCashtagResolvedSymbols() {
  if (memoryResolvedRows) return getLoungeCashtagSymbolUniverse()
  memoryResolvedRows = readResolvedStorage()
  return getLoungeCashtagSymbolUniverse()
}
