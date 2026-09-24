/**
 * Game-scoped NFL Players + Fantasy + Kalshi props for Lounge game hub.
 * Public Kalshi market data needs no key. FantasyPros optional via FANTASYPROS_API_KEY.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'
const SLEEPER_STATE = 'https://api.sleeper.app/v1/state/nfl'
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2'
const FP_BASE = 'https://api.fantasypros.com/public/v2/json'

const FANTASY_POS = new Set(['QB', 'RB', 'WR', 'TE'])

/** Moneyline / spread / total / race / team specials tied to a single game. */
const KALSHI_GAME_SERIES = [
  'KXNFLGAME',
  'KXNFLSPREAD',
  'KXNFLTOTAL',
  'KXNFLTEAMTOTAL',
  'KXNFLWINMARGIN',
  'KXNFLRACE',
  'KXNFLDSTTD',
  'KXNFLSFTY',
  'KXNFLTOTALTD',
  'KXNFLTEAMTD',
  'KXNFLTEAMSACK',
  'KXNFLTEAMYDS',
  'KXNFLFG',
  'KXNFLTEAMFG',
  'KXNFLTEAMTO',
  'KXNFLTEAM1STDOWNS',
] as const

/** Half / quarter winners, spreads, totals. */
const KALSHI_PERIOD_SERIES = [
  'KXNFL1H',
  'KXNFL2H',
  'KXNFL1Q',
  'KXNFL2Q',
  'KXNFL3Q',
  'KXNFL4Q',
  'KXNFL1HSPREAD',
  'KXNFL1HTOTAL',
  'KXNFL1HTEAMTOTAL',
  'KXNFL2HSPREAD',
  'KXNFL2HTOTAL',
  'KXNFL1QSPREAD',
  'KXNFL1QTOTAL',
  'KXNFL2QSPREAD',
  'KXNFL2QTOTAL',
  'KXNFL3QSPREAD',
  'KXNFL3QTOTAL',
  'KXNFL4QSPREAD',
  'KXNFL4QTOTAL',
] as const

/** Player-scoped strike markets (grouped by player in the UI). */
const KALSHI_PLAYER_SERIES = [
  'KXNFLPASSYDS',
  'KXNFLRSHYDS',
  'KXNFLRECYDS',
  'KXNFLTD',
  'KXNFLREC',
  'KXNFLRSHATT',
  'KXNFLPASSATT',
  'KXNFLPASSCOMP',
  'KXNFLRRYDS',
  'KXNFLFIRSTTD',
  'KXNFLTEAMFIRSTTD',
  'KXNFLSACK',
  'KXNFLTKL',
] as const

const KALSHI_SERIES = [
  ...KALSHI_PLAYER_SERIES,
  ...KALSHI_GAME_SERIES,
  ...KALSHI_PERIOD_SERIES,
] as const

const KALSHI_PLAYER_SERIES_SET = new Set<string>(KALSHI_PLAYER_SERIES)
const KALSHI_PERIOD_SERIES_SET = new Set<string>(KALSHI_PERIOD_SERIES)

/** Soft caps so one game does not return hundreds of strike lines. */
const KALSHI_MAX_GAME = 60
const KALSHI_MAX_PERIOD = 40
const KALSHI_MAX_PLAYER = 80
/** Keep low ... Kalshi public API 429s hard under fan-out. */
const KALSHI_FETCH_CONCURRENCY = 2
const KALSHI_FETCH_RETRIES = 5

const CACHE_TTL_MS = 90_000

const HEADSHOT_CDN = (espnId: string) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

export type NflGameFantasyPlayer = {
  sleeper_id: string
  espn_id: string | null
  name: string
  position: string | null
  team: string
  side: 'home' | 'away'
  headshot_url: string | null
  search_rank: number | null
  /** This-week Sleeper PPR projection (DFF / weekly fantasy). */
  projected_ppr: number | null
  projected_pass_yd: number | null
  projected_rush_yd: number | null
  projected_rec_yd: number | null
  projected_rec: number | null
  /** Season-to-date Sleeper PPR + counting stats. */
  season_ppr: number | null
  season_gp: number | null
  season_pass_yd: number | null
  season_rush_yd: number | null
  season_rec_yd: number | null
  season_rec: number | null
  /** Optional FantasyPros enrich when key is set. */
  ecr: number | null
  fantasypros_pts: number | null
}

