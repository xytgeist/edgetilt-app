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
 * `{ evaluate: [{ handle, text, created_at }] }` judges posts without storing or pushing (validation).
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { buildPlayerIndex, matchPlayers, type InsiderPlayer, type PlayerIndex } from '../_shared/fantasyInsiderMatch.ts'
import { RANK, pushStarterAlerts, type StatusTransition } from '../_shared/fantasyStatusPush.ts'
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

type Source = { handle: string; display_name: string; team: string | null }
type Tweet = { id: string; text: string; created_at: string; author_id: string; handle: string; name: string }
type Verdict = {
  status: 'show' | 'duplicate' | 'skip'
  headline: string
  summary: string
  impact: string
  next: string | null
  next_player: string
  injury: string
}

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
  return { status: 'show', headline: cleanProse(first, 140), summary: '', impact: '', next: null, next_player: '', injury: '' }
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
        temperature: 0.2,
        ...openaiChatMaxCompletionTokens(320),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write a fantasy football news desk, like FantasyPros player news. Input: one post by an NFL reporter, ' +
              'the players it names, and items we already published on those players in the last 90 minutes.\n' +
              'Return JSON only: {"status":"show"|"duplicate"|"skip","headline":string,"summary":string,"impact":string,' +
              '"next":"out"|"doubtful"|"ir"|"questionable"|"cleared"|"none","next_player":string,"injury":string}\n' +
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
              'next (always fill, even for duplicate / skip): the status the post sets for the player\'s NEXT game. ' +
              '"out" when it says he will not play it: ruled out, inactive, will not play, will miss, out for Week N, also ' +
              'multi-week absences ("going to miss some time", "out 6-10 weeks", "out three months", "season is over"). ' +
              '"ir" when placed on IR / reserve. "doubtful" / "questionable" when officially listed that way. "cleared" when ' +
              'he will play, is active, practiced fully after an injury, or is activated / coming off IR (a practice window ' +
              'opening or "designated to return" is "none", never "ir"). "none" for anything else, including in-game ' +
              'injuries (left the game, won\'t return, questionable to return), rumors, and stat lines. next_player: the ' +
              'full name from Players named that status is about ("" for none). injury: body part if stated ("" if not).',
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
    let next = STATUSES.includes(String(parsed.next)) ? String(parsed.next) : null
    // Activation / return-window posts mention IR but never put a player on it.
    if ((next === 'ir' || next === 'out') && RETURNING.test(t.text)) next = null
    const verdict: Verdict = {
      status,
      headline: cleanProse(parsed.headline, 140),
      summary: cleanProse(parsed.summary, 500),
      impact: cleanProse(parsed.impact, 500),
      next,
      next_player: next ? cleanProse(parsed.next_player, 80) : '',
      injury: next ? cleanProse(parsed.injury, 40) : '',
    }
    if (status === 'show' && !verdict.headline) return fallbackVerdict(t)
    return verdict
  } catch {
    return fallbackVerdict(t)
  }
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

function trusted(handle: string, player: InsiderPlayer | undefined, beatTeam: Map<string, string | null>): boolean {
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
  }
  const now = new Date()

  const { data: srcRows, error: srcErr } = await admin.from('fantasy_insider_sources').select('handle, display_name, team').eq('active', true)
  if (srcErr) return adminOpsJson(500, { error: srcErr.message })
  const sources = (srcRows || []) as Source[]
  const beatTeam = new Map(sources.map((s) => [s.handle, s.team]))

  // Validation: judge given posts with the live prompt, store nothing, push nothing.
  if (Array.isArray(body.evaluate)) {
    const { index, byId } = await playerIndex(admin)
    const out = []
    for (const e of body.evaluate.slice(0, 40)) {
      const handle = String(e.handle || '').toLowerCase()
      const t: Tweet = { id: '0', text: String(e.text || ''), created_at: String(e.created_at || ''), author_id: '', handle, name: handle }
      const ids = matchPlayers(t.text, index, beatTeam.get(handle) || null)
      if (!ids.length) {
        out.push({ handle, matched: [], verdict: null })
        continue
      }
      const v = await judge(t, ids.map((id) => byId.get(id)).filter(Boolean) as InsiderPlayer[], [])
      const sid = v.next ? statusPlayerId(v.next_player, ids, byId) : null
      out.push({
        handle,
        text: t.text.slice(0, 160),
        matched: ids.map((id) => byId.get(id)?.full_name),
        verdict: v.status,
        next: v.next,
        next_player: sid ? byId.get(sid)?.full_name : v.next_player || null,
        trusted: sid ? trusted(handle, byId.get(sid), beatTeam) : false,
        headline: v.headline,
      })
    }
    return adminOpsJson(200, { ok: true, evaluated: out })
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
      const verdict = await judge(t, ids.map((id) => byId.get(id)).filter(Boolean) as InsiderPlayer[], (prior || []).map((p) => String(p.headline)))
      if (verdict.status === 'show') shown++
      else if (verdict.status === 'duplicate') duplicate++
      else skipped++
      const sid = verdict.status !== 'skip' && verdict.next ? statusPlayerId(verdict.next_player, ids, byId) : null
      const isTrusted = sid ? trusted(t.handle, byId.get(sid), beatTeam) : false
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
            next_status: sid ? verdict.next : null,
            status_sleeper_id: sid,
            status_injury: sid ? verdict.injury || null : null,
            status_trusted: isTrusted,
          },
          { onConflict: 'tweet_id', ignoreDuplicates: true },
        )
        .select('tweet_id')
      if (stored?.length && sid && isTrusted && verdict.next && RANK[verdict.next] >= 2) {
        statusRows.push({ tweet_id: t.id, sleeper_id: sid, status: verdict.next, injury: verdict.injury })
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
