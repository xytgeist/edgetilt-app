/**
 * Invoke `lounge-sports-scoreboard` with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} [body]
 */
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

  if (error) {
    let message = error.message || 'Scoreboard request failed.'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json()
        if (errBody?.error) message = String(errBody.error)
      }
    } catch {
      /* ignore */
    }
    return { error: message }
  }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}

export const LOUNGE_SPORTS_SCOREBOARD_CACHE_KEY = 'lvsp:loungeSportsScoreboard:v1'
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
 * Hub-open detail: live clock/down, multi-book odds, PBP, player stats.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} eventId
 */
export async function loungeSportsGameDetail(supabase, eventId) {
  const id = String(eventId || '').trim()
  if (!id) return { error: 'Missing event.' }
  return loungeSportsScoreboard(supabase, { event_id: id })
}
