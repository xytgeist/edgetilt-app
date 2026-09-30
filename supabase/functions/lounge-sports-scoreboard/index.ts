/**
 * Logged-in Lounge scoreboard for the in-post game pill + game hub.
 * Slate: TheRundown day events (live_game_state when the key has it).
 * Hub detail: plays, player stats, multi-book Odds API lines.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cachedLoungeSportsScoreboard, fetchLoungeSportsGameDetail } from '../_shared/loungeSportsScoreboard.ts'
import { loadPastedBettingSplitsForSlate } from '../_shared/loungeBotBettingSplits.ts'
import { sharedCached } from '../_shared/edgeSharedCache.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Memory + shared-row caches (`edgeSharedCache.ts`): the pill poll and every hub viewer, across all isolates,
 * reuse one slate build and one detail build (TheRundown + ESPN + Odds) per TTL.
 */
const BOARD_TTL_MS = 8_000
const DETAIL_TTL_MS = 4_000

function cachedDetail(key: string, admin: ReturnType<typeof createClient>, build: () => Promise<Record<string, unknown> | null>) {
  return sharedCached(`scoreboard:detail:${key}`, { ttlMs: DETAIL_TTL_MS, leaseMs: 15_000, admin }, build)
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
    const board = await cachedLoungeSportsScoreboard(admin, BOARD_TTL_MS)
    if (!eventId) {
      return json(200, { ok: true, ...board, fetched_at: new Date().toISOString() })
    }
    const game = board.games.find((g) => g.id === eventId)
    if (!game) return json(404, { error: 'Game not on the current slate.' })
    const payload = await cachedDetail(eventId, admin, async () => {
      const detail = await fetchLoungeSportsGameDetail(game, admin)
      const splitMap = await loadPastedBettingSplitsForSlate(admin, game.sport_key, [
        {
          id: game.id,
          home_team: game.home?.name || game.home?.mascot || '',
          away_team: game.away?.name || game.away?.mascot || '',
        },
      ])
      const summary = splitMap.get(game.id)
      const splits = summary
        ? {
            away_ticket_pct: Math.round(Number(summary.awayTicketPct) || 0),
            away_handle_pct: Math.round(Number(summary.awayHandlePct) || 0),
            home_ticket_pct: Math.round(Number(summary.homeTicketPct) || 0),
            home_handle_pct: Math.round(Number(summary.homeHandlePct) || 0),
            source: summary.source || null,
            is_fade_public: Boolean(summary.isFadePublic),
            divergence_pts: Math.round(Number(summary.divergencePts) || 0),
          }
        : null
      return {
        ok: true,
        game: { ...game, live: detail.live || game.live },
        odds: detail.odds,
        plays: detail.plays,
        stats: detail.stats,
        team_stats: detail.team_stats,
        player_box: detail.player_box,
        rosters: detail.rosters,
        splits,
        fetched_at: new Date().toISOString(),
      }
    })
    return json(200, payload || { error: 'Scoreboard failed.' })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Scoreboard failed.' })
  }
})
