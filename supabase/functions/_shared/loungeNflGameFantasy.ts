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
const KALSHI_SERIES = ['KXNFLPASSYDS', 'KXNFLRSHYDS', 'KXNFLRECYDS', 'KXNFLTD'] as const
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
  projected_ppr: number | null
  ecr: number | null
  fantasypros_pts: number | null
}

export type NflGameFantasyProp = {
  ticker: string
  series: string
  title: string
  player_name: string
  team_hint: string | null
  yes_bid: number | null
  yes_ask: number | null
  last: number | null
  url: string
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
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EdgeTilt-lounge-nfl-game-fantasy/1.0',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

function dollarsToNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parsePlayerFromKalshiTitle(title: string): string {
  const raw = String(title || '')
  const cut = raw.indexOf(':')
  return (cut > 0 ? raw.slice(0, cut) : raw).trim()
}

function eventMatchesTeams(eventTicker: string, away: string, home: string): boolean {
  const t = String(eventTicker || '').toUpperCase()
  const a = away.toUpperCase()
  const h = home.toUpperCase()
  if (!t || !a || !h) return false
  // e.g. KXNFLPASSYDS-26SEP24ATLGB or KXNFLGAME-26SEP24ATLGB
  return (t.includes(a) && t.includes(h)) || t.endsWith(`${a}${h}`) || t.endsWith(`${h}${a}`)
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

async function loadSleeperProjections(
  season: string,
  week: number,
): Promise<Map<string, number>> {
  const url = `https://api.sleeper.app/v1/projections/nfl/${season}/${week}?season_type=regular`
  try {
    const raw = (await fetchJson(url)) as Record<string, Record<string, unknown>>
    const map = new Map<string, number>()
    for (const [id, row] of Object.entries(raw || {})) {
      const stats = (row?.stats || row) as Record<string, unknown>
      const pts = Number(stats?.pts_ppr ?? stats?.pts_half_ppr ?? stats?.pts_std)
      if (Number.isFinite(pts)) map.set(String(id), pts)
    }
    return map
  } catch {
    return new Map()
  }
}

async function loadKalshiProps(away: string, home: string): Promise<NflGameFantasyProp[]> {
  const props: NflGameFantasyProp[] = []
  for (const series of KALSHI_SERIES) {
    let cursor = ''
    for (let page = 0; page < 6; page++) {
      const q = new URLSearchParams({ series_ticker: series, status: 'open', limit: '200' })
      if (cursor) q.set('cursor', cursor)
      const data = (await fetchJson(`${KALSHI_BASE}/markets?${q}`)) as {
        markets?: Array<Record<string, unknown>>
        cursor?: string
      }
      const markets = Array.isArray(data.markets) ? data.markets : []
      for (const m of markets) {
        const eventTicker = String(m.event_ticker || '')
        if (!eventMatchesTeams(eventTicker, away, home)) continue
        const title = String(m.title || m.yes_sub_title || '')
        const playerName = parsePlayerFromKalshiTitle(title)
        const ticker = String(m.ticker || '')
        props.push({
          ticker,
          series,
          title,
          player_name: playerName,
          team_hint: eventTicker.includes(away) && eventTicker.includes(home) ? null : null,
          yes_bid: dollarsToNum(m.yes_bid_dollars ?? m.yes_bid),
          yes_ask: dollarsToNum(m.yes_ask_dollars ?? m.yes_ask),
          last: dollarsToNum(m.last_price_dollars ?? m.last_price),
          url: `https://kalshi.com/markets/${series.toLowerCase()}`,
        })
      }
      cursor = String(data.cursor || '')
      if (!cursor || markets.length === 0) break
    }
  }
  // Prefer mid-probability interesting props; cap list
  props.sort((a, b) => {
    const pa = a.yes_ask ?? a.yes_bid ?? a.last ?? 0
    const pb = b.yes_ask ?? b.yes_bid ?? b.last ?? 0
    const score = (p: number) => -Math.abs(p - 0.45)
    return score(pb) - score(pa)
  })
  return props.slice(0, 40)
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
    // Prefer ESPN CDN until local/R2 mirrors are confirmed present.
    headshot_url: cdn || local,
    search_rank: Number.isFinite(Number(row.search_rank)) ? Number(row.search_rank) : null,
    projected_ppr: null,
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
    season && week != null ? await loadSleeperProjections(season, week) : new Map<string, number>()
  if (projections.size) sources.push('sleeper_projections')

  const players: NflGameFantasyPlayer[] = []
  for (const row of rawRows) {
    const mapped = mapDbRow(row, away, home)
    if (!mapped) continue
    const pts = projections.get(mapped.sleeper_id)
    if (pts != null) mapped.projected_ppr = Math.round(pts * 10) / 10
    players.push(mapped)
  }

  players.sort((a, b) => {
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
