/**
 * Fantasy insider news poller (pg_cron every 2 min, or admin / service role with { force: true }).
 * Reads recent posts from `fantasy_insider_sources` on X (one search per ~20 handles, shared since_id cursor),
 * keeps posts that name an NFL player, and has the LLM decide show / duplicate / skip, write a headline, summary,
 * and Fantasy Impact line credited to the reporter, and read the next-game status the post sets (Out / Doubtful /
 * IR / Questionable / cleared). A trusted source (core national, Underdog, Caplan, or that team's beat writer)
 * moving a starter up to Out / Doubtful / IR goes straight to the starter push (`fantasyStatusPush.ts`).
 *
 * Reads X only inside news windows (ET): Sun 10:30-13:30, 15:00-16:30, 18:30-20:30; Mon 18:30-20:30;
 * Thu 12:00-18:00 + 18:30-20:30; Wed / Fri 12:00-18:00; Sat 14:00-18:00. When a window opens after a gap the
 * search starts from now, so posts outside the windows are never read (or billed).
 * `{ evaluate: [{ handle, text, created_at }] }` judges posts without storing or pushing (validation);
 * `{ regression: true }` runs the known-answer set in `fantasy_insider_regression` and reports false alarms / misses.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { buildPlayerIndex, matchPlayers, type InsiderPlayer, type PlayerIndex } from '../_shared/fantasyInsiderMatch.ts'
import { ESPN_NFL, ESPN_TO_SLEEPER, RANK, espnJson, pushStarterAlerts, type StatusTransition } from '../_shared/fantasyStatusPush.ts'
import {
  openaiChatMaxCompletionTokens,
  openaiChatReasoningNone,
  resolveOpenAiChatModel,
} from '../_shared/openaiModelDefaults.ts'

const X_API = 'https://api.x.com/2'
const QUERY_MAX = 480
const MAX_PAGES = 3
const MAX_LLM_PER_POLL = 40
const DUP_WINDOW_MS = 90 * 60 * 1000
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const RESTART_AFTER_MS = 10 * 60 * 1000
const RESTART_LOOKBACK_MS = 5 * 60 * 1000
/** Sources whose word alone can move a player's status (plus each team's own beat writer). */
const CORE = new Set(['adamschefter', 'rapsheet', 'tompelissero', 'mikegarafolo', 'underdognfl', 'caplannfl'])
const STATUSES = ['out', 'doubtful', 'ir', 'questionable', 'cleared']
const RETURNING = /\b(activated|reinstated|coming off|returns? from|returning from|back from|designated to return|window to return|return to practice)\b[^.]{0,80}\b(injured reserve|ir|pup|reserve)\b/i
const PLACED = /\b(plac(e|ed|es|ing)|headed|heading|going|goes|moved?|lands?|landed)\b[^.]{0,40}\b(on|to)\s+(injured reserve|ir)\b/i

/** A mixed post ("activated A from IR ... B is headed to IR") keeps B's IR when B's own sentence places him there. */
function placedInOwnSentence(text: string, player: string): boolean {
  const last = player.toLowerCase().trim().split(/\s+/).pop() || ''
  if (!last) return false
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .some((s) => s.toLowerCase().includes(last) && PLACED.test(s) && !RETURNING.test(s))
}

type Source = { handle: string; display_name: string; team: string | null; push_trusted?: boolean }
type Tweet = { id: string; text: string; created_at: string; author_id: string; handle: string; name: string }
type Verdict = {
  status: 'show' | 'duplicate' | 'skip'
  headline: string
  summary: string
  impact: string
  /** News type for the Lounge sports news bot (null when the model did not say). */
  kind: string | null
  /** Next-game status per player the post sets (one post can cover several: inactives lists, injury rundowns). */
  statuses: PlayerStatus[]
}

type PlayerStatus = { next: string; player: string; injury: string }

const KINDS = ['status', 'transaction', 'in_game', 'role', 'other']
const SEVERITY: Record<string, number> = { cleared: 0, questionable: 1, doubtful: 2, out: 3, ir: 3 }

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value
  return { wd: map.weekday, mins: (Number(map.hour) % 24) * 60 + Number(map.minute) }
}

