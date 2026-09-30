/**
 * Public, read-only game card for link previews (`/lounge/g/:eventId` OG page + PNG on Vercel).
 * GET `?event_id=…` → teams, logos, score, clock / status, down, broadcast, spread / ML, Pinnacle total. No plays, odds books,
 * splits, or rosters … the logged-in hub keeps using `lounge-sports-scoreboard`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildLoungeSportsScoreboard, type LoungeSportsGame } from '../_shared/loungeSportsScoreboard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Crawlers fan out on a paste (iMessage, Slack, X) … one board build per isolate per window. */
const BOARD_TTL_MS = 20_000
let boardCache: { at: number; games: LoungeSportsGame[] } | null = null

const EVENT_ID_RE = /^[A-Za-z0-9_-]{6,80}$/

function json(status: number, body: Record<string, unknown>, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
    },
  })
}

function publicSide(side: LoungeSportsGame['home']) {
  return {
    name: side?.name || '',
    mascot: side?.mascot || '',
    abbrev: side?.abbrev || '',
    logo: side?.logo || '',
    score: side?.score ?? null,
    spread: side?.spread ?? null,
    ml: side?.ml ?? null,
    record: side?.record ?? null,
    rank: side?.rank ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' })

  const eventId = String(new URL(req.url).searchParams.get('event_id') || '').trim()
  if (!EVENT_ID_RE.test(eventId)) return json(400, { error: 'Missing or invalid event_id.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })

  try {
    if (!boardCache || Date.now() - boardCache.at > BOARD_TTL_MS) {
      const board = await buildLoungeSportsScoreboard(createClient(supabaseUrl, serviceKey))
      boardCache = { at: Date.now(), games: board.games }
    }
    const game = boardCache.games.find((g) => g.id === eventId)
    if (!game) return json(404, { error: 'Game not on the current slate.' }, 60)
    const live = game.live
    return json(200, {
      ok: true,
      game: {
        id: game.id,
        sport_key: game.sport_key,
        sport_label: game.sport_label,
        status: game.status,
        status_label: game.status_label,
        commence_time: game.commence_time,
        broadcast: game.broadcast || null,
        total: game.total ?? null,
        away: publicSide(game.away),
        home: publicSide(game.home),
        live: live
          ? {
            clock: live.clock,
            period: live.period,
            down: live.down,
            distance: live.distance,
            yard_line: live.yard_line,
            yard_side: live.yard_side,
            possession: live.possession,
            status_name: live.status_name ?? null,
            status_detail: live.status_detail ?? null,
          }
          : null,
      },
      fetched_at: new Date().toISOString(),
    }, game.status === 'post' ? 300 : 15)
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Game card failed.' })
  }
})
