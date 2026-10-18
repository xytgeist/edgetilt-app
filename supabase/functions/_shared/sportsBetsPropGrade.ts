/**
 * Auto-grade open NFL player props (`market = 'prop'`) from ESPN final box scores.
 *
 * Prediction-market strikes ("75+" on Kalshi / Polymarket, saved as line 75) are inclusive: Yes wins at
 * exactly 75 and nothing pushes. Sportsbook lines push on an exact hit. A player missing from the box
 * (DNP, inactive, name we cannot match) or a stat we do not track stays open for a manual grade.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { espnDateKeysFromCommence } from './loungeBotEspnSummary.ts'

const ESPN_NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const HEADERS = { Accept: 'application/json', 'User-Agent': 'EdgeTilt-sports-bets-grade/1.0' }
/** Kickoff + this before grading, so ESPN's post-game stat corrections land first. */
const MIN_AFTER_KICK_MS = 5 * 3600_000
const PREDICTION_BOOKS = /\b(kalshi|polymarket|poly)\b/i

export type PropStatKey =
  | 'pass_yds'
  | 'pass_td'
  | 'pass_int'
  | 'pass_cmp'
  | 'pass_att'
  | 'rush_yds'
  | 'rush_att'
  | 'rec'
  | 'rec_yds'
  | 'rr_yds'
  | 'td'
  | 'rec_lng'

/** Same reading as the app's `sportsBetPropStatKey` (sportsBetApi.js) … keep the two in step. */
export function propStatKey(text: string | null | undefined): PropStatKey | null {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  if (/rush(ing)?\s*(and|\+|&)\s*rec/.test(t) || /scrim(mage)?\s*(yds|yards)/.test(t)) return 'rr_yds'
  if (/long(est)?\s*rec/.test(t)) return 'rec_lng'
  if (/fantasy|fpts/.test(t)) return null
  if (/pass(ing)?\s*(yds|yards)/.test(t)) return 'pass_yds'
  if (/pass(ing)?\s*(td|touchdown)/.test(t)) return 'pass_td'
  if (/\bint(erception)?s?\b/.test(t)) return 'pass_int'
  if (/comp(letion)?s?\b/.test(t)) return 'pass_cmp'
  if (/pass(ing)?\s*att/.test(t)) return 'pass_att'
  if (/rush(ing)?\s*(yds|yards)/.test(t)) return 'rush_yds'
  if (/rush(ing)?\s*att|carries/.test(t)) return 'rush_att'
  if (/rec(eiving)?\s*(yds|yards)/.test(t)) return 'rec_yds'
  if (/\brec(eption)?s?\b/.test(t)) return 'rec'
  if (/\btd\b|touchdown/.test(t)) return 'td'
  return null
}

export function isNflPropBet(bet: { market?: string | null; sport_key?: string | null; sport_label?: string | null }) {
  if (String(bet?.market || '') !== 'prop') return false
  const sk = `${bet?.sport_key || ''} ${bet?.sport_label || ''}`.toLowerCase()
  return sk.includes('americanfootball_nfl') || /\bnfl\b/.test(sk)
}

export function propIsInclusive(book: string | null | undefined, line: number): boolean {
  return PREDICTION_BOOKS.test(String(book || '')) && Number.isInteger(line)
}

export function gradePropValue(
  value: number,
  line: number,
  over: boolean,
  inclusive: boolean,
): 'won' | 'lost' | 'push' {
  if (inclusive) return (over ? value >= line : value < line) ? 'won' : 'lost'
  if (value === line) return 'push'
  return (over ? value > line : value < line) ? 'won' : 'lost'
}

