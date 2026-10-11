/**
 * Yahoo Fantasy OAuth redirect target.
 * Query: ?code=&state=  (or ?error=)
 * Exchanges code, syncs leagues, redirects:
 * - native (`n.*` state) → edgetilt://yahoo-oauth?… (ASWebAuthenticationSession)
 * - web → /fantasy-yahoo-return.html (Safari / browser fallback)
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  completeYahooOAuth,
  yahooErrorRedirect,
  yahooOAuthReturnModeFromState,
  yahooSuccessRedirect,
} from '../_shared/fantasyYahooSync.ts'

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const state = (url.searchParams.get('state') || '').trim()
  const returnMode = yahooOAuthReturnModeFromState(state)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return redirect(yahooErrorRedirect('Server misconfigured.', returnMode))
  }

  const err = url.searchParams.get('error') || url.searchParams.get('error_description')
  if (err) return redirect(yahooErrorRedirect(err, returnMode))

  const code = (url.searchParams.get('code') || '').trim()
  if (!code || !state) {
    return redirect(yahooErrorRedirect('Missing OAuth code or state.', returnMode))
  }

  const admin = createClient(supabaseUrl, serviceKey)
  try {
    const result = await completeYahooOAuth(admin, state, code)
    if (!result.ok) {
      return redirect(yahooErrorRedirect(result.error || 'Yahoo link failed.', returnMode))
    }
    return redirect(yahooSuccessRedirect({}, returnMode))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return redirect(yahooErrorRedirect(message, returnMode))
  }
})