/** True inside the windows where NFL status news breaks. */
export function inNewsWindow(d = new Date()): boolean {
  const { wd, mins } = etParts(d)
  const within = (a: number, b: number) => mins >= a * 60 && mins < b * 60
  if (wd === 'Sun') return within(10.5, 13.5) || within(15, 16.5) || within(18.5, 20.5)
  if (wd === 'Mon') return within(18.5, 20.5)
  if (wd === 'Thu') return within(12, 18) || within(18.5, 20.5)
  if (wd === 'Wed' || wd === 'Fri') return within(12, 18)
  if (wd === 'Sat') return within(14, 18)
  return false
}

const POLL_GAP_MS = 90 * 1000

function queries(sources: Source[]): string[] {
  const out: string[] = []
  const suffix = ') -is:retweet -is:reply'
  let parts: string[] = []
  for (const s of sources) {
    const next = [...parts, `from:${s.handle}`]
    if (`(${next.join(' OR ')}${suffix}`.length > QUERY_MAX && parts.length) {
      out.push(`(${parts.join(' OR ')}${suffix}`)
      parts = [`from:${s.handle}`]
    } else {
      parts = next
    }
  }
  if (parts.length) out.push(`(${parts.join(' OR ')}${suffix}`)
  return out
}

async function searchRecent(query: string, token: string, cursor: { since_id: string | null; start_time: string | null }) {
  const tweets: Tweet[] = []
  let newest: string | null = null
  let nextToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query,
      max_results: '100',
      'tweet.fields': 'created_at,author_id,note_tweet',
      expansions: 'author_id',
      'user.fields': 'username,name',
    })
    if (cursor.since_id) params.set('since_id', cursor.since_id)
    else if (cursor.start_time) params.set('start_time', cursor.start_time)
    if (nextToken) params.set('next_token', nextToken)
    const res = await fetch(`${X_API}/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`X search ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = await res.json()
    const users = new Map<string, { username: string; name: string }>()
    for (const u of body?.includes?.users || []) users.set(String(u.id), { username: String(u.username), name: String(u.name) })
    for (const t of body?.data || []) {
      const u = users.get(String(t.author_id))
      tweets.push({
        id: String(t.id),
        text: String(t?.note_tweet?.text || t.text || ''),
        created_at: String(t.created_at || ''),
        author_id: String(t.author_id),
        handle: String(u?.username || '').toLowerCase(),
        name: String(u?.name || ''),
      })
    }
    if (page === 0 && body?.meta?.newest_id) newest = String(body.meta.newest_id)
    nextToken = body?.meta?.next_token ? String(body.meta.next_token) : null
    if (!nextToken) break
  }
  return { tweets, newest }
}

let indexCache: { at: number; index: PlayerIndex; byId: Map<string, InsiderPlayer> } | null = null

async function playerIndex(admin: SupabaseClient) {
  if (indexCache && Date.now() - indexCache.at < 6 * 60 * 60 * 1000) return indexCache
  const { data, error } = await admin
    .from('nfl_players')
    .select('sleeper_id, full_name, position, team')
    .in('position', POSITIONS)
    .limit(5000)
  if (error) throw new Error(error.message)
  const players = (data || []).map((p) => ({
    sleeper_id: String(p.sleeper_id),
    full_name: String(p.full_name || ''),
    position: String(p.position || ''),
    team: p.team ? String(p.team).toUpperCase() : null,
  }))
  indexCache = { at: Date.now(), index: buildPlayerIndex(players), byId: new Map(players.map((p) => [p.sleeper_id, p])) }
  return indexCache
}

