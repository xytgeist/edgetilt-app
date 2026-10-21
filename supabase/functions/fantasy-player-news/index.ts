/**
 * Fantasy main page news: recent Rotowire notes (via ESPN fantasy) plus insider items from X
 * (`fantasy_insider_news`, written by `fantasy-insider-poll`) for the caller's NFL players.
 * Body: { sleeper_ids: string[] } (max 80). Each player's feed is one shared row in `edge_shared_cache`
 * for 20 minutes, so every user rostering the same player shares a single ESPN read.
 * NBA: Body { sport: 'nba', players: [{ sleeper_id, name, team, position }] } … Sleeper NBA ids have no ESPN id,
 * so names map through ESPN's team rosters (one shared row a day); Rotowire notes come from ESPN fantasy basketball.
 * Returns { ok, notes: PlayerNewsNote[] } newest first.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { decodeHtmlEntities } from '../_shared/decodeHtmlEntities.ts'
import { sharedCached } from '../_shared/edgeSharedCache.ts'
import { espnFetch } from '../_shared/loungeSportsScoreboard.ts'
import { lookupNbaEspnId, nbaEspnIds } from '../_shared/nbaEspnIds.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const MAX_PLAYERS = 80
const MAX_NOTES = 60
const NOTES_PER_PLAYER = 3
const NOTE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000
const FEED_TTL_MS = 20 * 60 * 1000
const CONCURRENCY = 6
const INSIDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const MAX_INSIDER = 40
/** A Rotowire note this soon after an insider item on the same player is the same news. */
const ECHO_WINDOW_MS = 60 * 60 * 1000
const ECHO_AFTER_MS = 10 * 60 * 1000

type Obj = Record<string, unknown>
type FeedNote = { id: string; headline: string; story: string; published: string | null }

const str = (v: unknown) => String(v ?? '').trim()

