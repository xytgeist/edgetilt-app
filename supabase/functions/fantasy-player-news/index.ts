/**
 * Fantasy main page news: recent Rotowire notes (via ESPN fantasy) for the caller's NFL players.
 * Body: { sleeper_ids: string[] } (max 80). Each player's feed is one shared row in `edge_shared_cache`
 * for 20 minutes, so every user rostering the same player shares a single ESPN read.
 * Returns { ok, notes: PlayerNewsNote[] } newest first.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { decodeHtmlEntities } from '../_shared/decodeHtmlEntities.ts'
import { sharedCached } from '../_shared/edgeSharedCache.ts'
import { espnFetch } from '../_shared/loungeSportsScoreboard.ts'

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
async function readPlayerFeed(espnId: string): Promise<FeedNote[]> {
  const res = await espnFetch(
    `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${encodeURIComponent(espnId)}&limit=8`,
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

  const body = (await req.json().catch(() => ({}))) as { sleeper_ids?: unknown }
  const ids = [...new Set((Array.isArray(body.sleeper_ids) ? body.sleeper_ids : []).map(str).filter((id) => /^\d+$/.test(id)))]
    .slice(0, MAX_PLAYERS)
  if (!ids.length) return json(200, { ok: true, notes: [] })

  const { data: players, error } = await admin
    .from('nfl_players')
    .select('sleeper_id, espn_id, full_name, position, team, headshot_url')
    .in('sleeper_id', ids)
    .not('espn_id', 'is', null)
  if (error) return json(502, { error: error.message })

  const list = (players || []).filter((p) => str(p.espn_id))
  const feeds = await mapLimit(list, CONCURRENCY, (p) => playerFeed(str(p.espn_id), admin).catch(() => [] as FeedNote[]))
  const cutoff = Date.now() - NOTE_WINDOW_MS
  const notes = list.flatMap((p, i) =>
    (feeds[i] || [])
      .filter((n) => n.published && Date.parse(n.published) >= cutoff)
      .map((n) => ({
        id: n.id,
        sleeper_id: str(p.sleeper_id),
        player: str(p.full_name),
        position: str(p.position),
        team: str(p.team),
        headshot_url: str(p.headshot_url) || null,
        headline: n.headline,
        story: n.story,
        published: n.published,
        source: 'Rotowire via ESPN',
        url: `https://www.espn.com/nfl/player/_/id/${str(p.espn_id)}`,
      })),
  )
  notes.sort((a, b) => Date.parse(b.published || '') - Date.parse(a.published || ''))
  return json(200, { ok: true, notes: notes.slice(0, MAX_NOTES) })
})