export function nameKey(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** "D. Adams" / "D.Adams" → { initial: 'd', last: 'adams' }. Null when the name is not abbreviated. */
function initialLast(name: string): { initial: string; last: string } | null {
  const m = String(name || '').trim().match(/^([A-Za-z])(?:\.\s*|\s+)(\S.*)$/)
  if (!m) return null
  const last = nameKey(m[2])
  return last ? { initial: m[1].toLowerCase(), last } : null
}

export type BoxPlayer = { name: string; team: string; line: Record<string, number> }

function num(value: unknown): number {
  const n = Number(String(value ?? '').replace(/^\+/, ''))
  return Number.isFinite(n) ? n : 0
}

/** Every athlete listed in the ESPN summary box (any group), with the counting stats props use. */
export function nflBoxPlayers(summary: Record<string, unknown>): BoxPlayer[] {
  const box = (summary?.boxscore && typeof summary.boxscore === 'object') ? summary.boxscore as Record<string, unknown> : {}
  const teams = Array.isArray(box.players) ? box.players as Array<Record<string, unknown>> : []
  const out = new Map<string, BoxPlayer>()
  for (const t of teams) {
    const team = (t.team && typeof t.team === 'object') ? t.team as Record<string, unknown> : {}
    const abbrev = String(team.abbreviation || '').toUpperCase()
    for (const g of Array.isArray(t.statistics) ? t.statistics as Array<Record<string, unknown>> : []) {
      const group = String(g.name || '')
      const keys = Array.isArray(g.keys) ? (g.keys as unknown[]).map(String) : []
      for (const a of Array.isArray(g.athletes) ? g.athletes as Array<Record<string, unknown>> : []) {
        const ath = (a.athlete && typeof a.athlete === 'object') ? a.athlete as Record<string, unknown> : {}
        const id = String(ath.id || '')
        const name = String(ath.displayName || '')
        if (!id || !name) continue
        const row = out.get(id) || { name, team: abbrev, line: {} }
        out.set(id, row)
        const stats = Array.isArray(a.stats) ? a.stats as unknown[] : []
        const val = (key: string) => stats[keys.indexOf(key)]
        const add = (key: string, v: number) => {
          row.line[key] = (row.line[key] || 0) + v
        }
        if (group === 'passing') {
          const ca = String(val('completions/passingAttempts') ?? '').match(/^(\d+)\s*\/\s*(\d+)$/)
          if (ca) {
            add('pass_cmp', Number(ca[1]))
            add('pass_att', Number(ca[2]))
          }
          add('pass_yds', num(val('passingYards')))
          add('pass_td', num(val('passingTouchdowns')))
          add('pass_int', num(val('interceptions')))
        } else if (group === 'rushing') {
          add('rush_att', num(val('rushingAttempts')))
          add('rush_yds', num(val('rushingYards')))
          add('rush_td', num(val('rushingTouchdowns')))
        } else if (group === 'receiving') {
          add('rec', num(val('receptions')))
          add('rec_yds', num(val('receivingYards')))
          add('rec_td', num(val('receivingTouchdowns')))
          row.line.rec_lng = Math.max(row.line.rec_lng || 0, num(val('longReception')))
        } else if (group === 'kickReturns') {
          add('ret_td', num(val('kickReturnTouchdowns')))
        } else if (group === 'puntReturns') {
          add('ret_td', num(val('puntReturnTouchdowns')))
        }
      }
    }
  }
  return [...out.values()]
}

export function propStatValue(line: Record<string, number>, key: PropStatKey): number {
  const n = (k: string) => line[k] || 0
  if (key === 'rr_yds') return n('rush_yds') + n('rec_yds')
  if (key === 'td') return n('rush_td') + n('rec_td') + n('ret_td')
  return n(key)
}

export function findBoxPlayer(players: BoxPlayer[], name: string): BoxPlayer | null {
  const key = nameKey(name)
  if (!key) return null
  const exact = players.filter((p) => nameKey(p.name) === key)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const short = initialLast(name)
  if (!short) return null
  const hits = players.filter((p) => {
    const parts = String(p.name).trim().split(/\s+/)
    const first = (parts[0] || '').charAt(0).toLowerCase()
    return first === short.initial && nameKey(parts.slice(1).join(' ')) === short.last
  })
  return hits.length === 1 ? hits[0] : null
}

type NflEvent = {
  id: string
  final: boolean
  kickoffMs: number
  teams: Array<{ keys: string[] }>
}

function teamKeys(team: Record<string, unknown>): string[] {
  const keys = [team.abbreviation, team.displayName, team.shortDisplayName, team.name, team.location]
    .map((v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
  const abbr = String(team.abbreviation || '').toUpperCase()
  const alias: Record<string, string> = { WSH: 'was', JAX: 'jac', LAR: 'la' }
  if (alias[abbr]) keys.push(alias[abbr])
  return keys
}

function teamMatches(event: NflEvent, label: string | null | undefined): boolean {
  const k = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!k) return false
  return event.teams.some((t) => t.keys.includes(k) || t.keys.some((x) => x.length >= 4 && k.endsWith(x)))
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`ESPN ${res.status}`)
  return await res.json() as Record<string, unknown>
}

function parseEvents(pack: Record<string, unknown>): NflEvent[] {
  const out: NflEvent[] = []
  for (const ev of Array.isArray(pack.events) ? pack.events as Array<Record<string, unknown>> : []) {
    const comp = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0]
    const status = ((comp?.status || ev.status) as Record<string, unknown> | undefined)?.type as Record<string, unknown> | undefined
    const final = Boolean(status?.completed) || String(status?.state || '') === 'post'
    const teams = (Array.isArray(comp?.competitors) ? comp!.competitors as Array<Record<string, unknown>> : [])
      .map((c) => ({ keys: teamKeys((c.team && typeof c.team === 'object') ? c.team as Record<string, unknown> : {}) }))
    out.push({ id: String(ev.id || ''), final, kickoffMs: Date.parse(String(ev.date || '')), teams })
  }
  return out.filter((e) => e.id && e.teams.length === 2)
}

