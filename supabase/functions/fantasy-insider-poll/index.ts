/**
 * Fantasy insider news poller (pg_cron every 2 min, or admin / service role with { force: true }).
 * Reads recent posts from `fantasy_insider_sources` on X (one search per ~20 handles, shared since_id cursor),
 * keeps posts that name an NFL player, and has the LLM decide show / duplicate / skip and write a headline,
 * summary, and Fantasy Impact line credited to the reporter. Rows land in `fantasy_insider_news`.
 *
 * Cadence (ET): Sun 11:00-24:00, Mon + Thu 19:00-24:00 every tick; 7:00-24:00 every 10 min; overnight every 30 min.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { buildPlayerIndex, matchPlayers, type InsiderPlayer, type PlayerIndex } from '../_shared/fantasyInsiderMatch.ts'
import {
  openaiChatMaxCompletionTokens,
  openaiChatReasoningNone,
  resolveOpenAiChatModel,
} from '../_shared/openaiModelDefaults.ts'

const X_API = 'https://api.x.com/2'
const QUERY_MAX = 480
const MAX_PAGES = 3
const BOOTSTRAP_HOURS = 6
const MAX_LLM_PER_POLL = 40
const DUP_WINDOW_MS = 90 * 60 * 1000
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']

type Source = { handle: string; display_name: string; team: string | null }
type Tweet = { id: string; text: string; created_at: string; author_id: string; handle: string; name: string }
type Verdict = { status: 'show' | 'duplicate' | 'skip'; headline: string; summary: string; impact: string }

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value
  return { wd: map.weekday, hour: Number(map.hour) % 24 }
}

/** Minimum gap between polls right now. */
function pollGapMs(d = new Date()): number {
  const { wd, hour } = etParts(d)
  const hot = (wd === 'Sun' && hour >= 11) || ((wd === 'Mon' || wd === 'Thu') && hour >= 19)
  if (hot) return 90 * 1000
  if (hour >= 7) return 10 * 60 * 1000 - 30 * 1000
  return 30 * 60 * 1000 - 30 * 1000
}

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
  return { status: 'show', headline: cleanProse(first, 140), summary: '', impact: '' }
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
              'Return JSON only: {"status":"show"|"duplicate"|"skip","headline":string,"summary":string,"impact":string}\n' +
              'status:\n' +
              '- "skip" when the post is not fantasy-relevant news about the player: opinions, jokes, highlights with no news, ' +
              'podcast or show plugs, coach quotes with no status or role info, team stat lines.\n' +
              '- "duplicate" when an earlier item already reports the same fact (a repeat by another reporter). A real update ' +
              '(questionable -> ruled out, limited -> full practice, signed after a workout) is NOT a duplicate.\n' +
              '- otherwise "show".\n' +
              'For show: headline max 90 chars in the style "Mike Evans (Achilles) ruled out for rest of MNF". summary: 1-2 ' +
              'sentences of only the facts in the post. impact: 1-2 sentences on what it means for fantasy managers (who ' +
              'gains or loses work, what to watch). Never invent facts not in the post; hedge with "likely" or "watch" when ' +
              'unsure. Third person. Never use em dashes, en dashes, or middle dots. For skip / duplicate, strings may be empty.',
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
    const verdict: Verdict = {
      status,
      headline: cleanProse(parsed.headline, 140),
      summary: cleanProse(parsed.summary, 500),
      impact: cleanProse(parsed.impact, 500),
    }
    if (status === 'show' && !verdict.headline) return fallbackVerdict(t)
    return verdict
  } catch {
    return fallbackVerdict(t)
  }
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
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const token = String(Deno.env.get('X_API_BEARER_TOKEN') || '').trim()
  if (!token) return adminOpsJson(503, { error: 'X_API_BEARER_TOKEN missing.' })

  // Claim this tick: only one caller per gap gets past here.
  const now = new Date()
  const gapCutoff = new Date(now.getTime() - (body.force ? 0 : pollGapMs(now))).toISOString()
  const { data: claimed, error: claimErr } = await admin
    .from('fantasy_insider_state')
    .update({ last_polled_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', 'poll')
    .or(`last_polled_at.is.null,last_polled_at.lt.${gapCutoff}`)
    .select('since_id')
  if (claimErr) return adminOpsJson(500, { error: claimErr.message })
  if (!claimed?.length) return adminOpsJson(200, { ok: true, polled: false })
  const sinceId = claimed[0]?.since_id ? String(claimed[0].since_id) : null

  try {
    const { data: srcRows, error: srcErr } = await admin
      .from('fantasy_insider_sources')
      .select('handle, display_name, team')
      .eq('active', true)
    if (srcErr) throw new Error(srcErr.message)
    const sources = (srcRows || []) as Source[]
    const beatTeam = new Map(sources.map((s) => [s.handle, s.team]))
    const cursor = {
      since_id: sinceId,
      start_time: sinceId ? null : new Date(now.getTime() - BOOTSTRAP_HOURS * 3600 * 1000).toISOString(),
    }

    const all: Tweet[] = []
    let newest = sinceId
    for (const q of queries(sources)) {
      let result
      try {
        result = await searchRecent(q, token, cursor)
      } catch (err) {
        // A cursor older than X's 7-day search window is rejected; restart from the bootstrap window.
        if (!cursor.since_id || !/since_id/i.test(String((err as Error)?.message))) throw err
        cursor.since_id = null
        cursor.start_time = new Date(now.getTime() - BOOTSTRAP_HOURS * 3600 * 1000).toISOString()
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
      await admin.from('fantasy_insider_news').upsert(
        {
          tweet_id: t.id,
          handle: t.handle,
          author_name: t.name,
          posted_at: t.created_at || now.toISOString(),
          text: t.text,
          url: `https://x.com/${t.handle}/status/${t.id}`,
          sleeper_ids: ids,
          ...verdict,
        },
        { onConflict: 'tweet_id', ignoreDuplicates: true },
      )
    }

    await admin
      .from('fantasy_insider_state')
      .update({ since_id: newest, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', 'poll')
    return adminOpsJson(200, { ok: true, polled: true, fetched: all.length, matched: matched.length, shown, duplicate, skipped })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('fantasy_insider_state').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', 'poll')
    return adminOpsJson(502, { error: message })
  }
})
