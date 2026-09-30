/**
 * Logged-in Lounge game hub News tab (NFL + CFB): ESPN injuries, preview/recap, Rotowire player notes,
 * and team stories tagged only with this matchup.
 *
 * User JWT:
 *   { event_id, sport_key, status?, commence_time?, away: { abbrev, name?, team_id? }, home: { ... } }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { buildGameNews } from '../_shared/loungeGameNews.ts'
import type { LoungeSportsGame } from '../_shared/loungeSportsScoreboard.ts'
import { sharedCached } from '../_shared/edgeSharedCache.ts'

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

function sideFrom(raw: unknown) {
  const s = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const teamId = s.team_id
  return {
    abbrev: String(s.abbrev || '').trim(),
    name: String(s.name || '').trim(),
    mascot: String(s.mascot || '').trim(),
    team_id: teamId == null || teamId === '' ? null : (teamId as number),
  }
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const userId = await userIdFromJwt(jwt, admin)
  if (!userId) return json(401, { error: 'Invalid or expired session.' })

  const eventId = String(body?.event_id || '').trim()
  const sportKey = String(body?.sport_key || '').trim()
  const away = sideFrom(body?.away)
  const home = sideFrom(body?.home)
  if (!eventId || !sportKey || !away.abbrev || !home.abbrev) {
    return json(400, { error: 'event_id, sport_key, away.abbrev, and home.abbrev are required.' })
  }
  const statusRaw = String(body?.status || '').trim()
  const game = {
    id: eventId,
    sport_key: sportKey,
    status: statusRaw === 'in' || statusRaw === 'post' ? statusRaw : 'pre',
    commence_time: String(body?.commence_time || '').trim(),
    away,
    home,
  } as unknown as LoungeSportsGame

  try {
    const payload = await sharedCached(
      `news:${sportKey}:${eventId}:${game.status}`,
      { ttlMs: 5 * 60 * 1000, leaseMs: 30_000, admin },
      () => buildGameNews(game),
    )
    if (!payload) return json(200, { news: null })
    return json(200, { news: payload as unknown as Record<string, unknown> })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Game news failed.' })
  }
})
