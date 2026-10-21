/**
 * Market-implied NFL stat lines from sportsbook player props (TheRundown, DraftKings + FanDuel main lines).
 * Each covered stat becomes the market's expected value for that player this week; the app fills the rest
 * from Sleeper's projection, scores the blend with the league's rules, and falls back to the baseline when the
 * blend lands too far from it (`fantasyProjection.js`).
 *
 * Yards: the line, shifted by how lopsided the de-vigged over / under is (normal, sd = 45% of the line), then
 * lifted from median to mean (yardage skews right: a few big games pull the average above the line).
 * Receptions / passing TDs / interceptions: the Poisson mean whose P(over) matches the de-vigged price.
 * Anytime TD: -ln(1 - p) expected non-passing TDs, split rush / rec by Sleeper's own projected ratio.
 * Books are averaged. ~3.5k TheRundown datapoints per full-slate pull; shared cache 30m on game days, 2h else.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { isRundownEnabled, ptDateFromIso, rundownRequest } from './loungeBotRundownContext.ts'

const NFL_SPORT_ID = 2
const BOOKS = ['19', '23']
const MARKETS: Record<number, string> = {
  51: 'pass_yd',
  52: 'pass_td',
  960: 'pass_int',
  53: 'rush_yd',
  57: 'rec_yd',
  58: 'rec',
  55: 'td_any',
}
const YARDS = new Set(['pass_yd', 'rush_yd', 'rec_yd'])
const YARDS_SD_SHARE = 0.45
/** Mean / median for yardage. Tune against weekly results (receiving skews most, passing least). */
const YARDS_MEAN_OVER_MEDIAN: Record<string, number> = { pass_yd: 1.02, rush_yd: 1.06, rec_yd: 1.08 }
/** Anytime TD usually lists only "Yes": its price carries the whole hold, so shave a typical one off. */
const YES_ONLY_HOLD = 1.08

export type MarketLine = Record<string, number>

type Price = { price?: number }
type Line = { value?: string; prices?: Record<string, Price> }
type Participant = { type?: string; name?: string; lines?: Line[] }
type Market = { market_id?: number; participants?: Participant[] }
type Event = {
  event_date?: string
  score?: { event_status?: string }
  teams?: Array<{ abbreviation?: string }>
  markets?: Market[]
}

function implied(american: unknown): number | null {
  const a = Number(american)
  if (!Number.isFinite(a) || a === 0) return null
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100)
}

/** Inverse standard normal CDF (Acklam), enough precision for a projection shift. */
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

/** P(X >= k) for Poisson(lambda). */
function poissonAtLeast(lambda: number, k: number): number {
  let term = Math.exp(-lambda)
  let below = term
  for (let i = 1; i < k; i++) {
    term *= lambda / i
    below += term
  }
  return 1 - below
}

/** Poisson mean whose P(X > line) is `pOver` (line is x.5). */
function poissonMean(line: number, pOver: number): number {
  const k = Math.floor(line) + 1
  let lo = 0.001
  let hi = Math.max(4, line * 4 + 4)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (poissonAtLeast(mid, k) < pOver) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function parseSide(value: string): { side: 'over' | 'under' | 'yes' | 'no'; line: number | null } | null {
  const v = value.trim().toLowerCase()
  if (v === 'yes') return { side: 'yes', line: null }
  if (v === 'no') return { side: 'no', line: null }
  const m = v.match(/^(over|under)\s+(-?\d+(?:\.\d+)?)$/)
  return m ? { side: m[1] as 'over' | 'under', line: Number(m[2]) } : null
}

/** One book's expected value for a stat, or null when its prices cannot be read. */
function bookEstimate(stat: string, lines: Line[], book: string): number | null {
  const sides: Record<string, { line: number | null; p: number }> = {}
  for (const row of lines) {
    const parsed = parseSide(String(row.value || ''))
    const p = implied(row.prices?.[book]?.price)
    if (!parsed || p == null) continue
    sides[parsed.side] = { line: parsed.line, p }
  }
  if (stat === 'td_any') {
    const yes = sides.yes?.p
    if (yes == null) return null
    const no = sides.no?.p
    const p = no != null ? yes / (yes + no) : yes / YES_ONLY_HOLD
    return p > 0 && p < 1 ? -Math.log(1 - p) : null
  }
  const over = sides.over
  const under = sides.under
  if (!over || over.line == null) return null
  const pOver = under && under.line === over.line ? over.p / (over.p + under.p) : over.p / 1.045
  if (YARDS.has(stat)) {
    const median = over.line + YARDS_SD_SHARE * over.line * probit(pOver)
    return Math.max(0, median * (YARDS_MEAN_OVER_MEDIAN[stat] || 1))
  }
  return poissonMean(over.line, pOver)
}

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function normTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  if (t === 'LA') return 'LAR'
  if (t === 'LAS') return 'LV'
  return t
}

