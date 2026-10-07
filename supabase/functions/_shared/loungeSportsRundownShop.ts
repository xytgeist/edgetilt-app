/**
 * TheRundown sharp-shop books Odds API does not carry (or carries poorly).
 * Scores-only slates stay on `affiliate_ids=0`. This fetch is `main_line` ML/spread/total
 * for a short affiliate list, cached on the same 90s / 40s cadence as Odds lines.
 */
import type { RundownEvent, RundownTeam } from './loungeBotRundownContext.ts'
import {
  isRundownEnabled,
  oddsSportKeyToRundownSportId,
  rundownApiKey,
} from './loungeBotRundownContext.ts'

const RUNDOWN_BASE = 'https://therundown.io/api/v2'
const PT_OFFSET_MIN = 420

/** Books Odds `us`/`us2` do not list (plus Matchbook / Everygame). */
export const RUNDOWN_SHOP_BOOKS = [
  { id: 32, name: 'Circa Sports' },
  { id: 34, name: 'Heritage Sports' },
  { id: 33, name: 'Bet105' },
  { id: 7, name: 'BookMaker' },
  { id: 4, name: 'Sportsbetting.ag' },
  { id: 9, name: 'Betcris' },
  { id: 18, name: 'YouWager' },
  { id: 16, name: 'Matchbook' },
  { id: 14, name: 'Everygame' },
] as const

const SHOP_AFFILIATE_QUERY = RUNDOWN_SHOP_BOOKS.map((b) => b.id).join(',')
const SHOP_BY_ID = new Map(RUNDOWN_SHOP_BOOKS.map((b) => [String(b.id), b.name]))

export type RundownShopOddsRow = {
  book: string
  home_spread: number | null
  home_spread_price: number | null
  away_spread: number | null
  away_spread_price: number | null
  total: number | null
  over_price: number | null
  under_price: number | null
  home_ml: number | null
  away_ml: number | null
  last_update?: string | null
}

function numOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function usablePrice(value: unknown): number | null {
  const n = numOrNull(value)
  if (n == null || n === 0.0001) return null
  return n
}

function teamLabel(team: RundownTeam | undefined): string {
  return [team?.name, team?.mascot].filter(Boolean).join(' ').trim()
}

export function rundownShopEventSides(ev: RundownEvent): { home: string; away: string } | null {
  const teams = Array.isArray(ev.teams) ? ev.teams : []
  const home = teams.find((t) => t.is_home) || teams[1]
  const away = teams.find((t) => t.is_away) || teams[0]
  const homeName = teamLabel(home)
  const awayName = teamLabel(away)
  if (!homeName || !awayName) return null
  return { home: homeName, away: awayName }
}

function emptyRow(book: string): RundownShopOddsRow {
  return {
    book,
    home_spread: null,
    home_spread_price: null,
    away_spread: null,
    away_spread_price: null,
    total: null,
    over_price: null,
    under_price: null,
    home_ml: null,
    away_ml: null,
    last_update: null,
  }
}

function rowHasQuotes(row: RundownShopOddsRow): boolean {
  return (
    row.home_ml != null
    || row.away_ml != null
    || row.home_spread != null
    || row.total != null
  )
}

function stampUpdate(row: RundownShopOddsRow, at: unknown) {
  const iso = String(at || '').trim()
  if (!iso) return
  if (!row.last_update || Date.parse(iso) > Date.parse(row.last_update)) row.last_update = iso
}

