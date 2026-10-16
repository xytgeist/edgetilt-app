/**
 * Store a CBS fantasy access token and sync NFL leagues.
 * Body: { access_token: string, league_ids?: string[] }
 * Password is rejected. Never log the token.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { linkAndSyncCbs, normalizeCbsSession } from '../_shared/fantasyCbsSync.ts'

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
    access_token?: string
    league_ids?: unknown
    password?: string
  }
  if (body?.password) {
    return json(400, { error: 'CBS password is not accepted. Log in on the CBS sheet.' })
  }
  const session = normalizeCbsSession(String(body?.access_token || ''), body?.league_ids)
  if (!session) return json(400, { error: 'CBS session missing. Log in on the CBS sheet.' })

  const result = await linkAndSyncCbs(admin, userId, session)
  if (!result.ok) return json(400, { error: result.error || 'CBS link failed.', leagues: result.leagues ?? 0 })
  return json(200, {
    ok: true,
    connectionId: result.connectionId,
    season: result.season,
    week: result.week,
    leagues: result.leagues,
  })
})
