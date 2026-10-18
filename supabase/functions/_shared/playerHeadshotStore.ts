/**
 * Player photos on our R2 instead of ESPN per view.
 *
 * A response that carries ESPN headshot URLs is rewritten at send time to our R2 copy when we have one.
 * Missing copies are queued in the background: one ESPN fetch per player ever, a few per request, spaced out.
 * Each copy stores the full image plus a 192 px thumb and a 512 px card (webp, made by our Cloudflare resizer)
 * so the app never has to fall back to a heavy master.
 *
 * R2 keys: sports/{league}/players/{espn_id}.png, …/players/thumb/{id}.webp, …/players/card/{id}.webp
 * league is ESPN's headshot path segment (nfl, college-football, golf, nba, nhl, mlb, soccer).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  type LoungeCfR2Config,
  loungeCfR2PublicUrl,
  loungeCfR2PutObject,
  readLoungeCfR2Config,
} from './loungeCfR2.ts'

const ESPN_HEADSHOT =
  /^https:\/\/a\.espncdn\.com\/(?:combiner\/i\?img=)?\/?i\/headshots\/([a-z-]+)\/players\/full\/(\d+)\.png/i

const ESPN_HEADERS = {
  Accept: 'image/png,image/*,*/*',
  Referer: 'https://www.espn.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

const KNOWN_TTL_MS = 10 * 60_000
const COPIES_PER_REQUEST = 4
const COPY_GAP_MS = 250

export const HEADSHOT_THUMB_PX = 192
export const HEADSHOT_CARD_PX = 512

type Known = { status: 'ok' | 'missing'; full: string | null }

const known = new Map<string, Known>()
const leagueLoadedAt = new Map<string, number>()
const leagueLoading = new Map<string, Promise<void>>()
const inFlight = new Set<string>()

const keyOf = (league: string, id: string) => `${league}:${id}`

export function headshotFullKey(league: string, id: string) {
  return `sports/${league}/players/${id}.png`
}

export function headshotVariantKey(league: string, id: string, kind: 'thumb' | 'card') {
  return `sports/${league}/players/${kind}/${id}.webp`
}

function parseEspnHeadshot(value: string): { league: string; id: string } | null {
  const m = value.match(ESPN_HEADSHOT)
  if (!m) return null
  return { league: m[1].toLowerCase(), id: m[2] }
}

async function ensureLeague(admin: SupabaseClient, league: string) {
  const at = leagueLoadedAt.get(league) || 0
  if (Date.now() - at < KNOWN_TTL_MS) return
  const pending = leagueLoading.get(league)
  if (pending) return pending
  const run = (async () => {
    const page = 1000
    for (let from = 0; from < 50_000; from += page) {
      const { data, error } = await admin
        .from('player_headshots')
        .select('espn_id, status, full_url')
        .eq('league', league)
        .range(from, from + page - 1)
      if (error) break
      for (const row of data || []) {
        known.set(keyOf(league, String(row.espn_id)), {
          status: row.status === 'ok' ? 'ok' : 'missing',
          full: row.full_url ? String(row.full_url) : null,
        })
      }
      if (!data || data.length < page) break
    }
    leagueLoadedAt.set(league, Date.now())
  })().finally(() => leagueLoading.delete(league))
  leagueLoading.set(league, run)
  return run
}

function collectStrings(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 12 || value == null) return
  if (typeof value === 'string') {
    if (value.includes('espncdn.com') && value.includes('/headshots/')) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out, depth + 1)
  }
}

function mapStrings(value: unknown, swap: Map<string, string>, depth = 0): unknown {
  if (depth > 12 || value == null) return value
  if (typeof value === 'string') return swap.get(value) ?? value
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, swap, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, swap, depth + 1)
    return out
  }
  return value
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Stores a small webp variant of an image that already lives on our R2, using our own resizer. */
export async function storeHeadshotVariant(
  cfg: LoungeCfR2Config,
  fullUrl: string,
  objectKey: string,
  px: number,
): Promise<boolean> {
  const res = await fetch(`${cfg.publicBaseUrl}/cdn-cgi/image/width=${px},quality=75,format=webp/${fullUrl}`, {
    headers: { Accept: 'image/webp,image/*' },
  })
  if (!res.ok) return false
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim()
  if (!type.startsWith('image/')) return false
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength < 200) return false
  await loungeCfR2PutObject(cfg, objectKey, bytes, type)
  return true
}

async function recordHeadshot(admin: SupabaseClient, league: string, id: string, status: 'ok' | 'missing', full: string | null) {
  known.set(keyOf(league, id), { status, full })
  await admin
    .from('player_headshots')
    .upsert({ league, espn_id: id, status, full_url: full, updated_at: new Date().toISOString() })
}