export type NflGameFantasyPropKind = 'game' | 'period' | 'player'

export type NflGameFantasyProp = {
  ticker: string
  series: string
  event_ticker: string
  title: string
  /** Short line without player prefix when available (e.g. "250+ passing yards"). */
  line_label: string
  /** `game` moneyline/spread/total/team · `period` half/quarter · `player` strike markets. */
  kind: NflGameFantasyPropKind
  player_name: string
  team_hint: string | null
  yes_bid: number | null
  yes_ask: number | null
  no_bid: number | null
  no_ask: number | null
  last: number | null
  /** Lifetime contracts traded. */
  volume: number | null
  /** 24h contracts traded. */
  volume_24h: number | null
  /** Open interest (contracts). */
  open_interest: number | null
  /** Contracts at best yes bid (book depth proxy … liquidity_dollars is deprecated). */
  yes_bid_size: number | null
  /** Contracts at best yes ask. */
  yes_ask_size: number | null
  /** Series browse URL. */
  url: string
  /** Direct market deep link. */
  url_market: string
  /** Deep link hinting Yes side (falls back to market page). */
  url_yes: string
  /** Deep link hinting No side (falls back to market page). */
  url_no: string
}

export type NflGameFantasyPayload = {
  ok: true
  event_id: string
  away_abbrev: string
  home_abbrev: string
  season: string | null
  week: number | null
  players: NflGameFantasyPlayer[]
  props: NflGameFantasyProp[]
  sources: string[]
  fetched_at: string
}

function normTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase()
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  return t
}

function nameKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < KALSHI_FETCH_RETRIES; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EdgeTilt-lounge-nfl-game-fantasy/1.0',
        ...(init?.headers || {}),
      },
    })
    if (res.status === 429) {
      const waitMs = Math.min(8_000, 350 * 2 ** attempt) + Math.floor(Math.random() * 200)
      await new Promise((r) => setTimeout(r, waitMs))
      lastErr = new Error(`${url} → 429`)
      continue
    }
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    return res.json()
  }
  throw lastErr || new Error(`${url} → failed`)
}

function dollarsToNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Fixed-point contract counts (`"1234.00"`) → whole contracts. */
function contractsToNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function kalshiMarketUrls(series: string, eventTicker: string, ticker: string) {
  const seriesSlug = String(series || '').trim().toLowerCase()
  const eventSlug = String(eventTicker || '').trim().toLowerCase()
  const tickerSlug = String(ticker || '').trim().toLowerCase()
  const seriesUrl = seriesSlug ? `https://kalshi.com/markets/${seriesSlug}` : 'https://kalshi.com/markets'
  const marketUrl =
    seriesSlug && eventSlug && tickerSlug
      ? `https://kalshi.com/markets/${seriesSlug}/${eventSlug}/${tickerSlug}`
      : tickerSlug
        ? `https://kalshi.com/markets/${tickerSlug}`
        : seriesUrl
  // Kalshi web accepts side hints on market URLs; if ignored, user still lands on the book.
  const yesUrl = `${marketUrl}?side=yes`
  const noUrl = `${marketUrl}?side=no`
  return { seriesUrl, marketUrl, yesUrl, noUrl }
}

/** Player strike titles look like `Micah Parsons: 1+ sacks`. Game titles do not. */
function parsePlayerFromKalshiTitle(title: string, series: string): string {
  if (!KALSHI_PLAYER_SERIES_SET.has(series)) return ''
  const raw = String(title || '').trim()
  const cut = raw.indexOf(':')
  if (cut <= 0) return ''
  const name = raw.slice(0, cut).trim()
  // Reject obviously non-player prefixes.
  if (!name || /^(will|over|under|full game|neither)/i.test(name)) return ''
  if (name.length > 48) return ''
  return name
}

