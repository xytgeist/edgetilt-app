/**
 * Live-game freshness guards — shared by poll_edges scheduling and publish-due drain.
 */
const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export type LiveScoreRow = {
  id?: string
  sport_key?: string
  commence_time?: string
  completed?: boolean
}

/** Soft cap when Odds API scores lag on completed flag. */
export const MAX_GAME_ELAPSED_MINUTES: Record<string, number> = {
  baseball_mlb: 270,
  basketball_nba: 180,
  basketball_ncaab: 180,
  basketball_wnba: 180,
  americanfootball_nfl: 210,
  americanfootball_nfl_preseason: 210,
  americanfootball_ncaaf: 210,
  icehockey_nhl: 180,
}

export const LIVE_SCHEDULE_MAX_AGE_MS = 30 * 60 * 1000

function oddsApiKey(): string {
  return String(Deno.env.get('THE_ODDS_API_KEY') || '').trim()
}

export function elapsedMinutesSinceCommence(commenceIso: string, now = Date.now()): number {
  const t = Date.parse(String(commenceIso || ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 60_000))
}

export function isEventStillLive(
  sportKey: string,
  commenceIso: string,
  scoreRow: LiveScoreRow | null | undefined,
  now = Date.now(),
): boolean {
  if (scoreRow?.completed === true) return false
  const elapsed = elapsedMinutesSinceCommence(commenceIso, now)
  const max = MAX_GAME_ELAPSED_MINUTES[sportKey] ?? 240
  return elapsed < max
}

export function parseLiveScheduleDedupe(
  dedupeKey: string,
): { sportKey: string; eventId: string } | null {
  const key = String(dedupeKey || '').trim()
  if (!key) return null
  const parts = key.split(':')
  if (parts[0] === 'period' && parts.length >= 3) {
    return { sportKey: parts[1]!, eventId: parts[2]! }
  }
  if (parts[0] === 'live_edge' && parts.length >= 3) {
    return { sportKey: parts[1]!, eventId: parts[2]! }
  }
  return null
}

export async function fetchSportScoresForGuard(sportKey: string): Promise<LiveScoreRow[]> {
  const key = oddsApiKey()
  if (!key) return []
  const qs = new URLSearchParams({
    apiKey: key,
    daysFrom: '1',
    dateFormat: 'iso',
  })
  const res = await fetch(`${ODDS_BASE}/sports/${sportKey}/scores?${qs}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function validateLiveScheduledPost(
  postKind: string,
  dedupeKey: string | null,
  createdAt: string,
  scoreCache: Map<string, LiveScoreRow[]>,
  now = Date.now(),
): Promise<{ valid: boolean; reason?: string }> {
  if (postKind !== 'period_report' && postKind !== 'in_game_edge') {
    return { valid: true }
  }

  const createdMs = Date.parse(String(createdAt || ''))
  if (Number.isFinite(createdMs) && now - createdMs > LIVE_SCHEDULE_MAX_AGE_MS) {
    return { valid: false, reason: 'live_caption_stale' }
  }

  const parsed = parseLiveScheduleDedupe(String(dedupeKey || ''))
  if (!parsed) return { valid: true }

  let scores = scoreCache.get(parsed.sportKey)
  if (!scores) {
    scores = await fetchSportScoresForGuard(parsed.sportKey)
    scoreCache.set(parsed.sportKey, scores)
  }

  const scoreRow = scores.find((row) => String(row.id || '').trim() === parsed.eventId)
  if (!scoreRow) {
    const createdMs = Date.parse(String(createdAt || ''))
    if (Number.isFinite(createdMs) && now - createdMs > 15 * 60_000) {
      return { valid: false, reason: 'live_score_missing' }
    }
    return { valid: true }
  }

  if (scoreRow?.completed === true) {
    return { valid: false, reason: 'game_final' }
  }

  const commence = String(scoreRow?.commence_time || '').trim()
  if (commence && !isEventStillLive(parsed.sportKey, commence, scoreRow, now)) {
    return { valid: false, reason: 'game_elapsed_cap' }
  }

  return { valid: true }
}