function cleanProse(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/\s*[—]\s*/g, ' ... ')
    .replace(/–/g, '-')
    .replace(/·/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function fallbackVerdict(t: Tweet): Verdict {
  const first = t.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  return { status: 'show', headline: cleanProse(first, 140), summary: '', impact: '', kind: null, statuses: [] }
}

async function judge(t: Tweet, players: InsiderPlayer[], recent: string[]): Promise<Verdict> {
  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!key) return fallbackVerdict(t)
  const who = players.map((p) => `${p.full_name} (${p.position}, ${p.team || 'FA'})`).join('; ')
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: resolveOpenAiChatModel(),
        ...openaiChatReasoningNone(),
        // Deterministic reads keep the weekly regression comparable run to run.
        temperature: 0,
        ...openaiChatMaxCompletionTokens(600),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write a fantasy football news desk, like FantasyPros player news. Input: one post by an NFL reporter, ' +
              'the players it names, and items we already published on those players in the last 90 minutes.\n' +
              'Return JSON only: {"status":"show"|"duplicate"|"skip","headline":string,"summary":string,"impact":string,' +
              '"kind":"status"|"transaction"|"in_game"|"role"|"other",' +
              '"statuses":[{"player":string,"next":"out"|"doubtful"|"ir"|"questionable"|"cleared","injury":string}]}\n' +
              'status:\n' +
              '- "skip" when the post is not fantasy-relevant news about the player: opinions, jokes, highlights with no news, ' +
              'podcast or show plugs, coach quotes with no status or role info, team stat lines.\n' +
              '- "duplicate" when an earlier item already reports the same fact (a repeat by another reporter). A real update ' +
              '(questionable -> ruled out, limited -> full practice, signed after a workout) is NOT a duplicate.\n' +
              '- otherwise "show".\n' +
              'For show: headline max 90 chars in the style "Mike Evans (Achilles) ruled out for rest of MNF". summary: 1-2 ' +
              'sentences of only the facts in the post. impact: 1-2 sentences on what it means for fantasy managers (who ' +
              'gains or loses work, what to watch). Never invent facts not in the post; hedge with "likely" or "watch" when ' +
              'unsure. Third person. Never use em dashes, en dashes, or middle dots. For skip / duplicate, headline / summary / ' +
              'impact may be empty.\n' +
              'kind (always fill): "in_game" for an injury during a game in progress (left the game, questionable / doubtful ' +
              'to return, ruled out for the rest of the game, carted off). "transaction" for trades, signings, releases, ' +
              'waiver claims, practice-squad elevations, contract extensions. "role" for starting-job or depth-chart changes ' +
              '(named the starter, benched, demoted, promoted). "status" for availability news about an upcoming game ' +
              '(practice participation, injury designations, inactives, IR moves, return timelines). "other" for anything else.\n' +
              'statuses (always fill, even for duplicate / skip): one entry for EACH named player whose NEXT-game status the ' +
              'post sets (an inactives list or injury rundown can set several; a player whose status it does not set gets no ' +
              'entry; [] when it sets none). player: the full name from Players named. next: ' +
              '"out" when it says he will not play it: ruled out, inactive, will not play, will miss, out for Week N, also ' +
              'multi-week absences ("going to miss some time", "out 6-10 weeks", "out three months", "season is over"). ' +
              '"ir" when placed on IR / reserve, or when the coach or team says he will be or is expected to be placed on ' +
              'IR (speculation like "could land on IR" is "none"). "doubtful" / "questionable" when officially listed that way. "cleared" when ' +
              'he will play, is active, practiced fully after an injury, or is activated / coming off IR (a practice window ' +
              'opening or "designated to return" is "none", never "ir"). "none" for anything else, including in-game ' +
              'injuries (left the game, won\'t return, questionable to return), rumors, and stat lines: leave those players ' +
              'out of statuses. injury: body part if stated ("" if not).',
          },
          {
            role: 'user',
            content:
              `Reporter: ${t.name} (@${t.handle})\nPost: ${t.text}\nPlayers named: ${who}\n` +
              `Already published:\n${recent.length ? recent.map((r) => `- ${r}`).join('\n') : '- none'}`,
          },
        ],
      }),
    })
    if (!res.ok) return fallbackVerdict(t)
    const body = await res.json()
    const parsed = JSON.parse(String(body?.choices?.[0]?.message?.content || '{}'))
    const status = ['show', 'duplicate', 'skip'].includes(parsed.status) ? parsed.status : 'show'
    const raw: Array<Record<string, unknown>> = Array.isArray(parsed.statuses)
      ? parsed.statuses
      : parsed.next ? [{ player: parsed.next_player, next: parsed.next, injury: parsed.injury }] : []
    const statuses: PlayerStatus[] = []
    for (const r of raw) {
      const next = STATUSES.includes(String(r?.next)) ? String(r.next) : null
      const player = cleanProse(r?.player, 80)
      if (!next || !player) continue
      // Activation / return-window posts mention IR but never put a player on it.
      if ((next === 'ir' || next === 'out') && RETURNING.test(t.text) && !placedInOwnSentence(t.text, player)) continue
      statuses.push({ next, player, injury: cleanProse(r?.injury, 40) })
    }
    const verdict: Verdict = {
      status,
      headline: cleanProse(parsed.headline, 140),
      summary: cleanProse(parsed.summary, 500),
      impact: cleanProse(parsed.impact, 500),
      kind: KINDS.includes(String(parsed.kind)) ? String(parsed.kind) : null,
      statuses,
    }
    if (status === 'show' && !verdict.headline) return fallbackVerdict(t)
    return verdict
  } catch {
    return fallbackVerdict(t)
  }
}

