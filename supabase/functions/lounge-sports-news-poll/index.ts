/**
 * Lounge NFL news bot (`jordan-pike`, pipeline sports_news). pg_cron every 5 min; admin / service role may send
 * { dryRun: true, lookbackHours?: number, poolHours?: number } to see what it would post, or { force: true } to run while stopped.
 *
 * Pool: the same insider batch the Fantasy news tab shows (status = show), scored and capped at the bot's
 * per-hour / per-day limits (quiet 12-8am ET). Lanes label each post for pills and follow-ups:
 *   status      player availability / news (fantasy_insider_news next_status, kind status / role / other)
 *   qb          news about a starting QB or who starts at QB
 *   in_game     a player hurt during a game (insider kind in_game)
 *   transaction trades / signings / releases
 *   inactives   one "key absences" roundup per kickoff window, 55-85 min before kick (ESPN designations)
 *   line_move   follow-up when the spread moves 1+ pts within 3h of a status / qb post
 *   bundle      near-miss items (score 35+, or fresh news that missed a slot) roll into one roundup post: a game's
 *               notes when 2+ share a game, else a mixed roundup; posts at 3 items or once 2 have waited 3h
 * Game pill: always on inactives + line_move; on status / qb / in_game and roundups (a game's notes, or up to 3 of a
 * mixed roundup's games) when the team's game is this week, while the day's pill budget (~40% of the daily cap) lasts;
 * never on transactions. Roundups post as one line per item, worst status first.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { publishLoungeBotPost } from '../_shared/loungeBotPublish.ts'
import { cachedLoungeSportsScoreboard, type LoungeSportsGame } from '../_shared/loungeSportsScoreboard.ts'

const SLUG = 'jordan-pike'
const NFL = 'americanfootball_nfl'
const DEFAULT_THRESHOLD = 55
const PILL_SHARE = 0.4
/** Pills show the team's game for the week (the board carries the current NFL week). */
const PILL_WINDOW_H = 7 * 24
const ROUNDUP_PILLS_MAX = 3
const LOOKBACK_OVERLAP_MS = 2 * 60 * 1000
const FIRST_RUN_LOOKBACK_MS = 30 * 60 * 1000
const LINE_WATCH_MS = 3 * 60 * 60 * 1000
const LINE_MIN_MOVE = 1
const INACTIVES_FROM_MIN = 55
const INACTIVES_TO_MIN = 85
const QUIET_BEFORE_ET_HOUR = 8
/** A single post needs fresh news; older or near-miss items wait in the roundup pool instead. */
const SINGLE_FRESH_MS = 2 * 60 * 60 * 1000
const POOL_MS = 6 * 60 * 60 * 1000
const BUNDLE_FLOOR = 35
const BUNDLE_MIN = 3
const BUNDLE_WAIT_MS = 3 * 60 * 60 * 1000
const BUNDLE_MAX = 6
const BUNDLE_LANES = new Set(['status', 'qb', 'in_game', 'transaction'])
const TEAM_ALIAS: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' }

type Obj = Record<string, unknown>
type Player = { sleeper_id: string; full_name: string; position: string; team: string; search_rank: number }
type Tier = 'A' | 'B'
type Lane = 'status' | 'qb' | 'in_game' | 'transaction' | 'inactives' | 'line_move' | 'bundle'
type Candidate = {
  lane: Lane
  dedupeKey: string
  score: number
  caption: string
  tweetId?: string | null
  sleeperId?: string | null
  team?: string | null
  game?: LoungeSportsGame | null
  pillEventIds: string[]
  pillWanted: 'always' | 'near' | 'never'
  followRowId?: string
  headline?: string
  /** Insider next status (out / doubtful / questionable / cleared), orders roundup lines. */
  next?: string
  postedAt?: number
  /** Same-player items folded into this one in a roundup (claimed so they never post later). */
  alsoKeys?: string[]
}

type Bundle = { items: Candidate[]; caption: string; score: number; game: LoungeSportsGame | null; pillEventIds: string[] }