function lineLabelFromTitle(title: string, playerName: string): string {
  const raw = String(title || '').trim()
  if (playerName && raw.toLowerCase().startsWith(playerName.toLowerCase())) {
    const rest = raw.slice(playerName.length).replace(/^:\s*/, '').trim()
    if (rest) return rest
  }
  const cut = raw.indexOf(':')
  if (cut > 0 && cut < 48) {
    const rest = raw.slice(cut + 1).trim()
    if (rest) return rest
  }
  return raw
}

function propKindForSeries(series: string): NflGameFantasyPropKind {
  if (KALSHI_PLAYER_SERIES_SET.has(series)) return 'player'
  if (KALSHI_PERIOD_SERIES_SET.has(series)) return 'period'
  return 'game'
}

function eventMatchesTeams(eventTicker: string, away: string, home: string): boolean {
  const t = String(eventTicker || '').toUpperCase()
  const a = away.toUpperCase()
  const h = home.toUpperCase()
  if (!t || !a || !h) return false
  // e.g. KXNFLPASSYDS-26SEP24ATLGB or KXNFLGAME-26SEP24ATLGB
  return (t.includes(a) && t.includes(h)) || t.endsWith(`${a}${h}`) || t.endsWith(`${h}${a}`)
}

function eventMatchesGameSuffix(eventTicker: string, suffix: string): boolean {
  const t = String(eventTicker || '').toUpperCase()
  const s = String(suffix || '').toUpperCase()
  if (!t || !s) return false
  return t.endsWith(s) || t.includes(`-${s}`) || t.includes(`-${s}-`)
}

function propLiquidity(p: NflGameFantasyProp): number {
  return (
    (p.volume_24h ?? 0) * 2 +
    (p.volume ?? 0) +
    (p.open_interest ?? 0) +
    (p.yes_bid_size ?? 0) +
    (p.yes_ask_size ?? 0)
  )
}

function mapKalshiMarket(
  series: string,
  eventTicker: string,
  m: Record<string, unknown>,
): NflGameFantasyProp {
  const title = String(m.title || m.yes_sub_title || '')
  const ticker = String(m.ticker || '')
  const playerName = parsePlayerFromKalshiTitle(title, series)
  const urls = kalshiMarketUrls(series, eventTicker, ticker)
  return {
    ticker,
    series,
    event_ticker: eventTicker,
    title,
    line_label: lineLabelFromTitle(title, playerName),
    kind: propKindForSeries(series),
    player_name: playerName,
    team_hint: null,
    yes_bid: dollarsToNum(m.yes_bid_dollars ?? m.yes_bid),
    yes_ask: dollarsToNum(m.yes_ask_dollars ?? m.yes_ask),
    no_bid: dollarsToNum(m.no_bid_dollars ?? m.no_bid),
    no_ask: dollarsToNum(m.no_ask_dollars ?? m.no_ask),
    last: dollarsToNum(m.last_price_dollars ?? m.last_price),
    volume: contractsToNum(m.volume_fp ?? m.volume),
    volume_24h: contractsToNum(m.volume_24h_fp ?? m.volume_24h),
    open_interest: contractsToNum(m.open_interest_fp ?? m.open_interest),
    yes_bid_size: contractsToNum(m.yes_bid_size_fp ?? m.yes_bid_size),
    yes_ask_size: contractsToNum(m.yes_ask_size_fp ?? m.yes_ask_size),
    url: urls.seriesUrl,
    url_market: urls.marketUrl,
    url_yes: urls.yesUrl,
    url_no: urls.noUrl,
  }
}

/** Resolve `26SEP24ATLGB`-style slug from the open KXNFLGAME event for this matchup. */
async function resolveKalshiGameSuffix(away: string, home: string): Promise<string | null> {
  const data = (await fetchJson(
    `${KALSHI_BASE}/events?series_ticker=KXNFLGAME&status=open&limit=200`,
  )) as { events?: Array<Record<string, unknown>> }
  const events = Array.isArray(data.events) ? data.events : []
  for (const ev of events) {
    const et = String(ev.event_ticker || '')
    if (!eventMatchesTeams(et, away, home)) continue
    const prefix = 'KXNFLGAME-'
    if (et.toUpperCase().startsWith(prefix)) return et.slice(prefix.length)
  }
  return null
}

