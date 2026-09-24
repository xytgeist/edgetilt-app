/**
 * Logged-in Lounge NFL game hub: Players + Fantasy (Sleeper / Kalshi / FantasyPros).
 *
 * User JWT:
 *   { event_id, away_abbrev, home_abbrev }
 *
 * Service role (ops backfill):
 *   { mirror_headshots: true, limit?: number }
 *   { mirror_nflcom_headshots: true, items: [{ sleeper_id, espn_id, source_url }] }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isKnownServiceRoleBearer } from '../_shared/adminAuth.ts'
import { buildNflGameFantasy } from '../_shared/loungeNflGameFantasy.ts'
import {
  mirrorNflComHeadshotsBatch,
  mirrorNflPlayerHeadshotsBatch,
} from '../_shared/nflPlayerHeadshotR2.ts'

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

  // Ops: service-role bearer mirrors ESPN headshots → R2
  if (body?.mirror_headshots === true) {
    if (!isKnownServiceRoleBearer(jwt, serviceKey, supabaseUrl)) {
      return json(403, { error: 'Service role required for headshot mirror.' })
    }
    try {
      const result = await mirrorNflPlayerHeadshotsBatch(admin, {
        limit: Number(body.limit) || 40,
      })
      return json(200, result)
    } catch (err) {
      return json(502, { error: err instanceof Error ? err.message : 'Headshot mirror failed.' })
    }
  }

  // Ops: NFL.com masters (nflverse URLs) → R2 v2
  if (body?.mirror_nflcom_headshots === true) {
    if (!isKnownServiceRoleBearer(jwt, serviceKey, supabaseUrl)) {
      return json(403, { error: 'Service role required for headshot mirror.' })
    }
    try {
      const items = Array.isArray(body.items) ? body.items : []
      const result = await mirrorNflComHeadshotsBatch(
        admin,
        items as Array<{ sleeper_id: string; espn_id: string; source_url: string }>,
      )
      return json(200, result)
    } catch (err) {
      return json(502, { error: err instanceof Error ? err.message : 'NFL.com headshot mirror failed.' })
    }
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
    const payload = await buildNflGameFantasy(admin, { eventId, awayAbbrev, homeAbbrev })
    return json(200, payload)
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Fantasy payload failed.' })
  }
})
