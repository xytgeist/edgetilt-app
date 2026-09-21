/**
 * Logged-in Lounge scoreboard for the in-post game pill + game hub.
 * Slate: TheRundown day events (live_game_state when the key has it).
 * Hub detail: plays, player stats, multi-book Odds API lines.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildLoungeSportsScoreboard, fetchLoungeSportsGameDetail } from '../_shared/loungeSportsScoreboard.ts'

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
    return json(401, { error: 'Missing Authorization bearer token.' })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) return json(401, { error: 'Invalid or expired session.' })

  let eventId = ''
  try {
    const body = await req.json().catch(() => ({}))
    eventId = String(body?.event_id || '').trim()
  } catch {
    eventId = ''
  }

  try {
    const board = await buildLoungeSportsScoreboard()
    if (!eventId) {
      return json(200, { ok: true, ...board, fetched_at: new Date().toISOString() })
    }
    const game = board.games.find((g) => g.id === eventId)
    if (!game) return json(404, { error: 'Game not on the current slate.' })
    const detail = await fetchLoungeSportsGameDetail(game)
    return json(200, {
      ok: true,
      game: { ...game, live: detail.live || game.live },
      odds: detail.odds,
      plays: detail.plays,
      stats: detail.stats,
      fetched_at: new Date().toISOString(),
    })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Scoreboard failed.' })
  }
})