const str = (v: unknown) => String(v ?? '').trim()
const team = (v: unknown) => {
  const t = str(v).toUpperCase()
  return TEAM_ALIAS[t] || t
}

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false,
  })
  const m: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) m[p.type] = p.value
  return { date: `${m.year}-${m.month}-${m.day}`, hour: Number(m.hour) % 24, wd: m.weekday }
}

function etDayStartIso(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const m: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) m[p.type] = p.value
  const sinceMidnight = ((Number(m.hour) % 24) * 3600 + Number(m.minute) * 60 + Number(m.second)) * 1000
  return new Date(d.getTime() - sinceMidnight - d.getMilliseconds()).toISOString()
}

function kickLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))
    .replace(':00', '')
}

function fmtSpread(n: number): string {
  if (n === 0) return 'PK'
  return n > 0 ? `+${n}` : String(n)
}

let playerCache: { at: number; byId: Map<string, Player>; tier: Map<string, Tier>; qbStarter: Set<string> } | null = null

async function players(admin: SupabaseClient) {
  if (playerCache && Date.now() - playerCache.at < 6 * 60 * 60 * 1000) return playerCache
  const { data, error } = await admin
    .from('nfl_players')
    .select('sleeper_id, full_name, position, team, search_rank')
    .in('position', ['QB', 'RB', 'WR', 'TE'])
    .not('team', 'is', null)
    .not('search_rank', 'is', null)
    .order('search_rank', { ascending: true })
    .limit(3000)
  if (error) throw new Error(error.message)
  const list = (data || []).map((p) => ({
    sleeper_id: str(p.sleeper_id),
    full_name: str(p.full_name),
    position: str(p.position),
    team: team(p.team),
    search_rank: Number(p.search_rank),
  }))
  const byId = new Map(list.map((p) => [p.sleeper_id, p]))
  const tier = new Map<string, Tier>()
  const qbStarter = new Set<string>()
  const seenQbTeam = new Set<string>()
  const posRank: Record<string, number> = { RB: 0, WR: 0, TE: 0 }
  for (const p of list) {
    if (p.position === 'QB') {
      if (seenQbTeam.has(p.team)) continue
      seenQbTeam.add(p.team)
      qbStarter.add(p.sleeper_id)
      tier.set(p.sleeper_id, 'A')
      continue
    }
    const r = ++posRank[p.position]
    const [a, b] = p.position === 'TE' ? [6, 12] : [12, 24]
    if (r <= a) tier.set(p.sleeper_id, 'A')
    else if (r <= b) tier.set(p.sleeper_id, 'B')
  }
  playerCache = { at: Date.now(), byId, tier, qbStarter }
  return playerCache
}

function nflGames(games: LoungeSportsGame[]): LoungeSportsGame[] {
  return games.filter((g) => g.sport_key === NFL && g.status !== 'post')
}

/** The team's current or next game (live first, then soonest kickoff). */
function gameFor(games: LoungeSportsGame[], teamCode: string): LoungeSportsGame | null {
  const t = team(teamCode)
  const mine = games.filter((g) => team(g.home?.abbrev) === t || team(g.away?.abbrev) === t)
  const ahead = mine.filter((g) => g.status !== 'post')
  return mine.find((g) => g.status === 'in') || (ahead.length ? ahead : mine).sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))[0] || null
}

function hoursToKick(game: LoungeSportsGame | null): number | null {
  if (!game) return null
  return (Date.parse(game.commence_time) - Date.now()) / 3600_000
}

function proximity(game: LoungeSportsGame | null): number {
  const h = hoursToKick(game)
  if (game?.status === 'in') return 1
  if (h == null) return 0.7
  if (h <= 48) return 1
  if (h <= 96) return 0.85
  return 0.7
}

function newsCaption(row: Obj): string {
  return [str(row.headline), str(row.impact)].filter(Boolean).join('\n\n')
}

const CORE = new Set(['adamschefter', 'rapsheet', 'tompelissero', 'mikegarafolo', 'underdognfl', 'caplannfl'])

/** Weight of each kind of news in the Fantasy feed batch (next-game status first, then the insider kind). */
function newsWeight(next: string, kind: string, isQb: boolean): number {
  if (next === 'out' || next === 'ir') return 1
  if (isQb && (kind === 'role' || next === 'doubtful')) return 1
  if (kind === 'in_game') return 0.9
  if (next === 'doubtful') return 0.85
  if (kind === 'transaction') return 0.75
  if (next === 'cleared') return 0.7
  if (next === 'questionable') return 0.65
  return 0.55
}