function stripHtml(raw: unknown): string {
  return decodeHtmlEntities(str(raw).replace(/<(video|photo|inline)\d*>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function isoOrNull(v: unknown): string | null {
  const t = Date.parse(str(v))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Throws on any failure so neither cache layer keeps a refusal or an empty read. */
async function readPlayerFeed(espnId: string, game = 'ffl'): Promise<FeedNote[]> {
  const res = await espnFetch(
    `https://site.api.espn.com/apis/fantasy/v2/games/${game}/news/players?playerId=${encodeURIComponent(espnId)}&limit=8`,
    { headers: { 'User-Agent': 'EdgeTiltLounge/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(6_000) },
  )
  if (!res.ok) throw new Error(`ESPN news ${res.status}`)
  const body = (await res.json()) as Obj
  const feed = Array.isArray(body?.feed) ? (body.feed as Obj[]) : []
  const out: FeedNote[] = []
  for (const item of feed) {
    if (out.length >= NOTES_PER_PLAYER) break
    if (str(item.type) !== 'Rotowire') continue
    const headline = stripHtml(item.headline)
    if (!headline) continue
    const published = isoOrNull(item.published || item.lastModified)
    out.push({ id: str(item.id || item.dataSourceIdentifier) || `${espnId}:${published}`, headline, story: stripHtml(item.story), published })
  }
  return out
}

function playerFeed(espnId: string, admin: SupabaseClient) {
  return sharedCached(`fantasy:news:${espnId}`, { ttlMs: FEED_TTL_MS, leaseMs: 20_000, admin }, () => readPlayerFeed(espnId))
}

function nbaFeed(espnId: string, admin: SupabaseClient) {
  return sharedCached(`fantasy:news:fba:${espnId}`, { ttlMs: FEED_TTL_MS, leaseMs: 20_000, admin }, () => readPlayerFeed(espnId, 'fba'))
}

async function nbaNotes(raw: unknown, admin: SupabaseClient): Promise<Obj[]> {
  const seen = new Set<string>()
  const players = (Array.isArray(raw) ? raw : [])
    .map((p) => p as Obj)
    .filter((p) => /^\d+$/.test(str(p?.sleeper_id)) && str(p?.name) && !seen.has(str(p.sleeper_id)) && seen.add(str(p.sleeper_id)))
    .slice(0, MAX_PLAYERS)
  if (!players.length) return []
  const ids = await nbaEspnIds(admin).catch(() => new Map<string, string>())
  const list = players
    .map((p) => ({ p, espnId: lookupNbaEspnId(ids, p.name, p.team) }))
    .filter((x) => x.espnId)
  const [feeds, { data: shots }] = await Promise.all([
    mapLimit(list, CONCURRENCY, (x) => nbaFeed(x.espnId, admin).catch(() => [] as FeedNote[])),
    admin
      .from('player_headshots')
      .select('espn_id, full_url')
      .eq('league', 'nba')
      .eq('status', 'ok')
      .in('espn_id', [...new Set(list.map((x) => x.espnId))]),
  ])
  const photo = new Map((shots || []).map((r) => [str(r.espn_id), str(r.full_url)]))
  const cutoff = Date.now() - NOTE_WINDOW_MS
  return list.flatMap(({ p, espnId }, i) =>
    (feeds[i] || [])
      .filter((n) => n.published && Date.parse(n.published) >= cutoff)
      .map((n) => ({
        id: n.id,
        kind: 'rotowire',
        sport: 'nba',
        sleeper_id: str(p.sleeper_id),
        player: str(p.name),
        position: str(p.position),
        team: str(p.team),
        headshot_url: photo.get(espnId) || `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`,
        headline: n.headline,
        story: n.story,
        published: n.published,
        source: 'Rotowire via ESPN',
        url: `https://www.espn.com/nba/player/_/id/${espnId}`,
      })),
  )
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'Sign in required.' })
  const admin = createClient(supabaseUrl, serviceKey)
  const userId = await userIdFromJwt(authHeader.replace(/^Bearer\s+/i, '').trim(), admin)
  if (!userId) return json(401, { error: 'Invalid session.' })

  const body = (await req.json().catch(() => ({}))) as { sleeper_ids?: unknown; sport?: unknown; players?: unknown }
  if (str(body.sport).toLowerCase() === 'nba') {
    const notes = await nbaNotes(body.players, admin)
    notes.sort((a, b) => Date.parse(str(b.published)) - Date.parse(str(a.published)))
    return json(200, { ok: true, notes: notes.slice(0, MAX_NOTES) })
  }
  const ids = [...new Set((Array.isArray(body.sleeper_ids) ? body.sleeper_ids : []).map(str).filter((id) => /^\d+$/.test(id)))]
    .slice(0, MAX_PLAYERS)
  if (!ids.length) return json(200, { ok: true, notes: [] })

  const [{ data: players, error }, { data: insider }] = await Promise.all([
    admin.from('nfl_players').select('sleeper_id, espn_id, full_name, position, team, headshot_url').in('sleeper_id', ids),
    admin
      .from('fantasy_insider_news')
      .select('tweet_id, handle, author_name, posted_at, url, sleeper_ids, headline, summary, impact')
      .eq('status', 'show')
      .overlaps('sleeper_ids', ids)
      .gte('posted_at', new Date(Date.now() - INSIDER_WINDOW_MS).toISOString())
      .order('posted_at', { ascending: false })
      .limit(MAX_INSIDER),
  ])
  if (error) return json(502, { error: error.message })

  const meta = new Map((players || []).map((p) => [str(p.sleeper_id), p]))
  const list = (players || []).filter((p) => str(p.espn_id))
  const feeds = await mapLimit(list, CONCURRENCY, (p) => playerFeed(str(p.espn_id), admin).catch(() => [] as FeedNote[]))
  const cutoff = Date.now() - NOTE_WINDOW_MS
  const playerFields = (p: Obj) => ({
    sleeper_id: str(p.sleeper_id),
    player: str(p.full_name),
    position: str(p.position),
    team: str(p.team),
    headshot_url: str(p.headshot_url) || null,
  })
  const notes: Obj[] = list.flatMap((p, i) =>
    (feeds[i] || [])
      .filter((n) => n.published && Date.parse(n.published) >= cutoff)
      .map((n) => ({
        id: n.id,
        kind: 'rotowire',
        ...playerFields(p),
        headline: n.headline,
        story: n.story,
        published: n.published,
        source: 'Rotowire via ESPN',
        url: `https://www.espn.com/nfl/player/_/id/${str(p.espn_id)}`,
      })),
  )
  const wanted = new Set(ids)
  for (const row of insider || []) {
    const id = (row.sleeper_ids as string[] || []).find((x) => wanted.has(String(x)))
    const p = id ? meta.get(String(id)) : null
    if (!p) continue
    notes.push({
      id: `x:${row.tweet_id}`,
      kind: 'insider',
      ...playerFields(p),
      headline: str(row.headline),
      story: str(row.summary),
      impact: str(row.impact),
      published: row.posted_at,
      source: `${str(row.author_name) || `@${str(row.handle)}`} on X`,
      url: str(row.url),
    })
  }
  // Rotowire usually re-reports an insider's post minutes later; keep the insider item and drop the echo.
  const insiderAt = new Map<string, number[]>()
  for (const n of notes) {
    if (n.kind !== 'insider') continue
    const list = insiderAt.get(str(n.sleeper_id)) || []
    list.push(Date.parse(str(n.published)))
    insiderAt.set(str(n.sleeper_id), list)
  }
  const kept = notes.filter((n) => {
    if (n.kind !== 'rotowire') return true
    const at = Date.parse(str(n.published))
    return !(insiderAt.get(str(n.sleeper_id)) || []).some((t) => at - t >= -ECHO_AFTER_MS && at - t <= ECHO_WINDOW_MS)
  })
  kept.sort((a, b) => Date.parse(str(b.published)) - Date.parse(str(a.published)))
  return json(200, { ok: true, notes: kept.slice(0, MAX_NOTES) })
})
