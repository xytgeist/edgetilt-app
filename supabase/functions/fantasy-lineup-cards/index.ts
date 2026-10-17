/**
 * Lineup card context for Fantasy home.
 * Body: { sport?: 'nfl'|'nba'|'nhl'|'mlb', players: [{ sleeper_id, name?, position?, team? }] }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { buildFantasyLineupCards, buildSportLineupCards } from '../_shared/fantasyLineupCards.ts'

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
    return json(401, { error: 'Sign in required.' })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)
  const userId = await userIdFromJwt(jwt, admin)
  if (!userId) return json(401, { error: 'Invalid session.' })

  const body = (await req.json().catch(() => ({}))) as { players?: unknown; sport?: unknown }
  const players = Array.isArray(body.players) ? body.players : []
  if (!players.length) return json(200, { ok: true, cards: {} })
  const sport = String(body.sport || 'nfl').toLowerCase()

  try {
    const list = players as Array<Record<string, string>>
    const result = sport === 'nba' || sport === 'nhl' || sport === 'mlb'
      ? await buildSportLineupCards(list, sport)
      : await buildFantasyLineupCards(admin, list)
    return json(200, { ok: true, ...result })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Lineup cards failed.' })
  }
})
