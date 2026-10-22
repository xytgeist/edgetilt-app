/**
 * Invoke `lounge-sports-scoreboard` with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} [body]
 */
async function edgeInvokeErrorMessage(error, fallback) {
  let message = error?.message || fallback
  try {
    const ctx = error?.context
    if (ctx && typeof ctx.json === 'function') {
      const errBody = await ctx.json()
      if (errBody?.error) message = String(errBody.error)
      else if (errBody?.message) {
        const code = errBody.code ? `${errBody.code}: ` : ''
        message = `${code}${errBody.message}`
      }
      if (/WORKER_RESOURCE_LIMIT/i.test(String(errBody?.code || message))) {
        message = 'Fantasy board is busy … try again in a few seconds.'
      }
    }
  } catch {
    /* ignore */
  }
  return message
}

export async function loungeSportsScoreboard(supabase, body = {}) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for live scores.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const { data, error } = await supabase.functions.invoke('lounge-sports-scoreboard', {
    body: body && typeof body === 'object' ? body : {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) return { error: await edgeInvokeErrorMessage(error, 'Scoreboard request failed.') }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}

export const LOUNGE_SPORTS_SCOREBOARD_CACHE_KEY = 'lvsp:loungeSportsScoreboard:v4'
const LOUNGE_SPORTS_SCOREBOARD_CACHE_MAX_MS = 24 * 60 * 60 * 1000

let scoreboardMemory = { games: null, fetchedAt: 0 }

function cacheStillFresh(fetchedAt) {
  const at = Number(fetchedAt)
  return Number.isFinite(at) && at > 0 && Date.now() - at < LOUNGE_SPORTS_SCOREBOARD_CACHE_MAX_MS
}

/** Last successful slate. Memory first, then localStorage. Null if missing or older than 24h. */
export function readLoungeSportsScoreboardCache() {
  if (Array.isArray(scoreboardMemory.games) && cacheStillFresh(scoreboardMemory.fetchedAt)) {
    return scoreboardMemory.games
  }
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOUNGE_SPORTS_SCOREBOARD_CACHE_KEY) || 'null')
    const games = parsed?.games
    if (!Array.isArray(games) || !games.length || !cacheStillFresh(parsed?.fetched_at)) return null
    scoreboardMemory = { games, fetchedAt: Number(parsed.fetched_at) }
    return games
  } catch {
    return null
  }
}

export function writeLoungeSportsScoreboardCache(games) {
  if (!Array.isArray(games) || !games.length) return
  const fetchedAt = Date.now()
  scoreboardMemory = { games, fetchedAt }
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LOUNGE_SPORTS_SCOREBOARD_CACHE_KEY,
      JSON.stringify({ fetched_at: fetchedAt, games }),
    )
  } catch {
    /* quota / private mode */
  }
}

/**
 * Teams + kickoff for a board game, so a detail lookup still lands if the board switched this game's source id.
 * @param {{ sport_key?: string, away?: { abbrev?: string }, home?: { abbrev?: string }, commence_time?: string } | null} game
 */
export function loungeSportsGameMatch(game) {
  const away = String(game?.away?.abbrev || '').trim()
  const home = String(game?.home?.abbrev || '').trim()
  const sport = String(game?.sport_key || '').trim()
  if (!away || !home || !sport) return null
  return { sport_key: sport, away, home, commence_time: String(game?.commence_time || '') }
}

/**
 * Hub-open detail: live clock/down, multi-book odds, PBP, player stats.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} eventId
 * @param {{ omitRosters?: boolean, match?: ReturnType<typeof loungeSportsGameMatch> }} [opts] omitRosters: caller
 *   already holds this game's rosters (static in-game). match: teams + kickoff fallback for a switched source id.
 */
export async function loungeSportsGameDetail(supabase, eventId, opts = {}) {
  const id = String(eventId || '').trim()
  if (!id) return { error: 'Missing event.' }
  const body = { event_id: id }
  if (opts.omitRosters) body.omit_rosters = true
  if (opts.match) body.match = opts.match
  return loungeSportsScoreboard(supabase, body)
}

