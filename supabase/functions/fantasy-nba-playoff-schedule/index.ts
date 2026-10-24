/**
 * NBA fantasy playoff schedule for one of the caller's leagues: each playoff week's dates and how many games every
 * NBA team (Sleeper abbreviations) plays that week. Body: { league_id }.
 * ESPN / Yahoo weeks come from the sync (`settings.playoff_dates`); Sleeper weeks are estimated from its week math.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { userIdFromJwt } from '../_shared/userJwt.ts'
import { type PlayoffWeek, sleeperPlayoffWeeks, teamGamesBetween } from '../_shared/fantasyNbaPlayoffs.ts'

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

function storedWeeks(raw: unknown): PlayoffWeek[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((w) => ({ week: Number(w?.week) || 0, start: String(w?.start || ''), end: String(w?.end || '') }))
    .filter((w) => w.week > 0 && /^\d{4}-\d{2}-\d{2}$/.test(w.start) && /^\d{4}-\d{2}-\d{2}$/.test(w.end))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'Sign in required.' })
  const admin = createClient(supabaseUrl, serviceKey)
  const userId = await userIdFromJwt(authHeader.replace(/^Bearer\s+/i, '').trim(), admin)
  if (!userId) return json(401, { error: 'Invalid session.' })

  const body = (await req.json().catch(() => ({}))) as { league_id?: unknown }
  const leagueId = String(body.league_id || '').trim()
  if (!leagueId) return json(400, { error: 'league_id required.' })

  const { data: league } = await admin
    .from('fantasy_leagues')
    .select('id, provider, sport, settings')
    .eq('id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!league) return json(404, { error: 'League not found.' })
  if (String(league.sport) !== 'nba') return json(200, { ok: true, weeks: [] })

  const settings = (league.settings || {}) as Record<string, unknown>
  let weeks = storedWeeks(settings.playoff_dates)
  let estimated = false
  if (!weeks.length && league.provider === 'sleeper') {
    weeks = await sleeperPlayoffWeeks(settings)
    estimated = weeks.length > 0
  }
  const withGames = await Promise.all(weeks.map(async (w) => ({ ...w, games: await teamGamesBetween(w.start, w.end, admin) })))
  return json(200, { ok: true, estimated, weeks: withGames })
})