async function copyOne(admin: SupabaseClient, cfg: LoungeCfR2Config, league: string, id: string) {
  const res = await fetch(`https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png`, {
    headers: ESPN_HEADERS,
    redirect: 'follow',
  })
  if (res.status === 404 || res.status === 403) {
    await recordHeadshot(admin, league, id, 'missing', null)
    return
  }
  if (!res.ok) return
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength < 500) {
    await recordHeadshot(admin, league, id, 'missing', null)
    return
  }
  const fullKey = headshotFullKey(league, id)
  await loungeCfR2PutObject(cfg, fullKey, bytes, 'image/png')
  const fullUrl = loungeCfR2PublicUrl(cfg, fullKey)
  await storeHeadshotVariant(cfg, fullUrl, headshotVariantKey(league, id, 'thumb'), HEADSHOT_THUMB_PX)
  await storeHeadshotVariant(cfg, fullUrl, headshotVariantKey(league, id, 'card'), HEADSHOT_CARD_PX)
  await recordHeadshot(admin, league, id, 'ok', fullUrl)
}

function queueCopies(admin: SupabaseClient, cfg: LoungeCfR2Config, items: Array<{ league: string; id: string }>) {
  const batch = items.filter((item) => !inFlight.has(keyOf(item.league, item.id))).slice(0, COPIES_PER_REQUEST)
  if (!batch.length) return
  for (const item of batch) inFlight.add(keyOf(item.league, item.id))
  const run = (async () => {
    for (const item of batch) {
      try {
        await copyOne(admin, cfg, item.league, item.id)
      } catch {
        /* transient … the next request can try again */
      } finally {
        inFlight.delete(keyOf(item.league, item.id))
      }
      await sleep(COPY_GAP_MS)
    }
  })()
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(run)
}

/**
 * Swap ESPN headshot URLs in a response for our R2 copies, and queue copies for the ones we do not have yet.
 * Returns a new object (never mutates a shared cached payload). Any failure returns the body unchanged.
 */
export async function withStoredHeadshots<T>(admin: SupabaseClient, body: T): Promise<T> {
  try {
    const cfg = readLoungeCfR2Config()
    if (!cfg) return body
    const found = new Set<string>()
    collectStrings(body, found)
    if (!found.size) return body
    const parsed = new Map<string, { league: string; id: string }>()
    for (const value of found) {
      const hit = parseEspnHeadshot(value)
      if (hit) parsed.set(value, hit)
    }
    if (!parsed.size) return body
    const leagues = new Set([...parsed.values()].map((p) => p.league))
    await Promise.all([...leagues].map((league) => ensureLeague(admin, league)))
    const swap = new Map<string, string>()
    const todo: Array<{ league: string; id: string }> = []
    for (const [value, { league, id }] of parsed) {
      const hit = known.get(keyOf(league, id))
      if (hit?.status === 'ok') swap.set(value, hit.full || loungeCfR2PublicUrl(cfg, headshotFullKey(league, id)))
      else if (!hit) todo.push({ league, id })
    }
    if (todo.length) queueCopies(admin, cfg, todo)
    return swap.size ? (mapStrings(body, swap) as T) : body
  } catch {
    return body
  }
}

/** Ops: thumb + card for NFL masters already on R2 (no ESPN fetch). */
export async function backfillNflHeadshotVariants(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<{ ok: true; scanned: number; made: number; failed: number; remaining: number }> {
  const cfg = readLoungeCfR2Config()
  if (!cfg) throw new Error('R2 is not configured.')
  const limit = Math.max(1, Math.min(60, Number(opts.limit) || 30))
  await ensureLeague(admin, 'nfl')
  const { data: rows, error } = await admin
    .from('nfl_players')
    .select('espn_id, headshot_url')
    .not('espn_id', 'is', null)
    .ilike('headshot_url', '%/sports/nfl/players/%')
    .not('headshot_url', 'ilike', '%/_skip/%')
    .limit(2000)
  if (error) throw new Error(error.message)
  const pending = (rows || []).filter((row) => {
    const id = String(row.espn_id || '').replace(/\D/g, '')
    return id && known.get(keyOf('nfl', id))?.status !== 'ok'
  })
  let made = 0
  let failed = 0
  for (const row of pending.slice(0, limit)) {
    const id = String(row.espn_id).replace(/\D/g, '')
    const full = String(row.headshot_url)
    try {
      const thumb = await storeHeadshotVariant(cfg, full, headshotVariantKey('nfl', id, 'thumb'), HEADSHOT_THUMB_PX)
      const card = await storeHeadshotVariant(cfg, full, headshotVariantKey('nfl', id, 'card'), HEADSHOT_CARD_PX)
      if (thumb && card) {
        await recordHeadshot(admin, 'nfl', id, 'ok', full)
        made += 1
      } else {
        failed += 1
      }
    } catch {
      failed += 1
    }
  }
  return { ok: true, scanned: Math.min(limit, pending.length), made, failed, remaining: Math.max(0, pending.length - made) }
}
