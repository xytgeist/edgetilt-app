/**
 * Re-sync an existing Sleeper connection (or return hub pin ids).
 * Body:
 *   { }                    → sync primary/active sleeper connection
 *   { connection_id }      → sync that connection
 *   { hub_pins: true }     → return mine/enemy starter sleeper_ids for primary league
 *   { primary_league_id }  → set primary league then sync
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { hubPinsForUser, syncSleeperConnection } from '../_shared/fantasySleeperSync.ts'

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

  const body = (await req.json().catch(() => ({}))) as {
    connection_id?: string
    hub_pins?: boolean
    primary_league_id?: string
  }

  if (body?.hub_pins === true) {
    const pins = await hubPinsForUser(admin, userId)
    return json(200, { ok: true, ...pins })
  }

  const primaryLeagueId = String(body?.primary_league_id || '').trim()
  if (primaryLeagueId) {
    const { data: lg } = await admin
      .from('fantasy_leagues')
      .select('id, connection_id')
      .eq('id', primaryLeagueId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!lg?.id) return json(404, { error: 'League not found.' })
    await admin.from('fantasy_leagues').update({ is_primary: false }).eq('connection_id', lg.connection_id)
    await admin.from('fantasy_leagues').update({ is_primary: true }).eq('id', lg.id)
    await admin
      .from('fantasy_connections')
      .update({ primary_league_id: lg.id })
      .eq('id', lg.connection_id)
      .eq('user_id', userId)
  }

  let q = admin
    .from('fantasy_connections')
    .select('id, external_user_id')
    .eq('user_id', userId)
    .eq('provider', 'sleeper')
    .eq('status', 'active')
  if (body?.connection_id) q = q.eq('id', String(body.connection_id))
  const { data: conn } = await q.maybeSingle()
  if (!conn?.id || !conn.external_user_id) {
    return json(404, { error: 'No active Sleeper connection. Link a username first.' })
  }

  const result = await syncSleeperConnection(
    admin,
    userId,
    String(conn.id),
    String(conn.external_user_id),
  )
  if (!result.ok) return json(400, { error: result.error || 'Sync failed.', ...result })
  return json(200, { ok: true, ...result })
})
