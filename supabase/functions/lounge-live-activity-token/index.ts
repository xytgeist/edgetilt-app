/**
 * Register / clear an ActivityKit Live Activity push token for the signed-in user.
 * Native POSTs from EdgeLiveSportsActivity (Keychain JWT).
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'

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

function hexToken(raw: unknown): string | null {
  const tok = String(raw || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!tok || tok.length < 64 || tok.length % 2 !== 0 || !/^[0-9a-f]+$/.test(tok)) return null
  return tok
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
  const userId = await userIdFromJwt(jwt, admin)
  if (!userId) return json(401, { error: 'Invalid or expired session.' })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const gameId = String(body?.gameId || '').trim()
  const watching = body?.watching !== false
  const environment = String(body?.environment || 'production').trim().toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production'
  const bundleId = String(body?.bundleId || 'com.edgetilt.app').trim() || 'com.edgetilt.app'

  if (!watching || body?.ended === true) {
    let q = admin.from('live_activity_push_tokens').delete().eq('user_id', userId)
    if (gameId) q = q.eq('game_id', gameId)
    const { error } = await q
    if (error) return json(500, { error: error.message })
    return json(200, { ok: true, ended: true })
  }

  const token = hexToken(body?.token)
  if (!token) return json(400, { error: 'Invalid Live Activity push token.' })
  if (!gameId) return json(400, { error: 'Missing gameId.' })

  await admin.from('live_activity_push_tokens').delete().eq('token', token)
  await admin.from('live_activity_push_tokens').delete().eq('user_id', userId).neq('game_id', gameId)

  const { error } = await admin.from('live_activity_push_tokens').upsert(
    {
      user_id: userId,
      game_id: gameId,
      token,
      environment,
      bundle_id: bundleId,
    },
    { onConflict: 'user_id,game_id' },
  )
  if (error) return json(500, { error: error.message })
  return json(200, { ok: true, registered: true })
})