/** Words that make "ruled out" about a future game even when posted mid-game. */
const FUTURE = /\b(next week|this week|week \d+|sunday|monday|thursday|saturday|season|weeks|months|injured reserve|ir|surgery|indefinitely|practice)\b/i
const IN_GAME_MS = 4 * 60 * 60 * 1000

function etYmd(ms: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  return p.replace(/-/g, '')
}

const dayCache = new Map<string, Promise<Array<{ teams: string[]; kickoff: number }>>>()
function dayGames(ymd: string) {
  if (!dayCache.has(ymd)) {
    dayCache.set(
      ymd,
      espnJson(`${ESPN_NFL}/scoreboard?dates=${ymd}`, 10_000).then((body) => {
        const events = Array.isArray(body?.events) ? (body!.events as Array<Record<string, unknown>>) : []
        return events.map((ev) => {
          const comp = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0]
          const teams = ((comp?.competitors as Array<Record<string, unknown>> | undefined) || []).map((c) => {
            const abbr = String((c.team as Record<string, unknown> | undefined)?.abbreviation || '').toUpperCase()
            return ESPN_TO_SLEEPER[abbr] || abbr
          })
          return { teams, kickoff: Date.parse(String(ev.date || '')) }
        })
      }).catch(() => []),
    )
  }
  return dayCache.get(ymd)!
}

/** True when this team's game was underway at `iso` (kickoff to kickoff + 4h). */
async function teamInGameAt(team: string, iso: string): Promise<boolean> {
  const t = Date.parse(iso)
  if (!Number.isFinite(t) || !team) return false
  for (const ymd of new Set([etYmd(t), etYmd(t - 6 * 3600 * 1000)])) {
    for (const g of await dayGames(ymd)) {
      if (g.teams.includes(team) && Number.isFinite(g.kickoff) && t >= g.kickoff && t <= g.kickoff + IN_GAME_MS) return true
    }
  }
  return false
}

/** `judge`, then: an Out / Doubtful posted while that player's game is underway is an in-game ruling, not next week's. */
async function judgeGuarded(t: Tweet, players: InsiderPlayer[], recent: string[]): Promise<Verdict> {
  const v = await judge(t, players, recent)
  if (FUTURE.test(t.text) || !t.created_at) return v
  const kept: PlayerStatus[] = []
  for (const st of v.statuses) {
    if (st.next === 'out' || st.next === 'doubtful') {
      const want = st.player.toLowerCase().replace(/[^a-z ]/g, '').trim()
      const p =
        players.find((x) => x.full_name.toLowerCase().replace(/[^a-z ]/g, '').trim() === want) ||
        (players.length === 1 ? players[0] : undefined)
      if (p?.team && (await teamInGameAt(p.team, t.created_at))) continue
    }
    kept.push(st)
  }
  v.statuses = kept
  return v
}

