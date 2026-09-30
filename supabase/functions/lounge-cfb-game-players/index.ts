/**
 * Logged-in Lounge CFB game hub: Players roster from cfb_players (no Fantasy)
 * + Kalshi / Polymarket game, half, and team-total markets.
 *
 * User JWT:
 *   { event_id, away_abbrev, home_abbrev, away_name?, home_name?, commence_time? }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCfbGamePlayers } from '../_shared/loungeCfbGamePlayers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Roster rows + the 90s shared props row are read once per isolate per window, not once per viewer poll. */
const MEM_TTL_MS = 20_000
const memCache = new Map<string, { at: number; promise: ReturnType<typeof buildCfbGamePlayers> }>()

function memoPlayers(key: string, build: () => ReturnType<typeof buildCfbGamePlayers>) {
  const hit = memCache.get(key)
  if (hit && Date.now() - hit.at < MEM_TTL_MS) return hit.promise
  for (const [k, v] of memCache) if (Date.now() - v.at >= MEM_TTL_MS) memCache.delete(k)
  const entry = { at: Date.now(), promise: build() }
  memCache.set(key, entry)
  entry.promise.catch(() => {
    if (memCache.get(key) === entry) memCache.delete(key)
  })
  return entry.promise
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Missing Authorization bearer token.' })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    body = {}
  }

  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) return json(401, { error: 'Invalid or expired session.' })

  const eventId = String(body?.event_id || '').trim()
  const awayAbbrev = String(body?.away_abbrev || '').trim()
  const homeAbbrev = String(body?.home_abbrev || '').trim()
  if (!eventId || !awayAbbrev || !homeAbbrev) {
    return json(400, { error: 'event_id, away_abbrev, and home_abbrev are required.' })
  }

  try {
    const payload = await memoPlayers(`${eventId}:${awayAbbrev}:${homeAbbrev}`, () =>
      buildCfbGamePlayers(admin, {
        eventId,
        awayAbbrev,
        homeAbbrev,
        awayName: String(body?.away_name || '').trim(),
        homeName: String(body?.home_name || '').trim(),
        commenceIso: String(body?.commence_time || '').trim() || null,
      }))
    return json(200, payload as unknown as Record<string, unknown>)
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'CFB roster payload failed.' })
  }
})
