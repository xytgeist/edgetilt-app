/**
 * Service-role / pg_cron: daily bulk sync for cashtag symbol lookup (`market_instruments`).
 * Schedule via migration 20260723280000_market_symbol_lookup_cron.sql.
 *
 * Manual smoke (after deploy):
 *   select public.invoke_lounge_market_symbol_sync();
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isKnownServiceRoleBearer } from '../_shared/adminAuth.ts'
import { syncMarketSymbolLookupIfStale } from '../_shared/marketSymbolLookup.ts'

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

function isAuthorized(req: Request, serviceRoleKey: string, supabaseUrl: string): boolean {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  return isKnownServiceRoleBearer(bearer, serviceRoleKey, supabaseUrl)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
  }
  if (!isAuthorized(req, serviceRoleKey, supabaseUrl)) {
    return json(401, { error: 'Unauthorized' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const synced = await syncMarketSymbolLookupIfStale(admin)
    const { data: meta } = await admin
      .from('market_symbol_lookup_meta')
      .select('last_sync_at, row_count')
      .eq('id', 1)
      .maybeSingle()

    return json(200, {
      ok: true,
      synced,
      row_count: Number(meta?.row_count) || 0,
      last_sync_at: meta?.last_sync_at || null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('lounge-market-symbol-sync', msg)
    return json(500, { error: msg || 'Symbol sync failed.' })
  }
})