/**
 * Game-scoped CFB Players roster (cfb_players … no Fantasy) + Kalshi / Polymarket game markets.
 * Names + kickoff let the Edge match venue events whose codes differ from ESPN abbrevs.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ eventId: string, awayAbbrev: string, homeAbbrev: string, awayName?: string, homeName?: string, commenceTime?: string }} opts
 */
export async function loungeCfbGamePlayers(supabase, opts) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for roster data.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const body = {
    event_id: String(opts?.eventId || '').trim(),
    away_abbrev: String(opts?.awayAbbrev || '').trim(),
    home_abbrev: String(opts?.homeAbbrev || '').trim(),
    away_name: String(opts?.awayName || '').trim(),
    home_name: String(opts?.homeName || '').trim(),
    commence_time: String(opts?.commenceTime || '').trim(),
  }
  if (!body.event_id || !body.away_abbrev || !body.home_abbrev) {
    return { error: 'Missing event or teams.' }
  }

  const { data, error } = await supabase.functions.invoke('lounge-cfb-game-players', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) return { error: await edgeInvokeErrorMessage(error, 'CFB roster request failed.') }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}

/**
 * Game hub News tab (NFL + CFB): ESPN injuries, preview/recap, Rotowire notes, matchup stories.
 * Returns `{ news }` (null when ESPN has no matching event) or `{ error }`.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string, sport_key: string, status?: string, commence_time?: string, away: object, home: object }} game
 */
export async function loungeGameNews(supabase, game) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for game news.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const side = (s) => ({
    abbrev: String(s?.abbrev || '').trim(),
    name: String(s?.name || '').trim(),
    mascot: String(s?.mascot || '').trim(),
    team_id: s?.team_id ?? null,
  })
  const body = {
    event_id: String(game?.id || '').trim(),
    sport_key: String(game?.sport_key || '').trim(),
    status: String(game?.status || '').trim(),
    commence_time: String(game?.commence_time || '').trim(),
    away: side(game?.away),
    home: side(game?.home),
  }
  if (!body.event_id || !body.sport_key || !body.away.abbrev || !body.home.abbrev) {
    return { error: 'Missing event or teams.' }
  }

  const { data, error } = await supabase.functions.invoke('lounge-game-news', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) return { error: await edgeInvokeErrorMessage(error, 'Game news request failed.') }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return { news: data?.news ?? null }
}

/**
 * Game-scoped Players + Fantasy + Kalshi props.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ eventId: string, awayAbbrev: string, homeAbbrev: string }} opts
 */
/** NBA game hub Players + Fantasy roster (both teams, Sleeper projection + season lines). */
export async function loungeNbaGamePlayers(supabase, opts) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for player data.' }
  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }
  const body = {
    event_id: String(opts?.eventId || '').trim(),
    away_abbrev: String(opts?.awayAbbrev || '').trim(),
    home_abbrev: String(opts?.homeAbbrev || '').trim(),
  }
  if (!body.away_abbrev || !body.home_abbrev) return { error: 'Missing teams.' }
  const { data, error } = await supabase.functions.invoke('lounge-nba-game-players', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) return { error: await edgeInvokeErrorMessage(error, 'Player request failed.') }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}

export async function loungeNflGameFantasy(supabase, opts) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for fantasy data.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const body = {
    event_id: String(opts?.eventId || '').trim(),
    away_abbrev: String(opts?.awayAbbrev || '').trim(),
    home_abbrev: String(opts?.homeAbbrev || '').trim(),
  }
  if (!body.event_id || !body.away_abbrev || !body.home_abbrev) {
    return { error: 'Missing event or teams.' }
  }

  const { data, error } = await supabase.functions.invoke('lounge-nfl-game-fantasy', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) return { error: await edgeInvokeErrorMessage(error, 'Fantasy request failed.') }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}