/**
 * Same batch the Fantasy news tab shows (`fantasy_insider_news` status = show). Every row qualifies; the score
 * (news weight × player tier × source × game proximity) decides which fill the day's slots.
 */
function insiderCandidates(rows: Obj[], pc: NonNullable<typeof playerCache>, games: LoungeSportsGame[]): Candidate[] {
  const out: Candidate[] = []
  for (const row of rows) {
    const ids = Array.isArray(row.sleeper_ids) ? (row.sleeper_ids as unknown[]).map(str) : []
    const sid = str(row.status_sleeper_id) || ids.find((id) => pc.tier.has(id)) || ids.find((id) => pc.byId.has(id)) || ''
    const p = pc.byId.get(sid)
    if (!p) continue
    const tier = pc.tier.get(sid)
    const kind = str(row.kind)
    const next = str(row.next_status)
    const isQb = p.position === 'QB'
    const game = gameFor(games, p.team)
    const day = etParts(new Date(str(row.posted_at) || Date.now())).date
    const lane: Lane =
      kind === 'in_game' ? 'in_game'
        : kind === 'transaction' ? 'transaction'
          : isQb && (kind === 'role' || pc.qbStarter.has(sid)) ? 'qb'
            : 'status'
    const tierW = lane === 'qb' && (kind === 'role' || pc.qbStarter.has(sid)) ? 1 : tier === 'A' ? 1 : tier === 'B' ? 0.75 : 0.45
    const source = row.status_trusted === true || CORE.has(str(row.handle).toLowerCase()) ? 1 : 0.85
    const prox = lane === 'transaction' ? 1 : proximity(game)
    const near = pillable(game)
    out.push({
      lane,
      dedupeKey: `news:${sid}:${next || kind || 'news'}:${lane === 'transaction' ? day : game?.id || day}`,
      score: Math.round(100 * newsWeight(next, kind, isQb) * tierW * source * prox),
      caption: newsCaption(row),
      tweetId: str(row.tweet_id) || null,
      sleeperId: sid,
      team: p.team,
      game,
      pillEventIds: game && lane !== 'transaction' && near ? [game.id] : [],
      pillWanted: lane === 'transaction' ? 'never' : 'near',
      headline: str(row.headline),
      next,
      postedAt: Date.parse(str(row.posted_at)) || Date.now(),
    })
  }
  return out
}

function pillable(game: LoungeSportsGame | null): boolean {
  if (!game || game.status === 'post') return false
  const h = hoursToKick(game)
  return game.status === 'in' || (h != null && h >= -4 && h <= PILL_WINDOW_H)
}

/** Worst news first in a roundup: out, then doubtful, questionable / limited, then cleared and the rest. */
function severity(c: Candidate): number {
  const n = String(c.next || '')
  const h = String(c.headline || '').toLowerCase()
  if (n === 'out' || /\b(ruled out|out for|misses|did not practice|placed on ir|out\b)/.test(h)) return 0
  if (n === 'doubtful' || /doubtful/.test(h)) return 1
  if (n === 'questionable' || /questionable|limited/.test(h)) return 2
  return 3
}

function bundleReady(items: Candidate[]): boolean {
  if (items.length >= BUNDLE_MIN) return true
  const oldest = Math.min(...items.map((c) => c.postedAt || Date.now()))
  return items.length >= 2 && Date.now() - oldest >= BUNDLE_WAIT_MS
}