function namesMatch(a: string, b: string): boolean {
  const left = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const right = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function parseV2Markets(ev: RundownEvent, homeName: string, awayName: string): RundownShopOddsRow[] {
  const markets = Array.isArray(ev.markets) ? ev.markets as Array<Record<string, unknown>> : []
  if (!markets.length) return []
  const byId = new Map<string, RundownShopOddsRow>()
  for (const market of markets) {
    const period = Number(market.period_id ?? 0)
    if (Number.isFinite(period) && period !== 0) continue
    const marketId = Number(market.market_id)
    const participants = Array.isArray(market.participants)
      ? market.participants as Array<Record<string, unknown>>
      : []
    for (const part of participants) {
      const partName = String(part.name || '').trim()
      const lines = Array.isArray(part.lines) ? part.lines as Array<Record<string, unknown>> : []
      for (const line of lines) {
        const value = numOrNull(line.value)
        const prices = line.prices && typeof line.prices === 'object'
          ? line.prices as Record<string, Record<string, unknown>>
          : {}
        for (const [affId, priceObj] of Object.entries(prices)) {
          const book = SHOP_BY_ID.get(String(affId))
          if (!book) continue
          const price = usablePrice(priceObj?.price)
          if (price == null) continue
          const row = byId.get(affId) || emptyRow(book)
          if (marketId === 1) {
            if (namesMatch(partName, homeName)) row.home_ml = price
            else if (namesMatch(partName, awayName)) row.away_ml = price
          } else if (marketId === 2 && value != null) {
            if (namesMatch(partName, homeName)) {
              row.home_spread = value
              row.home_spread_price = price
            } else if (namesMatch(partName, awayName)) {
              row.away_spread = value
              row.away_spread_price = price
            }
          } else if (marketId === 3) {
            const hay = partName.toLowerCase()
            if (hay.includes('over')) {
              row.total = value ?? row.total
              row.over_price = price
            } else if (hay.includes('under')) {
              row.total = value ?? row.total
              row.under_price = price
            }
          }
          stampUpdate(row, priceObj?.updated_at)
          byId.set(affId, row)
        }
      }
    }
  }
  return [...byId.values()].filter(rowHasQuotes)
}

function parseLegacyLines(ev: RundownEvent): RundownShopOddsRow[] {
  const lines = ev.lines && typeof ev.lines === 'object' ? ev.lines : null
  if (!lines) return []
  const rows: RundownShopOddsRow[] = []
  for (const [affId, raw] of Object.entries(lines)) {
    const book = SHOP_BY_ID.get(String(affId))
    if (!book || !raw || typeof raw !== 'object') continue
    const pack = raw as Record<string, unknown>
    const ml = (pack.moneyline && typeof pack.moneyline === 'object')
      ? pack.moneyline as Record<string, unknown>
      : pack
    const spread = (pack.spread && typeof pack.spread === 'object')
      ? pack.spread as Record<string, unknown>
      : pack
    const total = (pack.total && typeof pack.total === 'object')
      ? pack.total as Record<string, unknown>
      : pack
    const row = emptyRow(book)
    row.home_ml = usablePrice(ml.moneyline_home ?? ml.home_ml)
    row.away_ml = usablePrice(ml.moneyline_away ?? ml.away_ml)
    row.home_spread = numOrNull(spread.point_spread_home ?? spread.spread_home ?? spread.home)
    row.away_spread = numOrNull(spread.point_spread_away ?? spread.spread_away ?? spread.away)
    row.home_spread_price = usablePrice(spread.point_spread_home_money ?? spread.home_spread_price)
    row.away_spread_price = usablePrice(spread.point_spread_away_money ?? spread.away_spread_price)
    row.total = numOrNull(total.total_over ?? total.total ?? total.over)
    row.over_price = usablePrice(total.total_over_money ?? total.over_price)
    row.under_price = usablePrice(total.total_under_money ?? total.under_price)
    stampUpdate(row, pack.updated_at ?? ml.updated_at)
    if (rowHasQuotes(row)) rows.push(row)
  }
  return rows
}

export function rundownShopRowsFromEvent(ev: RundownEvent): RundownShopOddsRow[] {
  const sides = rundownShopEventSides(ev)
  if (!sides) return parseLegacyLines(ev)
  const v2 = parseV2Markets(ev, sides.home, sides.away)
  return v2.length ? v2 : parseLegacyLines(ev)
}

async function rundownFetch<T>(path: string): Promise<T | null> {
  const key = rundownApiKey()
  if (!key) return null
  try {
    const res = await fetch(`${RUNDOWN_BASE}${path}`, {
      headers: { 'X-TheRundown-Key': key },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

/** One PT date of main-line shop books. Caller caches (90s slate / 40s live hub). */
export async function loadRundownShopDayEvents(sportKey: string, ptDate: string): Promise<RundownEvent[]> {
  const sportId = oddsSportKeyToRundownSportId(sportKey)
  if (!sportId || !isRundownEnabled() || !ptDate) return []
  const data = await rundownFetch<{ events?: RundownEvent[] }>(
    `/sports/${sportId}/events/${encodeURIComponent(ptDate)}?offset=${PT_OFFSET_MIN}&affiliate_ids=${SHOP_AFFILIATE_QUERY}&market_ids=1,2,3&main_line=true`,
  )
  return Array.isArray(data?.events) ? data.events : []
}
