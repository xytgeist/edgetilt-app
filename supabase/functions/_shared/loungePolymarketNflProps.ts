/**
 * Polymarket US (gateway.polymarket.us) NFL per-game markets → shared prop shape.
 * Public market data … no key. Prefer polymarket.us URLs for US persons.
 */

const POLY_BASE = 'https://gateway.polymarket.us'
const POLY_WEB = 'https://polymarket.us'
const POLY_MAX_GAME = 50
const POLY_MAX_PERIOD = 35
const POLY_MAX_PLAYER = 70

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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EdgeTilt-lounge-nfl-game-fantasy/1.0',
    },
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

function sidePrice(
  sides: Array<Record<string, unknown>>,
  labels: string[],
): { bid: number | null; ask: number | null } {
  const want = new Set(labels.map((l) => l.toLowerCase()))
  const side = sides.find((s) => want.has(String(s.description || '').toLowerCase()))
  if (!side) return { bid: null, ask: null }
  const px = dollarsToNum(side.price)
  return { bid: px, ask: px }
}

function polyUrls(eventSlug: string, marketSlug: string) {
  const eventUrl = `${POLY_WEB}/event/${eventSlug}`
  const marketUrl =
    eventSlug && marketSlug
      ? `${POLY_WEB}/event/${eventSlug}/${marketSlug}`
      : marketSlug
        ? `${POLY_WEB}/market/${marketSlug}`
        : eventUrl
  return {
    seriesUrl: eventUrl,
    marketUrl,
    yesUrl: `${marketUrl}?side=yes`,
    noUrl: `${marketUrl}?side=no`,
  }
}

function mapPolyMarket(
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
  if (no.ask == null && no.bid == null && yes.ask != null) {
    const inv = Math.max(0, Math.min(1, 1 - Number(yes.ask)))
    no = { bid: inv, ask: inv }
  }

  const urls = polyUrls(eventSlug, slug)
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

export async function loadPolymarketProps(away: string, home: string): Promise<PolyProp[]> {
  const a = normTeam(away)
  const h = normTeam(home)
  if (!a || !h) return []

  const eventSlug = await resolvePolyEventSlug(a, h)
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
    const mapped = mapPolyMarket(eventSlug, m)
    if (!mapped || seen.has(mapped.ticker)) continue
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