/** One post for several near-miss items: a game's notes when 2+ share a game, else a mixed roundup. */
function buildBundle(rawPool: Candidate[]): Bundle | null {
  const best = new Map<string, Candidate>()
  for (const c of [...rawPool].sort((a, b) => b.score - a.score)) {
    const who = c.sleeperId || c.dedupeKey
    const kept = best.get(who)
    if (kept) kept.alsoKeys = [...(kept.alsoKeys || []), c.dedupeKey]
    else best.set(who, { ...c, alsoKeys: [] })
  }
  const pool = [...best.values()]
  if (pool.length < 2) return null
  const byGame = new Map<string, Candidate[]>()
  for (const c of pool) if (c.game) byGame.set(c.game.id, [...(byGame.get(c.game.id) || []), c])
  const top = (list: Candidate[]) => [...list].sort((a, b) => b.score - a.score).slice(0, BUNDLE_MAX)
  const gameGroup = [...byGame.values()].filter((g) => g.length >= 2 && bundleReady(g)).sort((a, b) => b.length - a.length)[0]
  const items = gameGroup ? top(gameGroup) : bundleReady(pool) ? top(pool) : null
  if (!items) return null
  const game = gameGroup ? items[0].game || null : null
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date())
  const header = game
    ? `${str(game.away?.abbrev)} at ${str(game.home?.abbrev)} notes`
    : items.every((c) => /practice/i.test(c.headline || '')) ? `${weekday} practice notes` : 'NFL news roundup'
  const lines = [...items]
    .sort((a, b) => severity(a) - severity(b) || b.score - a.score)
    .map((c) => (c.headline ? `• ${c.headline}` : ''))
    .filter(Boolean)
  // A game's notes pill that game; a mixed roundup pills the games of its top items (this week only).
  const pillGames = game
    ? [game]
    : [...items].sort((a, b) => b.score - a.score).map((c) => c.game).filter((g): g is LoungeSportsGame => Boolean(g))
  const pillEventIds = [...new Set(pillGames.filter(pillable).map((g) => g.id))].slice(0, ROUNDUP_PILLS_MAX)
  return {
    items,
    caption: `${header}\n\n${lines.join('\n')}`,
    score: Math.max(...items.map((c) => c.score)),
    game,
    pillEventIds,
  }
}

async function inactivesCandidates(admin: SupabaseClient, pc: NonNullable<typeof playerCache>, games: LoungeSportsGame[]): Promise<Candidate[]> {
  const now = Date.now()
  const windows = new Map<string, LoungeSportsGame[]>()
  for (const g of games) {
    if (g.status !== 'pre') continue
    const mins = (Date.parse(g.commence_time) - now) / 60_000
    if (mins < INACTIVES_FROM_MIN || mins > INACTIVES_TO_MIN) continue
    const list = windows.get(g.commence_time) || []
    list.push(g)
    windows.set(g.commence_time, list)
  }
  if (!windows.size) return []
  const teams = [...windows.values()].flat().flatMap((g) => [team(g.home?.abbrev), team(g.away?.abbrev)])
  const { data } = await admin
    .from('nfl_player_status')
    .select('sleeper_id, name, team, status, injury')
    .in('status', ['out', 'doubtful', 'ir'])
    .not('sleeper_id', 'is', null)
  const rows = (data || []).filter((r) => teams.includes(team(r.team)) && pc.tier.has(str(r.sleeper_id)))
  const out: Candidate[] = []
  for (const [kick, slate] of windows) {
    const slateTeams = new Set(slate.flatMap((g) => [team(g.home?.abbrev), team(g.away?.abbrev)]))
    const absent = rows
      .filter((r) => slateTeams.has(team(r.team)) && str(r.status) !== 'doubtful')
      .map((r) => ({ r, p: pc.byId.get(str(r.sleeper_id))! }))
      .filter((x) => x.p)
      .sort((a, b) => a.p.search_rank - b.p.search_rank)
      .slice(0, 6)
    if (!absent.length) continue
    const lines = absent.map(({ r, p }) => `• ${p.full_name} (${p.team}${str(r.injury) ? `, ${str(r.injury).toLowerCase()}` : ''}) out`)
    const eventIds = slate
      .filter((g) => absent.some(({ p }) => team(g.home?.abbrev) === p.team || team(g.away?.abbrev) === p.team))
      .map((g) => g.id)
      .slice(0, 4)
    out.push({
      lane: 'inactives',
      dedupeKey: `inactives:${kick}`,
      score: 90,
      caption: `Key absences for the ${kickLabel(kick)} ET kickoff${slate.length > 1 ? 's' : ''}:\n\n${lines.join('\n')}`,
      pillEventIds: eventIds,
      pillWanted: 'always',
    })
  }
  return out
}

