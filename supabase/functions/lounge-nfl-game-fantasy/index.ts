/**
 * Logged-in Lounge NFL game hub: Players + Fantasy (Sleeper / Kalshi / FantasyPros).
 * Body: { event_id, away_abbrev, home_abbrev }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildNflGameFantasy } from '../_shared/loungeNflGameFantasy.ts'

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
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) return json(401, { error: 'Invalid or expired session.' })

  let eventId = ''
  let awayAbbrev = ''
  let homeAbbrev = ''
  try {
    const body = await req.json().catch(() => ({}))
    eventId = String(body?.event_id || '').trim()
    awayAbbrev = String(body?.away_abbrev || '').trim()
    homeAbbrev = String(body?.home_abbrev || '').trim()
  } catch {
    /* empty */
  }
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
