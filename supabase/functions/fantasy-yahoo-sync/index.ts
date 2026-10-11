/**
 * Re-sync Yahoo Fantasy connection (or set primary league via shared client path).
 * Body:
 *   { }                 → sync active yahoo connection
 *   { connection_id }   → sync that connection
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { syncYahooConnection } from '../_shared/fantasyYahooSync.ts'

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

  const body = (await req.json().catch(() => ({}))) as { connection_id?: string }

  let q = admin
    .from('fantasy_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'yahoo')
    .eq('status', 'active')
  if (body?.connection_id) q = q.eq('id', String(body.connection_id))
  const { data: conn } = await q.maybeSingle()
  if (!conn?.id) {
    return json(404, { error: 'No active Yahoo connection. Connect Yahoo first.' })
  }

  const result = await syncYahooConnection(admin, userId, String(conn.id))
  if (!result.ok) return json(400, { error: result.error || 'Sync failed.', ...result })
  return json(200, { ok: true, ...result })
})