async function lineMoveCandidates(admin: SupabaseClient, botUserId: string, games: LoungeSportsGame[], pc: NonNullable<typeof playerCache>): Promise<{ candidates: Candidate[]; expired: string[] }> {
  const since = new Date(Date.now() - LINE_WATCH_MS).toISOString()
  const { data } = await admin
    .from('lounge_sports_news_posts')
    .select('id, event_id, sleeper_id, spread_home_at_post, created_at')
    .eq('bot_user_id', botUserId)
    .in('lane', ['status', 'qb'])
    .not('post_id', 'is', null)
    .not('event_id', 'is', null)
    .not('spread_home_at_post', 'is', null)
    .is('line_followed_at', null)
    .order('created_at', { ascending: false })
    .limit(30)
  const candidates: Candidate[] = []
  const expired: string[] = []
  for (const row of data || []) {
    const game = games.find((g) => g.id === str(row.event_id))
    if (!game || game.status !== 'pre' || str(row.created_at) < since) {
      expired.push(str(row.id))
      continue
    }
    const at = Number(row.spread_home_at_post)
    const cur = Number(game.home?.spread)
    if (!Number.isFinite(at) || !Number.isFinite(cur) || Math.abs(cur - at) < LINE_MIN_MOVE) continue
    const p = pc.byId.get(str(row.sleeper_id))
    const home = str(game.home?.abbrev)
    candidates.push({
      lane: 'line_move',
      dedupeKey: `line:${game.id}:${str(row.sleeper_id)}`,
      score: 95,
      caption:
        `Line move: ${str(game.away?.abbrev)} at ${home} is now ${home} ${fmtSpread(cur)}, from ${fmtSpread(at)} when the ` +
        `${p ? `${p.full_name} ` : ''}news broke.`,
      sleeperId: str(row.sleeper_id) || null,
      team: p?.team || null,
      game,
      pillEventIds: [game.id],
      pillWanted: 'always',
      followRowId: str(row.id),
    })
  }
  return { candidates, expired }
}