async function fetchMarketsForEventTicker(
  series: string,
  eventTicker: string,
): Promise<NflGameFantasyProp[]> {
  const out: NflGameFantasyProp[] = []
  let cursor = ''
  for (let page = 0; page < 6; page++) {
    const q = new URLSearchParams({
      event_ticker: eventTicker,
      status: 'open',
      limit: '200',
    })
    if (cursor) q.set('cursor', cursor)
    const data = (await fetchJson(`${KALSHI_BASE}/markets?${q}`)) as {
      markets?: Array<Record<string, unknown>>
      cursor?: string
    }
    const markets = Array.isArray(data.markets) ? data.markets : []
    for (const m of markets) {
      const status = String(m.status || 'open').toLowerCase()
      if (status && status !== 'open' && status !== 'active') continue
      const et = String(m.event_ticker || eventTicker)
      out.push(mapKalshiMarket(series, et, m))
    }
    cursor = String(data.cursor || '')
    if (!cursor || markets.length === 0) break
  }
  return out
}

/** Series whose event tickers append extra suffixes (race lines, team-scoped first TD). */
const KALSHI_MULTI_EVENT_SERIES = new Set(['KXNFLRACE', 'KXNFLTEAMFIRSTTD'])

/**
 * Prefer exact `SERIES-SUFFIX` event (one request). Fall back to events list only for
 * multi-event series (or when the exact call itself fails).
 */
async function fetchKalshiSeriesForSuffix(
  series: string,
  suffix: string,
): Promise<NflGameFantasyProp[]> {
  const exactTicker = `${series}-${suffix}`
  let exactFailed = false
  try {
    const direct = await fetchMarketsForEventTicker(series, exactTicker)
    if (direct.length) return direct
  } catch {
    exactFailed = true
  }

  if (!exactFailed && !KALSHI_MULTI_EVENT_SERIES.has(series)) return []

  const out: NflGameFantasyProp[] = []
  let cursor = ''
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({
      series_ticker: series,
      status: 'open',
      limit: '200',
    })
    if (cursor) q.set('cursor', cursor)
    const data = (await fetchJson(`${KALSHI_BASE}/events?${q}`)) as {
      events?: Array<Record<string, unknown>>
      cursor?: string
    }
    const events = Array.isArray(data.events) ? data.events : []
    const matched = events
      .map((ev) => String(ev.event_ticker || ''))
      .filter((et) => et && eventMatchesGameSuffix(et, suffix) && et !== exactTicker)
    for (const eventTicker of matched) {
      try {
        const markets = await fetchMarketsForEventTicker(series, eventTicker)
        out.push(...markets)
      } catch {
        // Skip one bad event; keep collecting.
      }
    }
    cursor = String(data.cursor || '')
    if (matched.length || !cursor || events.length === 0) break
  }
  return out
}

async function mapPool<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  const n = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

function takeTopByLiquidity(list: NflGameFantasyProp[], limit: number): NflGameFantasyProp[] {
  return [...list].sort((a, b) => propLiquidity(b) - propLiquidity(a)).slice(0, limit)
}

async function loadPlayersFromDb(
  admin: SupabaseClient,
  away: string,
  home: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin
    .from('nfl_players')
    .select(
      'sleeper_id, espn_id, full_name, position, team, fantasy_positions, search_rank, headshot_url, local_headshot_path',
    )
    .in('team', [away, home])
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data : []
}

