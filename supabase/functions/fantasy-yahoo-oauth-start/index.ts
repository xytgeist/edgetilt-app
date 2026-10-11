/**
 * Start Yahoo Fantasy OAuth … returns authorize URL for the signed-in user.
 * Body: { returnMode?: 'native' | 'web' }
 * - native → callback 302s to edgetilt://yahoo-oauth (ASWebAuthenticationSession)
 * - web (default) → /fantasy-yahoo-return.html handoff
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import {
  createYahooOAuthStart,
  type YahooOAuthReturnMode,
} from '../_shared/fantasyYahooSync.ts'

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

  let returnMode: YahooOAuthReturnMode = 'web'
  try {
    const body = await req.json().catch(() => ({}))
    if (body && typeof body === 'object' && body.returnMode === 'native') {
      returnMode = 'native'
    }
  } catch {
    /* empty body ok */
  }

  try {
    const { url } = await createYahooOAuthStart(admin, userId, { returnMode })
    return json(200, { ok: true, url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(400, { error: message })
  }
})