async function countPublished(admin: SupabaseClient, botUserId: string, sinceIso: string): Promise<number> {
  const { count } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .gte('created_at', sinceIso)
  return count || 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })
  try {
    const admin = await authorizeServiceRoleOrAdmin(req)
    const body = await req.json().catch(() => ({})) as Obj
    const dryRun = body.dryRun === true
    const force = body.force === true

    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select('user_id, slug, run_state, category_pills_default, max_posts_per_day, max_posts_per_hour, publish_score_threshold, last_poll_at')
      .eq('slug', SLUG)
      .maybeSingle()
    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bot?.user_id) return adminOpsJson(200, { ok: true, skipped: 'no bot' })
    if (bot.run_state !== 'running' && !dryRun && !force) return adminOpsJson(200, { ok: true, skipped: bot.run_state || 'stopped' })

    const threshold = Number(bot.publish_score_threshold) || DEFAULT_THRESHOLD
    const dayCap = Number(bot.max_posts_per_day) || 10
    const hourCap = Number(bot.max_posts_per_hour) || 2
    const lookbackMs = Number(body.lookbackHours) > 0
      ? Number(body.lookbackHours) * 3600_000
      : bot.last_poll_at
        ? Math.max(LOOKBACK_OVERLAP_MS, Date.now() - Date.parse(String(bot.last_poll_at)) + LOOKBACK_OVERLAP_MS)
        : FIRST_RUN_LOOKBACK_MS
    // Dry runs may widen the roundup pool to replay older news.
    const poolMs = dryRun && Number(body.poolHours) > 0 ? Number(body.poolHours) * 3600_000 : POOL_MS
    const since = new Date(Date.now() - Math.max(lookbackMs, poolMs)).toISOString()

    const [pc, board] = await Promise.all([players(admin), cachedLoungeSportsScoreboard(admin, 60_000)])
    const games = nflGames(board.games || [])

    const { data: newsRows, error: newsErr } = await admin
      .from('fantasy_insider_news')
      .select('tweet_id, handle, author_name, posted_at, headline, impact, kind, sleeper_ids, next_status, status_sleeper_id, status_trusted')
      .eq('status', 'show')
      .eq('sport', 'nfl')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(80)
    if (newsErr) return adminOpsJson(500, { error: newsErr.message })

    const lines = await lineMoveCandidates(admin, bot.user_id, games, pc)
    const all = [
      ...insiderCandidates(newsRows || [], pc, games),
      ...(await inactivesCandidates(admin, pc, games)),
      ...lines.candidates,
    ]

    // Best candidate per dedupe key, then drop keys already posted.
    const byKey = new Map<string, Candidate>()
    for (const c of all) if (!byKey.has(c.dedupeKey) || byKey.get(c.dedupeKey)!.score < c.score) byKey.set(c.dedupeKey, c)
    const keys = [...byKey.keys()]
    const { data: seen } = keys.length
      ? await admin.from('lounge_sports_news_posts').select('dedupe_key').in('dedupe_key', keys)
      : { data: [] }
    const seenKeys = new Set((seen || []).map((r) => str(r.dedupe_key)))
    const fresh = (c: Candidate) => !c.postedAt || Date.now() - c.postedAt <= SINGLE_FRESH_MS
    const ranked = [...byKey.values()]
      .filter((c) => !seenKeys.has(c.dedupeKey) && c.score >= threshold && fresh(c))
      .sort((a, b) => b.score - a.score)

    const dayStart = etDayStartIso()
    const [postedHour, postedDay] = await Promise.all([
      countPublished(admin, bot.user_id, new Date(Date.now() - 3600_000).toISOString()),
      countPublished(admin, bot.user_id, dayStart),
    ])
    const { count: pillsToday } = await admin
      .from('lounge_sports_news_posts')
      .select('id', { count: 'exact', head: true })
      .eq('bot_user_id', bot.user_id)
      .eq('pill', true)
      .not('post_id', 'is', null)
      .gte('created_at', dayStart)
    const quiet = etParts().hour < QUIET_BEFORE_ET_HOUR
    let budget = quiet ? 0 : Math.max(0, Math.min(hourCap - postedHour, dayCap - postedDay))
    let pills = pillsToday || 0
    const pillBudget = Math.max(1, Math.round(PILL_SHARE * dayCap))

    const plan = ranked.map((c) => {
      const pill = c.pillEventIds.length > 0 && (c.pillWanted === 'always' || (c.pillWanted === 'near' && pills < pillBudget))
      const publish = budget > 0
      if (publish) {
        budget -= 1
        if (pill) pills += 1
      }
      return { c, pill, publish }
    })

    const singleKeys = new Set(plan.filter((x) => x.publish).map((x) => x.c.dedupeKey))
    const pool = [...byKey.values()].filter((c) =>
      BUNDLE_LANES.has(c.lane) && c.postedAt && !seenKeys.has(c.dedupeKey) && !singleKeys.has(c.dedupeKey) &&
      c.score >= BUNDLE_FLOOR && Date.now() - c.postedAt <= poolMs)
    const bundle = buildBundle(pool)
    const bundlePill = Boolean(bundle?.pillEventIds.length) && pills < pillBudget
    const bundlePublish = Boolean(bundle) && budget > 0
    if (bundlePublish) budget -= 1

    if (dryRun) {
      return adminOpsJson(200, {
        ok: true,
        dryRun: true,
        since,
        quiet,
        caps: { postedHour, postedDay, hourCap, dayCap, pillsToday, pillBudget, threshold },
        considered: all.length,
        plan: plan.map(({ c, pill, publish }) => ({
          lane: c.lane, score: c.score, publish, pill, pill_event_ids: pill ? c.pillEventIds : [], caption: c.caption, key: c.dedupeKey,
        })),
        below_threshold: [...byKey.values()]
          .filter((c) => !seenKeys.has(c.dedupeKey) && c.score < threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, 15)
          .map((c) => ({ lane: c.lane, score: c.score, caption: c.caption.split('\n')[0] })),
        pool: pool.length,
        bundle: bundle
          ? { publish: bundlePublish, pill: bundlePill, items: bundle.items.length, score: bundle.score, caption: bundle.caption }
          : null,
      })
    }

    const published: Obj[] = []
    for (const { c, pill, publish } of plan) {
      if (!publish) break
      const spreadAtPost = c.game && (c.lane === 'status' || c.lane === 'qb') && c.game.status === 'pre' ? Number(c.game.home?.spread) : null
      const { data: claim, error: claimErr } = await admin
        .from('lounge_sports_news_posts')
        .insert({
          bot_user_id: bot.user_id,
          lane: c.lane,
          dedupe_key: c.dedupeKey,
          tweet_id: c.tweetId || null,
          sleeper_id: c.sleeperId || null,
          team: c.team || null,
          event_id: c.game?.id || c.pillEventIds[0] || null,
          score: c.score,
          pill,
          spread_home_at_post: Number.isFinite(spreadAtPost) ? spreadAtPost : null,
          caption: c.caption,
        })
        .select('id')
        .single()
      if (claimErr || !claim?.id) continue
      const result = await publishLoungeBotPost(admin, {
        botUserId: bot.user_id,
        caption: c.caption,
        categoryPills: bot.category_pills_default?.length ? bot.category_pills_default : ['sports'],
        sportsGameEventIds: pill ? c.pillEventIds : [],
        keepLines: true,
      })
      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: bot.user_id,
        post_id: result.postId,
        caption: c.caption,
        score: c.score,
        status: result.postId ? 'published' : 'failed',
        error_message: result.error,
        post_kind: `sports_news_${c.lane}`,
      })
      if (result.postId) {
        await admin.from('lounge_sports_news_posts').update({ post_id: result.postId }).eq('id', claim.id)
        if (c.followRowId) await admin.from('lounge_sports_news_posts').update({ line_followed_at: new Date().toISOString() }).eq('id', c.followRowId)
        published.push({ lane: c.lane, post_id: result.postId, pill })
      }
    }
    if (bundle && bundlePublish) {
      const { data: claimed } = await admin
        .from('lounge_sports_news_posts')
        .upsert(
          bundle.items.flatMap((c, i) => [c.dedupeKey, ...(c.alsoKeys || [])].map((key, j) => ({
            bot_user_id: bot.user_id,
            lane: 'bundle',
            dedupe_key: key,
            tweet_id: j === 0 ? c.tweetId || null : null,
            sleeper_id: c.sleeperId || null,
            team: c.team || null,
            event_id: c.game?.id || null,
            score: c.score,
            pill: i === 0 && j === 0 && bundlePill,
            caption: i === 0 && j === 0 ? bundle.caption : '',
          }))),
          { onConflict: 'dedupe_key', ignoreDuplicates: true },
        )
        .select('id')
      const ids = (claimed || []).map((r) => str(r.id))
      if (ids.length >= 2) {
        const result = await publishLoungeBotPost(admin, {
          botUserId: bot.user_id,
          caption: bundle.caption,
          categoryPills: bot.category_pills_default?.length ? bot.category_pills_default : ['sports'],
          sportsGameEventIds: bundlePill ? bundle.pillEventIds : [],
          keepLines: true,
        })
        await admin.from('lounge_bot_publish_log').insert({
          bot_user_id: bot.user_id,
          post_id: result.postId,
          caption: bundle.caption,
          score: bundle.score,
          status: result.postId ? 'published' : 'failed',
          error_message: result.error,
          post_kind: 'sports_news_bundle',
        })
        if (result.postId) {
          await admin.from('lounge_sports_news_posts').update({ post_id: result.postId }).in('id', ids)
          published.push({ lane: 'bundle', post_id: result.postId, pill: bundlePill, items: ids.length })
        }
      } else if (ids.length) {
        await admin.from('lounge_sports_news_posts').delete().in('id', ids)
      }
    }
    if (lines.expired.length) {
      await admin.from('lounge_sports_news_posts').update({ line_followed_at: new Date().toISOString() }).in('id', lines.expired)
    }
    await admin
      .from('lounge_bot_accounts')
      .update({ last_poll_at: new Date().toISOString(), ...(published.length ? { last_publish_at: new Date().toISOString() } : {}) })
      .eq('user_id', bot.user_id)

    return adminOpsJson(200, { ok: true, considered: all.length, eligible: ranked.length, published, quiet })
  } catch (err) {
    return adminOpsJson(500, { error: err instanceof Error ? err.message : String(err) })
  }
})