/** Statuses resolved to sleeper ids (one per player, most severe wins), most severe first. */
function resolveStatuses(v: Verdict, ids: string[], byId: Map<string, InsiderPlayer>) {
  if (v.status === 'skip') return [] as Array<PlayerStatus & { sleeper_id: string }>
  const best = new Map<string, PlayerStatus & { sleeper_id: string }>()
  for (const st of v.statuses) {
    const sid = statusPlayerId(st.player, ids, byId)
    if (!sid) continue
    const prev = best.get(sid)
    if (!prev || SEVERITY[st.next] > SEVERITY[prev.next]) best.set(sid, { ...st, sleeper_id: sid })
  }
  return [...best.values()].sort((a, b) => SEVERITY[b.next] - SEVERITY[a.next])
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Name the LLM gave → one of the matched sleeper ids (exact, then last-name match). */
function statusPlayerId(name: string, ids: string[], byId: Map<string, InsiderPlayer>): string | null {
  const n = name.toLowerCase().replace(/[^a-z ]/g, '').trim()
  if (!n) return ids.length === 1 ? ids[0] : null
  const exact = ids.find((id) => (byId.get(id)?.full_name || '').toLowerCase().replace(/[^a-z ]/g, '').trim() === n)
  if (exact) return exact
  const last = n.split(' ').pop() || ''
  const byLast = ids.filter((id) => (byId.get(id)?.full_name || '').toLowerCase().split(' ').pop()?.replace(/[^a-z]/g, '') === last)
  return byLast.length === 1 ? byLast[0] : null
}

function trusted(handle: string, player: InsiderPlayer | undefined, beatTeam: Map<string, string | null>, pushOk?: Set<string>): boolean {
  if (pushOk && !pushOk.has(handle)) return false
  if (CORE.has(handle)) return true
  const team = beatTeam.get(handle)
  return Boolean(team && player?.team && team === player.team)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  let admin: SupabaseClient
  try {
    admin = await authorizeServiceRoleOrAdmin(req)
  } catch (res) {
    if (res instanceof Response) return res
    return adminOpsJson(401, { error: 'Unauthorized' })
  }
  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean
    dryRun?: boolean
    evaluate?: Array<{ handle?: string; text?: string; created_at?: string }>
    /** Run the known-answer set (`fantasy_insider_regression`) through the live prompt. */
    regression?: boolean
  }
  const now = new Date()

  const { data: srcRows, error: srcErr } = await admin.from('fantasy_insider_sources').select('handle, display_name, team, push_trusted').eq('active', true)
  if (srcErr) return adminOpsJson(500, { error: srcErr.message })
  const sources = (srcRows || []) as Source[]
  const beatTeam = new Map(sources.map((s) => [s.handle, s.team]))
  const pushOk = new Set(sources.filter((s) => s.push_trusted !== false).map((s) => s.handle))

  // Validation: judge posts with the live prompt, store nothing, push nothing.
  const judgeAll = async (items: Array<{ handle?: string; text?: string; created_at?: string }>) => {
    const { index, byId } = await playerIndex(admin)
    return mapLimit(items, 6, async (e) => {
      const handle = String(e.handle || '').toLowerCase()
      const t: Tweet = { id: '0', text: String(e.text || ''), created_at: String(e.created_at || ''), author_id: '', handle, name: handle }
      const ids = matchPlayers(t.text, index, beatTeam.get(handle) || null)
      if (!ids.length) return { handle, text: t.text.slice(0, 160), matched: [], verdict: null, statuses: [], next: null, next_player: null, trusted: false, headline: '' }
      const v = await judgeGuarded(t, ids.map((id) => byId.get(id)).filter(Boolean) as InsiderPlayer[], [])
      const resolved = resolveStatuses(v, ids, byId).map((r) => ({
        player: byId.get(r.sleeper_id)?.full_name || r.player,
        next: r.next,
        trusted: trusted(handle, byId.get(r.sleeper_id), beatTeam, pushOk),
      }))
      return {
        handle,
        text: t.text.slice(0, 160),
        matched: ids.map((id) => byId.get(id)?.full_name),
        verdict: v.status,
        statuses: resolved,
        next: resolved[0]?.next || null,
        next_player: resolved[0]?.player || null,
        trusted: Boolean(resolved[0]?.trusted),
        headline: v.headline,
        kind: v.kind,
      }
    })
  }
  if (Array.isArray(body.evaluate)) {
    return adminOpsJson(200, { ok: true, evaluated: await judgeAll(body.evaluate.slice(0, 40)) })
  }
  if (body.regression) {
    const { data: cases } = await admin.from('fantasy_insider_regression').select('id, handle, text, expected_next, expected_player, origin, posted_at').limit(400)
    const list = cases || []
    const got = await judgeAll(list.map((c) => ({ ...c, created_at: c.posted_at ? String(c.posted_at) : '' })))
    const BLOCKS = new Set(['out', 'doubtful', 'ir'])
    const sameClass = (a: string | null, b: string) => (a === 'ir' || a === 'out' ? ['ir', 'out'].includes(b) : a === b)
    const results = list.map((c, i) => {
      const g = got[i] as { statuses?: Array<{ player: string; next: string }> }
      const sts = g.statuses || []
      const expected = String(c.expected_next)
      const who = String(c.expected_player || '').toLowerCase()
      const mine = who ? sts.find((x) => x.player.toLowerCase() === who) : sts[0]
      const blocking = sts.filter((x) => BLOCKS.has(x.next))
      let pass: boolean
      let kind = ''
      if (BLOCKS.has(expected)) {
        pass = Boolean(mine && sameClass(mine.next, expected))
        if (!pass) kind = mine && BLOCKS.has(mine.next) ? 'wrong status' : 'missed'
      } else if (who) {
        // Named player must not be pushed; other players in the post may legitimately be.
        pass = !(mine && BLOCKS.has(mine.next))
        if (!pass) kind = 'false alarm'
      } else {
        pass = !blocking.length
        if (!pass) kind = 'false alarm'
      }
      return {
        id: c.id,
        origin: c.origin,
        handle: c.handle,
        expected,
        expected_player: c.expected_player,
        got: mine?.next || (blocking[0]?.next ?? null),
        got_player: mine?.player || (blocking[0]?.player ?? null),
        pass,
        kind,
        text: String(c.text).slice(0, 200),
      }
    })
    const failures = results.filter((r) => !r.pass)
    return adminOpsJson(200, {
      ok: true,
      cases: results.length,
      passed: results.length - failures.length,
      false_alarms: failures.filter((f) => f.kind === 'false alarm').length,
      misses: failures.filter((f) => f.kind !== 'false alarm').length,
      failures,
    })
  }

  const token = String(Deno.env.get('X_API_BEARER_TOKEN') || '').trim()
  if (!token) return adminOpsJson(503, { error: 'X_API_BEARER_TOKEN missing.' })
  if (!body.force && !inNewsWindow(now)) return adminOpsJson(200, { ok: true, polled: false, window: false })

  const { data: before } = await admin.from('fantasy_insider_state').select('since_id, last_polled_at').eq('id', 'poll').maybeSingle()
  // Claim this tick: only one caller per gap gets past here.
  const gapCutoff = new Date(now.getTime() - (body.force ? 0 : POLL_GAP_MS)).toISOString()
  const { data: claimed, error: claimErr } = await admin
    .from('fantasy_insider_state')
    .update({ last_polled_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', 'poll')
    .or(`last_polled_at.is.null,last_polled_at.lt.${gapCutoff}`)
    .select('id')
  if (claimErr) return adminOpsJson(500, { error: claimErr.message })
  if (!claimed?.length) return adminOpsJson(200, { ok: true, polled: false })

  // A window opening after a gap starts from now: posts from outside the windows are never read.
  const lastAt = before?.last_polled_at ? Date.parse(String(before.last_polled_at)) : NaN
  const fresh = !Number.isFinite(lastAt) || now.getTime() - lastAt > RESTART_AFTER_MS
  const sinceId = !fresh && before?.since_id ? String(before.since_id) : null

  try {
    const cursor = {
      since_id: sinceId,
      start_time: sinceId ? null : new Date(now.getTime() - RESTART_LOOKBACK_MS).toISOString(),
    }

    const all: Tweet[] = []
    let newest = sinceId
    for (const q of queries(sources)) {
      let result
      try {
        result = await searchRecent(q, token, cursor)
      } catch (err) {
        // A cursor older than X's 7-day search window is rejected; restart from now.
        if (!cursor.since_id || !/since_id/i.test(String((err as Error)?.message))) throw err
        cursor.since_id = null
        cursor.start_time = new Date(now.getTime() - RESTART_LOOKBACK_MS).toISOString()
        result = await searchRecent(q, token, cursor)
      }
      const { tweets, newest: n } = result
      all.push(...tweets)
      if (n && (!newest || BigInt(n) > BigInt(newest))) newest = n
    }

    const byHandle: Record<string, number> = {}
    for (const t of all) byHandle[t.handle] = (byHandle[t.handle] || 0) + 1

    const { index, byId } = await playerIndex(admin)
    const matched = all
      .map((t) => ({ t, ids: matchPlayers(t.text, index, beatTeam.get(t.handle) || null) }))
      .filter((m) => m.ids.length)
      .sort((a, b) => (BigInt(a.t.id) < BigInt(b.t.id) ? -1 : 1))
      .slice(-MAX_LLM_PER_POLL)

    let shown = 0
    let duplicate = 0
    let skipped = 0
    const statusRows: Array<{ tweet_id: string; sleeper_id: string; status: string; injury: string }> = []
    for (const { t, ids } of matched) {
      const since = new Date(Date.parse(t.created_at) - DUP_WINDOW_MS).toISOString()
      const { data: prior } = await admin
        .from('fantasy_insider_news')
        .select('headline')
        .eq('status', 'show')
        .overlaps('sleeper_ids', ids)
        .gte('posted_at', since)
        .order('posted_at', { ascending: true })
        .limit(6)
      const verdict = await judgeGuarded(t, ids.map((id) => byId.get(id)).filter(Boolean) as InsiderPlayer[], (prior || []).map((p) => String(p.headline)))
      if (verdict.status === 'show') shown++
      else if (verdict.status === 'duplicate') duplicate++
      else skipped++
      const resolved = resolveStatuses(verdict, ids, byId).map((r) => ({ ...r, trusted: trusted(t.handle, byId.get(r.sleeper_id), beatTeam, pushOk) }))
      const top = resolved[0] || null
      if (body.dryRun) continue
      const { data: stored } = await admin
        .from('fantasy_insider_news')
        .upsert(
          {
            tweet_id: t.id,
            handle: t.handle,
            author_name: t.name,
            posted_at: t.created_at || now.toISOString(),
            text: t.text,
            url: `https://x.com/${t.handle}/status/${t.id}`,
            sleeper_ids: ids,
            status: verdict.status,
            headline: verdict.headline,
            summary: verdict.summary,
            impact: verdict.impact,
            kind: verdict.kind,
            next_status: top ? top.next : null,
            status_sleeper_id: top ? top.sleeper_id : null,
            status_injury: top ? top.injury || null : null,
            status_trusted: Boolean(top?.trusted),
            next_statuses: resolved.map((r) => ({ sleeper_id: r.sleeper_id, status: r.next, injury: r.injury || null, trusted: r.trusted })),
          },
          { onConflict: 'tweet_id', ignoreDuplicates: true },
        )
        .select('tweet_id')
      if (stored?.length) {
        for (const r of resolved) {
          if (r.trusted && RANK[r.next] >= 2) statusRows.push({ tweet_id: t.id, sleeper_id: r.sleeper_id, status: r.next, injury: r.injury })
        }
      }
    }

    // Trusted Out / Doubtful / IR that ESPN has not caught up to yet → the same starter push the watcher sends.
    let alerts = 0
    let pushed = 0
    if (statusRows.length) {
      const sids = [...new Set(statusRows.map((r) => r.sleeper_id))]
      const { data: current } = await admin.from('nfl_player_status').select('sleeper_id, status, injury').in('sleeper_id', sids)
      const currentBy = new Map((current || []).map((c) => [String(c.sleeper_id), c]))
      const transitions: StatusTransition[] = []
      const seen = new Set<string>()
      for (const r of statusRows) {
        const key = `${r.sleeper_id}:${r.status}`
        if (seen.has(key)) continue
        seen.add(key)
        const cur = currentBy.get(r.sleeper_id)
        const from = cur ? String(cur.status) : 'active'
        if (RANK[r.status] <= (RANK[from] ?? 0)) continue
        const p = byId.get(r.sleeper_id)
        transitions.push({
          sleeper_id: r.sleeper_id,
          name: p?.full_name || '',
          team: p?.team || null,
          status: r.status,
          injury: r.injury || (cur?.injury ? String(cur.injury) : null),
          from,
        })
      }
      if (transitions.length) {
        const res = await pushStarterAlerts(admin, transitions)
        alerts = res.alerts
        pushed = res.pushed
      }
      await admin
        .from('fantasy_insider_news')
        .update({ status_applied_at: new Date().toISOString() })
        .in('tweet_id', statusRows.map((r) => r.tweet_id))
    }

    await admin
      .from('fantasy_insider_state')
      .update({ since_id: newest, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', 'poll')
    await admin.from('fantasy_insider_poll_log').insert({ fetched: all.length, matched: matched.length, by_handle: byHandle }).then(() => null, () => null)
    return adminOpsJson(200, {
      ok: true,
      polled: true,
      fresh,
      fetched: all.length,
      matched: matched.length,
      shown,
      duplicate,
      skipped,
      statuses: statusRows.length,
      alerts,
      pushed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('fantasy_insider_state').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', 'poll')
    return adminOpsJson(502, { error: message })
  }
})
