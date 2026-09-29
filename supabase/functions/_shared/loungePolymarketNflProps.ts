/**
 * Polymarket US (gateway.polymarket.us) NFL per-game markets → shared prop shape.
 * Public market data … no key. Prefer polymarket.us URLs for US persons.
 */

import { easternDateParts, matchMarketPair, type MarketSideHint } from './marketTeamMatch.ts'

const POLY_BASE = 'https://gateway.polymarket.us'
const POLY_WEB = 'https://polymarket.us'
const POLY_MAX_GAME = 40
const POLY_MAX_PERIOD = 24
const POLY_MAX_PLAYER = 70

/** Popular board types only … skip quarters / race / margin / specialty noise. */
const POLY_POPULAR_GAME = new Set([
  'football_team_full_game_winner',
  'football_team_full_game_total',
  'football_team_points_full_game_total',
  'football_team_full_game_team_total',
])

const POLY_POPULAR_PERIOD = new Set([
  'football_team_first_half_winner',
  'football_team_first_half_total',
  'football_game_first_half_total',
  'football_team_second_half_winner',
  'football_team_second_half_total',
  'football_game_second_half_total',
])

function isPopularPolyNonPlayer(sportsType: string): boolean {
  const t = String(sportsType || '').toLowerCase()
  if (POLY_POPULAR_GAME.has(t) || POLY_POPULAR_PERIOD.has(t)) return true
  // Team totals often land under slightly different type strings.
  if (t.includes('team') && t.includes('total') && (t.includes('full_game') || t.includes('first_half') || t.includes('second_half'))) {
    return true
  }
  return false
}

type PropKind = 'game' | 'period' | 'player'

type PolyProp = {
  ticker: string
  series: string
  event_ticker: string
  title: string
  line_label: string
  kind: PropKind
  source: 'polymarket'
  player_name: string
  team_hint: string | null
  yes_bid: number | null
  yes_ask: number | null
  no_bid: number | null
  no_ask: number | null
  last: number | null
  volume: number | null
  volume_24h: number | null
  open_interest: number | null
  yes_bid_size: number | null
  yes_ask_size: number | null
  url: string
  url_market: string
  url_yes: string
  url_no: string
}

function dollarsToNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'object' && v !== null && 'value' in v) {
    return dollarsToNum((v as { value: unknown }).value)
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normTeam(team: string | null | undefined): string {
  const t = String(team || '').trim().toUpperCase()
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  return t
}

/** Gateway list calls have taken 20-90s; bound them so the Kalshi half still returns. */
const POLY_FETCH_TIMEOUT_MS = 45_000

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EdgeTilt-lounge-nfl-game-fantasy/1.0',
    },
    signal: AbortSignal.timeout(POLY_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

function polyKind(sportsType: string): PropKind {
  const t = String(sportsType || '').toLowerCase()
  if (t.includes('player')) return 'player'
  if (
    t.includes('half') ||
    t.includes('quarter') ||
    t.includes('1h') ||
    t.includes('2h') ||
    t.includes('1q') ||
    t.includes('2q') ||
    t.includes('3q') ||
    t.includes('4q')
  ) {
    return 'period'
  }
  return 'game'
}

/**
 * Each side's `quote` is what it costs to buy that side (Yes quote = long best ask, No quote = 1 − long best bid).
 * Its `price` is not: Yes `price` is the long best bid and No `price` is the long best ask, so reading `price`
 * as the No cost showed 60¢ on a No that cost 41¢. Bid for a side = 1 − the other side's quote.
 */
function sidePrice(
  sides: Array<Record<string, unknown>>,
  labels: string[],
): { bid: number | null; ask: number | null } {
  const want = new Set(labels.map((l) => l.toLowerCase()))
  const side = sides.find((s) => want.has(String(s.description || '').toLowerCase()))
  if (!side) return { bid: null, ask: null }
  const other = sides.find((s) => s !== side)
  const ask = dollarsToNum(side.quote)
  const otherAsk = other ? dollarsToNum(other.quote) : null
  if (ask == null) {
    const px = dollarsToNum(side.price)
    return { bid: px, ask: px }
  }
  const bid = otherAsk == null ? null : Math.max(0, Math.round((1 - otherAsk) * 10000) / 10000)
  return { bid, ask }
}

/**
 * Polymarket US sports boards live under /sports/{league}/{eventSlug}.
 * Legacy /event/{event}/{market} paths 404 on polymarket.us.
 * The board preselects a trade via `?marketSlug={slug}&outcomeId={marketId}-long|short`
 * (their `EVENT_TRADE_SELECTION_PARAMS`); `market` / `side` are ignored.
 */
function polyUrls(league: PolyLeague, eventSlug: string, marketSlug: string, marketId: string) {
  const eventUrl = `${POLY_WEB}/sports/${league}/${encodeURIComponent(eventSlug)}`
  if (!marketSlug || !marketId) {
    return { seriesUrl: eventUrl, marketUrl: eventUrl, yesUrl: eventUrl, noUrl: eventUrl }
  }
  const pick = (isLong: boolean) =>
    `${eventUrl}?${new URLSearchParams({
      marketSlug,
      outcomeId: `${marketId}-${isLong ? 'long' : 'short'}`,
    })}`
  return { seriesUrl: eventUrl, marketUrl: pick(true), yesUrl: pick(true), noUrl: pick(false) }
}

function mapPolyMarket(
  league: PolyLeague,
  eventSlug: string,
  m: Record<string, unknown>,
): PolyProp | null {
  const slug = String(m.slug || '').trim()
  if (!slug) return null
  const sportsType = String(m.sportsMarketType || m.sportsMarketTypeV2 || '')
  const kind = polyKind(sportsType)
  const meta =
    m.metadata && typeof m.metadata === 'object'
      ? (m.metadata as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  const playerName = String(meta.playerName || '').trim()
  const title = String(m.title || m.question || m.titleShort || slug)
  const lineLabel = String(m.titleShort || m.title || title).trim()
  const sides = Array.isArray(m.marketSides)
    ? (m.marketSides as Array<Record<string, unknown>>)
    : []

  let yes = sidePrice(sides, ['Yes', 'Over'])
  let no = sidePrice(sides, ['No', 'Under'])
  if (yes.ask == null && yes.bid == null) {
    const bid = dollarsToNum(m.bestBidQuote)
    const ask = dollarsToNum(m.bestAskQuote)
    yes = { bid, ask }
  }
  if (no.ask == null && no.bid == null && (yes.ask != null || yes.bid != null)) {
    // Buying No = selling Yes at its bid; selling No = buying Yes at its ask.
    const inv = (v: number | null) => (v == null ? null : Math.max(0, Math.min(1, Math.round((1 - v) * 10000) / 10000)))
    no = { bid: inv(yes.ask), ask: inv(yes.bid ?? yes.ask) }
  }

  const urls = polyUrls(league, eventSlug, slug, String(m.id ?? '').trim())
  return {
    ticker: `poly:${slug}`,
    series: sportsType || 'polymarket',
    event_ticker: eventSlug,
    title,
    line_label: lineLabel,
    kind,
    player_name: kind === 'player' ? playerName : '',
    team_hint: null,
    yes_bid: yes.bid,
    yes_ask: yes.ask,
    no_bid: no.bid,
    no_ask: no.ask,
    last: dollarsToNum(m.bestBidQuote) ?? yes.bid,
    volume: null,
    volume_24h: null,
    open_interest: null,
    yes_bid_size: null,
    yes_ask_size: null,
    url: urls.seriesUrl,
    url_market: urls.marketUrl,
    url_yes: urls.yesUrl,
    url_no: urls.noUrl,
    source: 'polymarket',
  }
}

function interestingness(p: PolyProp): number {
  const mid = p.yes_ask ?? p.yes_bid ?? p.last ?? 0
  const spread =
    p.yes_ask != null && p.yes_bid != null ? Math.abs(Number(p.yes_ask) - Number(p.yes_bid)) : 0.05
  return (1 - Math.abs(mid - 0.45)) * 1000 - spread * 200
}

function takeTop(list: PolyProp[], limit: number): PolyProp[] {
  return [...list].sort((a, b) => interestingness(b) - interestingness(a)).slice(0, limit)
}

function teamsMatch(ev: Record<string, unknown>, away: string, home: string): boolean {
  const teams = Array.isArray(ev.teams) ? (ev.teams as Array<Record<string, unknown>>) : []
  const abbrevs = new Set(
    teams
      .map((t) => normTeam(String(t.displayAbbreviation || t.abbreviation || '')))
      .filter(Boolean),
  )
  return abbrevs.has(away) && abbrevs.has(home)
}

async function resolvePolyEventSlug(away: string, home: string): Promise<string | null> {
  const data = (await fetchJson(
    `${POLY_BASE}/v2/leagues/nfl/events?limit=40&type=sport&section=general`,
  )) as { events?: Array<Record<string, unknown>> }
  const events = Array.isArray(data.events) ? data.events : []
  for (const ev of events) {
    if (!teamsMatch(ev, away, home)) continue
    const slug = String(ev.slug || '').trim()
    if (slug) return slug
  }
  return null
}

/** CFB: ESPN abbrevs rarely equal Polymarket's, so match on names too and prefer the kickoff date. */
async function resolvePolyCfbEventSlug(
  away: MarketSideHint,
  home: MarketSideHint,
  commenceIso: string | null,
): Promise<{ slug: string; codeToAbbrev: Record<string, string> } | null> {
  const d = easternDateParts(commenceIso)
  const dateTag = d ? `-${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''
  let best: { slug: string; score: number; codeToAbbrev: Record<string, string> } | null = null
  for (let offset = 0; offset < 300; offset += 100) {
    const data = (await fetchJson(
      `${POLY_BASE}/v2/leagues/cfb/events?limit=100&offset=${offset}&type=sport&section=general`,
    )) as { events?: Array<Record<string, unknown>> }
    const events = Array.isArray(data.events) ? data.events : []
    for (const ev of events) {
      const slug = String(ev.slug || '').trim()
      if (!slug) continue
      const teams = Array.isArray(ev.teams) ? (ev.teams as Array<Record<string, unknown>>) : []
      const venue = teams.map((t) => ({
        code: String(t.displayAbbreviation || ''),
        name: `${String(t.name || '')} ${String(t.alias || '')}`.trim(),
      }))
      let match = matchMarketPair(venue, away, home)
      if (!match.score) {
        // "Penn State" alone still prefixes "Penn State Nittany Lions" when alias differs.
        match = matchMarketPair(
          teams.map((t) => ({ code: String(t.displayAbbreviation || ''), name: String(t.name || '') })),
          away,
          home,
        )
      }
      if (!match.score) continue
      let score = match.score
      if (dateTag && slug.endsWith(dateTag)) score += 10
      if (!best || score > best.score) best = { slug, score, codeToAbbrev: match.codeToAbbrev }
    }
    // Events are date-ordered; once we have a same-day hit, later pages are future weeks.
    if ((best && best.score >= 10) || events.length < 100) break
  }
  return best ? { slug: best.slug, codeToAbbrev: best.codeToAbbrev } : null
}

export type PolyLeague = 'nfl' | 'cfb'

/** Team-scoped markets tag every side with the same team (`PSU over 21.5`); winners carry both. */
function polyTeamHint(m: Record<string, unknown>, codeToAbbrev: Record<string, string>): string | null {
  const sides = Array.isArray(m.marketSides) ? (m.marketSides as Array<Record<string, unknown>>) : []
  const codes = new Set(
    sides
      .map((sd) => {
        const team = sd.team && typeof sd.team === 'object' ? (sd.team as Record<string, unknown>) : null
        return String(team?.displayAbbreviation || '').toUpperCase()
      })
      .filter(Boolean),
  )
  if (codes.size !== 1) return null
  return codeToAbbrev[[...codes][0]] || null
}

export type PolyLoadOpts = {
  league?: PolyLeague
  /** CFB only … full display names ("Penn State Nittany Lions") for name matching. */
  awayNames?: string[]
  homeNames?: string[]
  commenceIso?: string | null
}

export async function loadPolymarketProps(
  away: string,
  home: string,
  opts: PolyLoadOpts = {},
): Promise<PolyProp[]> {
  const league: PolyLeague = opts.league || 'nfl'
  const a = normTeam(away)
  const h = normTeam(home)
  if (!a || !h) return []

  let eventSlug: string | null = null
  let codeToAbbrev: Record<string, string> = {}
  if (league === 'cfb') {
    const hit = await resolvePolyCfbEventSlug(
      { abbrev: a, names: opts.awayNames || [] },
      { abbrev: h, names: opts.homeNames || [] },
      opts.commenceIso ?? null,
    )
    eventSlug = hit?.slug || null
    codeToAbbrev = hit?.codeToAbbrev || {}
  } else {
    eventSlug = await resolvePolyEventSlug(a, h)
  }
  if (!eventSlug) return []

  const wrap = (await fetchJson(
    `${POLY_BASE}/v1/events/slug/${encodeURIComponent(eventSlug)}`,
  )) as { event?: Record<string, unknown> }
  const ev = wrap.event || {}
  const markets = Array.isArray(ev.markets) ? (ev.markets as Array<Record<string, unknown>>) : []

  const out: PolyProp[] = []
  const seen = new Set<string>()
  for (const m of markets) {
    if (m.active === false || m.closed === true || m.hidden === true) continue
    const st = String(m.sportsMarketType || '')
    // Cover-style spreads don't map cleanly to Yes/No chips … skip for v1.
    if (st.includes('spread') && !st.includes('winner')) continue
    const mapped = mapPolyMarket(league, eventSlug, m)
    if (!mapped || seen.has(mapped.ticker)) continue
    if (league === 'cfb') mapped.team_hint = polyTeamHint(m, codeToAbbrev)
    // Player props stay; game/period only when on the popular allowlist.
    if (mapped.kind !== 'player' && !isPopularPolyNonPlayer(st)) continue
    seen.add(mapped.ticker)
    out.push(mapped)
  }

  const game = takeTop(
    out.filter((p) => p.kind === 'game'),
    POLY_MAX_GAME,
  )
  const period = takeTop(
    out.filter((p) => p.kind === 'period'),
    POLY_MAX_PERIOD,
  )
  const player = takeTop(
    out.filter((p) => p.kind === 'player'),
    POLY_MAX_PLAYER,
  )

  const merged = [...game, ...period, ...player]
  merged.sort((a, b) => {
    const kindRank = (k: PropKind) => (k === 'game' ? 0 : k === 'period' ? 1 : 2)
    const dk = kindRank(a.kind) - kindRank(b.kind)
    if (dk !== 0) return dk
    if (a.kind === 'player') {
      const byName = (a.player_name || a.title).localeCompare(b.player_name || b.title)
      if (byName !== 0) return byName
    }
    return interestingness(b) - interestingness(a)
  })
  return merged
}
