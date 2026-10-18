/**
 * Waiver pool for one of the caller's leagues (available = not rostered by any team in that league).
 * Body: { league_id, mode? } … mode `trades` also returns `league_players` (every rostered player's weekly lines);
 * mode `sniper` adds boom candidates (Kalshi props / next man up / matchup) and RB handcuffs.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { buildFantasyWaivers } from '../_shared/fantasyWaivers.ts'

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

  const body = (await req.json().catch(() => ({}))) as { league_id?: unknown; mode?: unknown }
  const leagueId = String(body.league_id || '').trim()
  if (!leagueId) return json(400, { error: 'league_id required.' })

  try {
    const mode = String(body.mode || '').trim()
    return json(200, { ok: true, ...(await buildFantasyWaivers(admin, userId, leagueId, { mode })) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Waivers failed.'
    return json(msg === 'League not found.' ? 404 : 502, { error: msg })
  }
})