export type PropBetRow = {
  id: string
  sport_key: string | null
  sport_label?: string | null
  home_team: string | null
  away_team: string | null
  commence_time: string | null
  market: string
  side: string | null
  selection_label: string
  line: number | null
  player_name: string | null
  prop_stat: string | null
  book: string | null
}

function sideIsOver(bet: PropBetRow): boolean | null {
  if (bet.side === 'over') return true
  if (bet.side === 'under') return false
  if (/\b(over|yes)\b/i.test(bet.selection_label)) return true
  if (/\b(under|no)\b/i.test(bet.selection_label)) return false
  return null
}

/**
 * Settle a batch of open NFL prop rows. Returns id → status for the ones that settled.
 * ESPN fetches are shared across the batch (one scoreboard per date, one summary per game).
 */
export async function gradeNflPropRows(
  rows: PropBetRow[],
  nowMs = Date.now(),
): Promise<{ graded: Map<string, 'won' | 'lost' | 'push'>; errors: string[] }> {
  const graded = new Map<string, 'won' | 'lost' | 'push'>()
  const errors: string[] = []
  const ready = rows.filter((bet) => {
    if (!isNflPropBet(bet) || !bet.player_name || bet.line == null || !propStatKey(bet.prop_stat)) return false
    const kick = Date.parse(String(bet.commence_time || ''))
    return Number.isFinite(kick) && kick + MIN_AFTER_KICK_MS <= nowMs
  })
  if (!ready.length) return { graded, errors }

  const dates = new Set<string>()
  for (const bet of ready) for (const d of espnDateKeysFromCommence(bet.commence_time, nowMs)) dates.add(d)
  const events = new Map<string, NflEvent>()
  for (const d of [...dates].slice(0, 10)) {
    try {
      for (const ev of parseEvents(await fetchJson(`${ESPN_NFL}/scoreboard?dates=${d}`))) events.set(ev.id, ev)
    } catch (err) {
      errors.push(`ESPN scoreboard ${d}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const boxes = new Map<string, BoxPlayer[] | null>()
  const boxFor = async (eventId: string) => {
    if (boxes.has(eventId)) return boxes.get(eventId) || null
    try {
      const players = nflBoxPlayers(await fetchJson(`${ESPN_NFL}/summary?event=${encodeURIComponent(eventId)}`))
      boxes.set(eventId, players)
      return players
    } catch (err) {
      boxes.set(eventId, null)
      errors.push(`ESPN summary ${eventId}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  for (const bet of ready) {
    const kick = Date.parse(String(bet.commence_time || ''))
    const near = [...events.values()].filter((ev) => Number.isFinite(ev.kickoffMs) && Math.abs(ev.kickoffMs - kick) <= 18 * 3600_000)
    let candidates = near
    if (bet.home_team && bet.away_team) {
      candidates = near.filter((ev) => teamMatches(ev, bet.home_team) && teamMatches(ev, bet.away_team))
      if (candidates.length !== 1) continue
    }
    let player: BoxPlayer | null = null
    let finalGame = false
    for (const ev of candidates) {
      if (!ev.final) continue
      const players = await boxFor(ev.id)
      const hit = players ? findBoxPlayer(players, String(bet.player_name)) : null
      if (!hit) continue
      if (player) {
        player = null
        break
      }
      player = hit
      finalGame = true
    }
    if (!player || !finalGame) continue

    const over = sideIsOver(bet)
    const stat = propStatKey(bet.prop_stat)
    const line = Number(bet.line)
    if (over == null || !stat || !Number.isFinite(line)) continue
    const value = propStatValue(player.line, stat)
    graded.set(bet.id, gradePropValue(value, line, over, propIsInclusive(bet.book, line)))
  }
  return { graded, errors }
}

export async function loadOpenNflPropRows(
  admin: SupabaseClient,
  opts: { userId?: string } = {},
): Promise<{ bets: Array<PropBetRow & { stake_units: number; odds: number }>; legs: Array<PropBetRow & { bet_id: string }>; errors: string[] }> {
  const errors: string[] = []
  let q = admin
    .from('sports_bets')
    .select('id, sport_key, sport_label, home_team, away_team, commence_time, market, side, selection_label, line, odds, stake_units, player_name, prop_stat, book')
    .eq('status', 'open')
    .eq('market', 'prop')
    .not('player_name', 'is', null)
    .not('line', 'is', null)
    .limit(500)
  if (opts.userId) q = q.eq('user_id', opts.userId)
  const { data, error } = await q
  if (error) errors.push(`props: ${error.message}`)
  const bets = ((data || []) as Array<PropBetRow & { stake_units: number; odds: number }>).filter(isNflPropBet)

  let legQ = admin
    .from('sports_bet_legs')
    .select('id, bet_id, sport_key, sport_label, home_team, away_team, commence_time, market, side, selection_label, line, player_name, prop_stat')
    .eq('status', 'open')
    .eq('market', 'prop')
    .not('player_name', 'is', null)
    .not('line', 'is', null)
    .limit(500)
  if (opts.userId) legQ = legQ.eq('user_id', opts.userId)
  const { data: legData, error: legErr } = await legQ
  if (legErr && !/relation|schema cache|does not exist/i.test(legErr.message || '')) errors.push(`prop legs: ${legErr.message}`)
  const rawLegs = ((!legErr && legData) ? legData : []) as Array<Omit<PropBetRow, 'book'> & { bet_id: string }>
  const nflLegs = rawLegs.filter(isNflPropBet)

  const books = new Map<string, string | null>()
  const parentIds = [...new Set(nflLegs.map((l) => l.bet_id))]
  if (parentIds.length) {
    const { data: parents } = await admin.from('sports_bets').select('id, book').in('id', parentIds)
    for (const p of (parents || []) as Array<{ id: string; book: string | null }>) books.set(p.id, p.book)
  }
  const legs = nflLegs.map((l) => ({ ...l, book: books.get(l.bet_id) ?? null }))
  return { bets, legs, errors }
}