async function loadPlayersFromSleeper(away: string, home: string): Promise<Array<Record<string, unknown>>> {
  const raw = (await fetchJson(SLEEPER_PLAYERS)) as Record<string, Record<string, unknown>>
  const out: Array<Record<string, unknown>> = []
  for (const [id, p] of Object.entries(raw || {})) {
    if (!p || typeof p !== 'object') continue
    const team = normTeam(String(p.team || ''))
    if (team !== away && team !== home) continue
    const position = String(p.position || '').toUpperCase()
    const fantasy = Array.isArray(p.fantasy_positions)
      ? p.fantasy_positions.map((x) => String(x).toUpperCase())
      : []
    if (!FANTASY_POS.has(position) && !fantasy.some((fp) => FANTASY_POS.has(fp))) continue
    if (String(p.status || '').toLowerCase() === 'retired') continue
    const espnId = p.espn_id != null ? String(p.espn_id) : null
    out.push({
      sleeper_id: id,
      espn_id: espnId,
      full_name: String(p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id),
      position,
      team,
      fantasy_positions: fantasy,
      search_rank: Number.isFinite(Number(p.search_rank)) ? Number(p.search_rank) : null,
      headshot_url: espnId ? HEADSHOT_CDN(espnId) : null,
      local_headshot_path: espnId ? `/sports/nfl/players/${espnId}.png` : null,
    })
  }
  return out
}

type SleeperStatRow = {
  pts_ppr?: number | null
  pts_half_ppr?: number | null
  pts_std?: number | null
  gp?: number | null
  pass_yd?: number | null
  rush_yd?: number | null
  rec_yd?: number | null
  rec?: number | null
  stats?: SleeperStatRow
}

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

function intOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

function readSleeperRow(row: unknown): SleeperStatRow {
  if (!row || typeof row !== 'object') return {}
  const r = row as SleeperStatRow
  return r.stats && typeof r.stats === 'object' ? { ...r, ...r.stats } : r
}

/** Path style used by Sleeper + our PVAL sync: /nfl/regular/{season}/{week?} */
async function loadSleeperStatMap(
  kind: 'projections' | 'stats',
  season: string,
  week?: number | null,
): Promise<Map<string, SleeperStatRow>> {
  const base =
    week != null && Number.isFinite(week)
      ? `https://api.sleeper.app/v1/${kind}/nfl/regular/${season}/${week}`
      : `https://api.sleeper.app/v1/${kind}/nfl/regular/${season}`
  try {
    const raw = (await fetchJson(base)) as Record<string, unknown>
    const map = new Map<string, SleeperStatRow>()
    for (const [id, row] of Object.entries(raw || {})) {
      map.set(String(id), readSleeperRow(row))
    }
    return map
  } catch {
    return new Map()
  }
}

async function loadSleeperProjections(
  season: string,
  week: number,
): Promise<Map<string, SleeperStatRow>> {
  return loadSleeperStatMap('projections', season, week)
}

async function loadSleeperSeasonStats(season: string): Promise<Map<string, SleeperStatRow>> {
  return loadSleeperStatMap('stats', season, null)
}

async function loadKalshiProps(away: string, home: string): Promise<NflGameFantasyProp[]> {
  const suffix = await resolveKalshiGameSuffix(away, home)
  if (!suffix) return []

  const batches = await mapPool(KALSHI_SERIES, KALSHI_FETCH_CONCURRENCY, (series) =>
    fetchKalshiSeriesForSuffix(series, suffix).catch(() => [] as NflGameFantasyProp[]),
  )
  const all = batches.flat()
  const seen = new Set<string>()
  const deduped: NflGameFantasyProp[] = []
  for (const p of all) {
    if (!p.ticker || seen.has(p.ticker)) continue
    seen.add(p.ticker)
    deduped.push(p)
  }

  const game = takeTopByLiquidity(
    deduped.filter((p) => p.kind === 'game'),
    KALSHI_MAX_GAME,
  )
  const period = takeTopByLiquidity(
    deduped.filter((p) => p.kind === 'period'),
    KALSHI_MAX_PERIOD,
  )
  const player = takeTopByLiquidity(
    deduped.filter((p) => p.kind === 'player'),
    KALSHI_MAX_PLAYER,
  )

  const merged = [...game, ...period, ...player]
  merged.sort((a, b) => {
    const kindRank = (k: NflGameFantasyPropKind) => (k === 'game' ? 0 : k === 'period' ? 1 : 2)
    const dk = kindRank(a.kind) - kindRank(b.kind)
    if (dk !== 0) return dk
    if (a.kind === 'player') {
      const na = a.player_name || a.title
      const nb = b.player_name || b.title
      const byName = na.localeCompare(nb)
      if (byName !== 0) return byName
    }
    return propLiquidity(b) - propLiquidity(a)
  })
  return merged
}

