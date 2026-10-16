/**
 * Store an ESPN fantasy session (espn_s2 + SWID) and sync NFL leagues.
 * Body: { espn_s2: string, swid: string }
 * Password is rejected. Never log the cookie.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { linkAndSyncEspn, normalizeEspnSession } from '../_shared/fantasyEspnSync.ts'

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
    espn_s2?: string
    swid?: string
    password?: string
  }
  if (body?.password) {
    return json(400, { error: 'ESPN password is not accepted. Log in on the ESPN sheet.' })
  }
  const session = normalizeEspnSession(String(body?.espn_s2 || ''), String(body?.swid || ''))
  if (!session) return json(400, { error: 'ESPN session missing. Log in on the ESPN sheet.' })

  const result = await linkAndSyncEspn(admin, userId, session)
  if (!result.ok) return json(400, { error: result.error || 'ESPN link failed.', leagues: result.leagues ?? 0 })
  return json(200, {
    ok: true,
    connectionId: result.connectionId,
    season: result.season,
    week: result.week,
    leagues: result.leagues,
  })
})
