/**
 * Pending trade offers for one of the caller's leagues, read live from the host so Offer Review can grade them.
 * Body: { league_id }. ESPN only for now (Sleeper's public API has no proposals; Yahoo waits on API approval).
 * Returns { ok, provider, supported, offers: PendingTrade[] }.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { espnPendingTrades } from '../_shared/fantasyEspnSync.ts'

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

  const body = (await req.json().catch(() => ({}))) as { league_id?: unknown }
  const leagueId = String(body.league_id || '').trim()
  if (!leagueId) return json(400, { error: 'league_id required.' })

  const { data: league } = await admin
    .from('fantasy_leagues')
    .select('id, provider, connection_id, external_league_id, season')
    .eq('id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!league) return json(404, { error: 'League not found.' })

  try {
    if (league.provider === 'espn') {
      const offers = await espnPendingTrades(admin, userId, {
        id: String(league.id),
        connection_id: String(league.connection_id),
        external_league_id: String(league.external_league_id),
        season: Number(league.season),
      })
      return json(200, { ok: true, provider: 'espn', supported: true, offers })
    }
    return json(200, { ok: true, provider: league.provider, supported: false, offers: [] })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Could not read trade offers.' })
  }
})