async function loadFantasyPros(
  season: string,
  week: number,
  nameToPlayer: Map<string, NflGameFantasyPlayer>,
): Promise<{ ecr: Map<string, number>; pts: Map<string, number>; ok: boolean }> {
  const key = String(Deno.env.get('FANTASYPROS_API_KEY') || '').trim()
  const ecr = new Map<string, number>()
  const pts = new Map<string, number>()
  if (!key) return { ecr, pts, ok: false }

  const positions = ['QB', 'RB', 'WR', 'TE']
  try {
    for (const position of positions) {
      const rankUrl =
        `${FP_BASE}/nfl/${season}/consensus-rankings?position=${position}&scoring=PPR&type=weekly&week=${week}`
      const projUrl =
        `${FP_BASE}/nfl/${season}/projections?position=${position}&scoring=PPR&week=${week}`
      const headers = { 'x-api-key': key }
      try {
        const ranks = (await fetchJson(rankUrl, { headers })) as {
          players?: Array<Record<string, unknown>>
        }
        for (const p of ranks.players || []) {
          const nm = nameKey(String(p.player_name || p.player_name_id || ''))
          const rank = Number(p.rank_ecr ?? p.rank)
          if (nm && Number.isFinite(rank)) ecr.set(nm, rank)
        }
      } catch {
        /* optional */
      }
      try {
        const projs = (await fetchJson(projUrl, { headers })) as {
          players?: Array<Record<string, unknown>>
        }
        for (const p of projs.players || []) {
          const nm = nameKey(String(p.player_name || ''))
          const points = Number(
            (p.stats as Record<string, unknown> | undefined)?.pts_ppr ??
              p.points ??
              p.fpts,
          )
          if (nm && Number.isFinite(points)) pts.set(nm, points)
        }
      } catch {
        /* optional */
      }
    }
    for (const [nm, player] of nameToPlayer) {
      if (ecr.has(nm)) player.ecr = ecr.get(nm) ?? null
      if (pts.has(nm)) player.fantasypros_pts = pts.get(nm) ?? null
    }
    return { ecr, pts, ok: ecr.size > 0 || pts.size > 0 }
  } catch {
    return { ecr, pts, ok: false }
  }
}

function mapDbRow(
  row: Record<string, unknown>,
  away: string,
  home: string,
): NflGameFantasyPlayer | null {
  const team = normTeam(String(row.team || ''))
  if (team !== away && team !== home) return null
  const espnId = row.espn_id != null ? String(row.espn_id) : null
  const local = row.local_headshot_path != null ? String(row.local_headshot_path) : null
  const cdn = row.headshot_url != null ? String(row.headshot_url) : espnId ? HEADSHOT_CDN(espnId) : null
  return {
    sleeper_id: String(row.sleeper_id),
    espn_id: espnId,
    name: String(row.full_name || ''),
    position: row.position != null ? String(row.position) : null,
    team,
    side: team === home ? 'home' : 'away',
    headshot_url: cdn || local,
    search_rank: Number.isFinite(Number(row.search_rank)) ? Number(row.search_rank) : null,
    projected_ppr: null,
    projected_pass_yd: null,
    projected_rush_yd: null,
    projected_rec_yd: null,
    projected_rec: null,
    season_ppr: null,
    season_gp: null,
    season_pass_yd: null,
    season_rush_yd: null,
    season_rec_yd: null,
    season_rec: null,
    ecr: null,
    fantasypros_pts: null,
  }
}

