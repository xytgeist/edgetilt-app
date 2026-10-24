/**
 * Sportsbook NBA player props (The Odds API) for cards whose game Kalshi / Polymarket have not priced yet: books post
 * a game's props a day or more ahead, exchanges on game day. Each book's Over / Under is de-vigged, the main line
 * (the point most books hang) is averaged across books, and `24.5` becomes `25+ points` at that fair probability.
 * Pregame games in the next 48h only; ~8 credits per game per refresh (4 markets x us, us2), shared cache 30 min.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { nbaTeam } from './fantasyNbaBoard.ts'
import { nameKey } from './fantasyNbaMarketLines.ts'

const ODDS = 'https://api.the-odds-api.com/v4'
const MARKET_STAT: Record<string, string> = {
  player_points: 'pts',
  player_rebounds: 'reb',
  player_assists: 'ast',
  player_threes: 'tpm',
}
const STAT_WORD: Record<string, string> = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'threes' }
const HORIZON_MS = 48 * 3600_000

const TEAM_BY_NAME: Record<string, string> = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE', 'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND', 'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
}

export type NbaBookProp = { stat: string; label: string; price: number; no: number; books: number }

const ET_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

function implied(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100)
}

async function oddsJson(path: string, key: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${ODDS}${path}${sep}apiKey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Odds API ${res.status}`)
  return await res.json()
}

/** `nameKey|TEAM|ET date` → consensus props for that game (keyed under both teams; the name pins the player). */
export function loadNbaBookProps(admin?: SupabaseClient): Promise<Record<string, NbaBookProp[]>> {
  const key = String(Deno.env.get('THE_ODDS_API_KEY') || '').trim()
  if (!key) return Promise.resolve({})
  return sharedCached(
    'fantasy:nba-book-props:v1',
    { ttlMs: 30 * 60_000, staleMaxMs: 3 * 3600_000, leaseMs: 60_000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    async () => {
      const events = ((await oddsJson('/sports/basketball_nba/events', key)) as Array<Record<string, unknown>>) || []
      const now = Date.now()
      const soon = events.filter((e) => {
        const t = Date.parse(String(e.commence_time || ''))
        return Number.isFinite(t) && t > now && t - now < HORIZON_MS
      })
      const out: Record<string, NbaBookProp[]> = {}
      await Promise.all(
        soon.map(async (e) => {
          const body = (await oddsJson(
            `/sports/basketball_nba/events/${e.id}/odds?regions=us,us2&markets=${Object.keys(MARKET_STAT).join(',')}&oddsFormat=american`,
            key,
          ).catch(() => null)) as { bookmakers?: Array<{ markets?: Array<{ key: string; outcomes?: Array<Record<string, unknown>> }> }> } | null
          const date = ET_DATE.format(Date.parse(String(e.commence_time)))
          const teams = [TEAM_BY_NAME[String(e.home_team)], TEAM_BY_NAME[String(e.away_team)]].filter(Boolean).map((t) => nbaTeam(t))
          // player|stat|point → fair P(over) per book
          const lines = new Map<string, { name: string; stat: string; point: number; fair: number[] }>()
          for (const book of body?.bookmakers || []) {
            for (const m of book.markets || []) {
              const stat = MARKET_STAT[m.key]
              if (!stat) continue
              const pairs = new Map<string, { over?: number; under?: number; name: string; point: number }>()
              for (const o of m.outcomes || []) {
                const name = String(o.description || '')
                const point = Number(o.point)
                const price = Number(o.price)
                if (!name || !Number.isFinite(point) || !Number.isFinite(price)) continue
                const k = `${name}|${point}`
                const pair = pairs.get(k) || { name, point }
                if (String(o.name) === 'Over') pair.over = implied(price)
                else if (String(o.name) === 'Under') pair.under = implied(price)
                pairs.set(k, pair)
              }
              for (const p of pairs.values()) {
                if (p.over == null || p.under == null) continue
                const k = `${nameKey(p.name)}|${stat}|${p.point}`
                const entry = lines.get(k) || { name: p.name, stat, point: p.point, fair: [] }
                entry.fair.push(p.over / (p.over + p.under))
                lines.set(k, entry)
              }
            }
          }
          // Main line per player + stat: the point the most books post (ties: nearer 50%).
          const best = new Map<string, { name: string; stat: string; point: number; p: number; books: number }>()
          for (const v of lines.values()) {
            const p = v.fair.reduce((a, x) => a + x, 0) / v.fair.length
            const k = `${nameKey(v.name)}|${v.stat}`
            const cur = best.get(k)
            if (!cur || v.fair.length > cur.books || (v.fair.length === cur.books && Math.abs(p - 0.5) < Math.abs(cur.p - 0.5))) {
              best.set(k, { name: v.name, stat: v.stat, point: v.point, p, books: v.fair.length })
            }
          }
          for (const v of best.values()) {
            const prop: NbaBookProp = {
              stat: v.stat,
              label: `${Math.floor(v.point) + 1}+ ${STAT_WORD[v.stat]}`,
              price: Math.round(v.p * 100) / 100,
              no: Math.round((1 - v.p) * 100) / 100,
              books: v.books,
            }
            for (const team of teams) (out[`${nameKey(v.name)}|${team}|${date}`] ||= []).push(prop)
          }
        }),
      )
      return out
    },
  ).catch(() => ({}))
}
