/**
 * Market-implied NBA per-game stat lines from Kalshi player strike ladders (`Dylan Harper: 20+ points`), the NBA
 * twin of `fantasyMarketProjections.ts` (NFL, sportsbooks). One open-markets read per series covers every open game.
 * Each covered stat becomes the market's expected value for the player's next game; the app fills the rest from
 * Sleeper's projection and falls back to the baseline when the blend lands too far from it (`fantasyProjection.js`).
 *
 * Price = the bid / ask midpoint, used only when the spread is at most MAX_SPREAD and the price is informative.
 * Points: a normal fit of strike against z across the ladder (one strike: SD 30% of the mean).
 * Rebounds / assists / threes / steals / blocks: the Poisson mean matching each strike, weighted toward strikes
 * priced near 50% with tight spreads. Double / triple double: the Yes price as the expected count.
 * Shared cache 10 min; empty during Kalshi maintenance or when nothing is posted.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { nbaTeam } from './fantasyNbaBoard.ts'

const KALSHI = 'https://external-api.kalshi.com/trade-api/v2'
const SERIES: Record<string, string> = {
  KXNBAPTS: 'pts',
  KXNBAREB: 'reb',
  KXNBAAST: 'ast',
  KXNBA3PT: 'tpm',
  KXNBASTL: 'stl',
  KXNBABLK: 'blk',
  KXNBA2D: 'dd',
  KXNBA3D: 'td',
}
const MAX_SPREAD = 0.25
const MIN_P = 0.03
const MAX_P = 0.97
const PTS_SD_SHARE = 0.3

export type NbaMarketLine = Record<string, number>

type Strike = { strike: number; p: number; spread: number }

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Inverse standard normal CDF (Acklam). */
function probit(p: number): number {
  const q = Math.min(0.999, Math.max(0.001, p))
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  if (q < 0.02425) {
    const t = Math.sqrt(-2 * Math.log(q))
    return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
  }
  if (q > 1 - 0.02425) return -probit(1 - q)
  const t = q - 0.5
  const r = t * t
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

function poissonAtLeast(lambda: number, k: number): number {
  let term = Math.exp(-lambda)
  let below = term
  for (let i = 1; i < k; i++) {
    term *= lambda / i
    below += term
  }
  return 1 - below
}

/** Poisson mean with P(X > strike) = p (strike is x.5). */
function poissonMean(strike: number, p: number): number {
  const k = Math.floor(strike) + 1
  let lo = 0.001
  let hi = Math.max(4, strike * 4 + 4)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (poissonAtLeast(mid, k) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Weight: tight spreads and prices near 50% say the most about the mean. */
const weight = (s: Strike) => (s.p * (1 - s.p)) / (s.spread + 0.02)

/** Expected per-game value for one stat from its ladder, or null when nothing usable is posted. */
export function ladderMean(stat: string, ladder: Strike[]): number | null {
  const usable = ladder.filter((s) => s.spread <= MAX_SPREAD && s.p >= MIN_P && s.p <= MAX_P)
  if (!usable.length) return null
  if (stat === 'dd' || stat === 'td') return usable[0].p
  if (stat === 'pts') {
    if (usable.length === 1) {
      const z = probit(usable[0].p)
      return Math.max(0, usable[0].strike / (1 - PTS_SD_SHARE * z))
    }
    // Weighted least squares: strike = mean - sd * z (z = probit of P(over)), so the intercept at z = 0 is the median.
    let sw = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (const s of usable) {
      const w = weight(s)
      const x = probit(s.p)
      sw += w
      sx += w * x
      sy += w * s.strike
      sxx += w * x * x
      sxy += w * x * s.strike
    }
    const den = sw * sxx - sx * sx
    const slope = den > 0 ? (sw * sxy - sx * sy) / den : 0
    if (!(slope < 0)) return null
    return Math.max(0, (sy - slope * sx) / sw)
  }
  let sw = 0
  let sm = 0
  for (const s of usable) {
    const w = weight(s)
    sw += w
    sm += w * poissonMean(s.strike, s.p)
  }
  return sw > 0 ? sm / sw : null
}

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }

/** `KXNBAPTS-26OCT23HOUSAS` → `2026-10-23` (US Eastern game date). */
function eventDate(eventTicker: string): string {
  const m = String(eventTicker || '').match(/-(\d{2})([A-Z]{3})(\d{2})/)
  return m && MONTHS[m[2]] ? `20${m[1]}-${MONTHS[m[2]]}-${m[3]}` : ''
}

async function seriesMarkets(series: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = []
  let cursor = ''
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({ series_ticker: series, status: 'open', limit: '1000' })
    if (cursor) q.set('cursor', cursor)
    const res = await fetch(`${KALSHI}/markets?${q}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`Kalshi ${series} ${res.status}`)
    const body = (await res.json()) as { markets?: Array<Record<string, unknown>>; cursor?: string }
    out.push(...(body.markets || []))
    cursor = String(body.cursor || '')
    if (!cursor || !(body.markets || []).length) break
  }
  return out
}

/** `nameKey|TEAM` → { date, line } for each player's earliest open game. */
async function fetchNbaMarketLines(): Promise<Record<string, { date: string; line: NbaMarketLine }>> {
  const ladders = new Map<string, { date: string; stat: string; strikes: Strike[] }>()
  await Promise.all(
    Object.entries(SERIES).map(async ([series, stat]) => {
      for (const m of await seriesMarkets(series).catch(() => [])) {
        const title = String(m.title || '')
        const name = title.split(':')[0]?.trim()
        // Ticker `KXNBAPTS-26OCT23HOUSAS-SASDHARPER2-25`: the third part starts with the player's team code.
        const team = nbaTeam(String(m.ticker || '').split('-')[2]?.slice(0, 3) || '')
        const date = eventDate(String(m.event_ticker || ''))
        const strike = num(m.floor_strike)
        const bid = num(m.yes_bid_dollars)
        const ask = num(m.yes_ask_dollars)
        if (!name || !team || !date || strike == null || bid == null || ask == null || ask <= 0) continue
        const key = `${nameKey(name)}|${team}|${stat}|${date}`
        const entry = ladders.get(key) || { date, stat, strikes: [] }
        entry.strikes.push({ strike, p: (bid + ask) / 2, spread: ask - bid })
        ladders.set(key, entry)
      }
    }),
  )
  const out: Record<string, { date: string; line: NbaMarketLine }> = {}
  for (const [key, { date, stat, strikes }] of ladders) {
    const mean = ladderMean(stat, strikes)
    if (mean == null) continue
    const player = key.split('|').slice(0, 2).join('|')
    const cur = out[player]
    if (cur && cur.date < date) continue
    if (!cur || cur.date > date) out[player] = { date, line: {} }
    out[player].line[stat] = Math.round(mean * 100) / 100
  }
  return out
}

export function loadNbaMarketLines(admin?: SupabaseClient): Promise<Record<string, { date: string; line: NbaMarketLine }>> {
  return sharedCached(
    'fantasy:nba-market-lines:v1',
    { ttlMs: 10 * 60_000, staleMaxMs: 60 * 60_000, leaseMs: 30_000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    fetchNbaMarketLines,
  ).catch(() => ({}))
}

/** Market line for one player's next game (`date` = his next tip's ET date), or null. */
export function nbaMarketLineFor(
  lines: Record<string, { date: string; line: NbaMarketLine }>,
  name: string,
  team: string | null | undefined,
  date: string | null,
): NbaMarketLine | null {
  const hit = lines[`${nameKey(name)}|${nbaTeam(team || '')}`]
  if (!hit || (date && hit.date !== date)) return null
  return Object.keys(hit.line).length ? hit.line : null
}