export async function buildNflGameFantasy(
  admin: SupabaseClient,
  opts: { eventId: string; awayAbbrev: string; homeAbbrev: string },
): Promise<NflGameFantasyPayload> {
  const eventId = String(opts.eventId || '').trim()
  const away = normTeam(opts.awayAbbrev)
  const home = normTeam(opts.homeAbbrev)
  if (!eventId || !away || !home) throw new Error('Missing event_id, away_abbrev, or home_abbrev.')

  const { data: cached } = await admin
    .from('nfl_game_fantasy_cache')
    .select('payload, fetched_at')
    .eq('event_id', eventId)
    .maybeSingle()
  if (cached?.payload && cached.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age >= 0 && age < CACHE_TTL_MS) {
      return cached.payload as NflGameFantasyPayload
    }
  }

  const sources: string[] = []
  let rawRows = await loadPlayersFromDb(admin, away, home)
  if (rawRows.length >= 8) {
    sources.push('nfl_players')
  } else {
    rawRows = await loadPlayersFromSleeper(away, home)
    sources.push('sleeper_players')
  }

  const state = (await fetchJson(SLEEPER_STATE).catch(() => null)) as {
    season?: string
    week?: number
  } | null
  const season = state?.season != null ? String(state.season) : null
  const week = Number.isFinite(Number(state?.week)) ? Number(state?.week) : null
  sources.push('sleeper_state')

  const projections =
    season && week != null ? await loadSleeperProjections(season, week) : new Map<string, SleeperStatRow>()
  if (projections.size) sources.push('sleeper_projections')

  const seasonStats = season ? await loadSleeperSeasonStats(season) : new Map<string, SleeperStatRow>()
  if (seasonStats.size) sources.push('sleeper_season_stats')

  const players: NflGameFantasyPlayer[] = []
  for (const row of rawRows) {
    const mapped = mapDbRow(row, away, home)
    if (!mapped) continue
    const proj = projections.get(mapped.sleeper_id)
    if (proj) {
      mapped.projected_ppr = numOrNull(proj.pts_ppr ?? proj.pts_half_ppr ?? proj.pts_std)
      mapped.projected_pass_yd = intOrNull(proj.pass_yd)
      mapped.projected_rush_yd = intOrNull(proj.rush_yd)
      mapped.projected_rec_yd = intOrNull(proj.rec_yd)
      mapped.projected_rec = numOrNull(proj.rec)
    }
    const sea = seasonStats.get(mapped.sleeper_id)
    if (sea) {
      mapped.season_ppr = numOrNull(sea.pts_ppr ?? sea.pts_half_ppr ?? sea.pts_std)
      mapped.season_gp = intOrNull(sea.gp)
      mapped.season_pass_yd = intOrNull(sea.pass_yd)
      mapped.season_rush_yd = intOrNull(sea.rush_yd)
      mapped.season_rec_yd = intOrNull(sea.rec_yd)
      mapped.season_rec = numOrNull(sea.rec)
    }
    players.push(mapped)
  }

  players.sort((a, b) => {
    const pa = a.projected_ppr ?? -1
    const pb = b.projected_ppr ?? -1
    if (pb !== pa) return pb - pa
    const ra = a.search_rank ?? 9999
    const rb = b.search_rank ?? 9999
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })

  const byName = new Map(players.map((p) => [nameKey(p.name), p]))
  if (season && week != null) {
    const fp = await loadFantasyPros(season, week, byName)
    if (fp.ok) sources.push('fantasypros')
  }

  let props: NflGameFantasyProp[] = []
  try {
    props = await loadKalshiProps(away, home)
    if (props.length) sources.push('kalshi')
  } catch {
    props = []
  }

  const payload: NflGameFantasyPayload = {
    ok: true,
    event_id: eventId,
    away_abbrev: away,
    home_abbrev: home,
    season,
    week,
    players,
    props,
    sources,
    fetched_at: new Date().toISOString(),
  }

  await admin.from('nfl_game_fantasy_cache').upsert(
    {
      event_id: eventId,
      away_abbrev: away,
      home_abbrev: home,
      payload,
      fetched_at: payload.fetched_at,
    },
    { onConflict: 'event_id' },
  )

  return payload
}