/** Market stats per (player name key | team) for every scheduled game on these PT dates. */
async function fetchMarketLines(dates: string[]): Promise<Record<string, MarketLine>> {
  const out: Record<string, MarketLine> = {}
  const ids = Object.keys(MARKETS).join(',')
  for (const date of dates) {
    const data = await rundownRequest<{ events?: Event[] }>(
      `/sports/${NFL_SPORT_ID}/events/${encodeURIComponent(date)}?offset=420&market_ids=${ids}&affiliate_ids=${BOOKS.join(',')}&main_line=true`,
      { timeoutMs: 15_000 },
    )
    for (const ev of data?.events || []) {
      if (String(ev.score?.event_status || 'STATUS_SCHEDULED') !== 'STATUS_SCHEDULED') continue
      const teams = (ev.teams || []).map((t) => normTeam(t.abbreviation)).filter(Boolean)
      for (const market of ev.markets || []) {
        const stat = MARKETS[Number(market.market_id)]
        if (!stat) continue
        for (const part of market.participants || []) {
          if (part.type !== 'TYPE_PLAYER' || !part.name) continue
          const estimates = BOOKS.map((b) => bookEstimate(stat, part.lines || [], b)).filter((v): v is number => v != null)
          if (!estimates.length) continue
          const value = Math.round((estimates.reduce((a, v) => a + v, 0) / estimates.length) * 100) / 100
          for (const team of teams) {
            const key = `${nameKey(part.name)}|${team}`
            out[key] = { ...(out[key] || {}), [stat]: value }
          }
        }
      }
    }
  }
  return out
}

function gameDayPt(): boolean {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(new Date())
  return day === 'Thu' || day === 'Sun' || day === 'Mon'
}

/**
 * Market lines for this week's not-yet-started games, keyed `nameKey|TEAM` (both teams of the game, since
 * TheRundown players carry no team). Empty on test (TheRundown is off there) or when nothing is posted.
 */
export function loadMarketLines(
  admin: SupabaseClient,
  season: string,
  week: number,
  kickoffs: Iterable<string>,
): Promise<Record<string, MarketLine>> {
  if (!isRundownEnabled()) return Promise.resolve({})
  const today = ptDateFromIso(new Date().toISOString())
  const dates = [...new Set([...kickoffs].filter(Boolean).map((iso) => ptDateFromIso(iso)))].filter((d) => d >= today).sort()
  if (!dates.length) return Promise.resolve({})
  return sharedCached<Record<string, MarketLine>>(
    `fantasy:market-lines:${season}:${week}:${dates.join(',')}`,
    { ttlMs: gameDayPt() ? 30 * 60_000 : 2 * 60 * 60_000, leaseMs: 60_000, admin, shouldStore: (v) => v != null },
    () => fetchMarketLines(dates),
  )
}

/** Market line for one Sleeper player: anytime TDs split into rush / rec by Sleeper's own projected ratio. */
export function marketLineFor(
  lines: Record<string, MarketLine>,
  name: string,
  team: string,
  pos: string,
  sleeperLine: Record<string, number> | null | undefined,
): MarketLine | null {
  const hit = lines[`${nameKey(name)}|${normTeam(team)}`]
  if (!hit) return null
  const out: MarketLine = {}
  for (const [stat, value] of Object.entries(hit)) {
    if (stat !== 'td_any') out[stat] = value
  }
  if (hit.td_any != null) {
    const rush = Number(sleeperLine?.rush_td) || 0
    const rec = Number(sleeperLine?.rec_td) || 0
    const share = rush + rec > 0 ? rush / (rush + rec) : pos === 'QB' || pos === 'RB' ? 0.8 : 0.02
    out.rush_td = Math.round(hit.td_any * share * 100) / 100
    out.rec_td = Math.round(hit.td_any * (1 - share) * 100) / 100
  }
  return Object.keys(out).length ? out : null
}
