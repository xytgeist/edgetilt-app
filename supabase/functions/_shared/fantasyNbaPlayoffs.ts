/**
 * NBA fantasy playoff weeks: the dates each league's playoff weeks cover, and how many games every NBA team plays
 * in them. ESPN and Yahoo syncs save exact dates (`settings.playoff_dates`); Sleeper weeks come from `nbaWeekWindow`.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'
import { nbaTeam, nbaWeekWindow, weekGames } from './fantasyNbaBoard.ts'

export type PlayoffWeek = { week: number; start: string; end: string }

/** Weeks in a bracket: one per round, plus Sleeper's two-week final (round type 1) or two-week rounds (type 2). */
function playoffWeekCount(teams: number, roundType = 0): number {
  if (!(teams >= 2)) return 0
  const rounds = Math.ceil(Math.log2(teams))
  if (roundType === 2) return rounds * 2
  if (roundType === 1) return rounds + 1
  return rounds
}

/** Sleeper NBA playoff weeks from league settings and Sleeper's season start (no All-Star merge known). */
export async function sleeperPlayoffWeeks(settings: Record<string, unknown>): Promise<PlayoffWeek[]> {
  const first = Number(settings.playoff_week_start) || 0
  const count = playoffWeekCount(Number(settings.playoff_teams) || 0, Number(settings.playoff_round_type) || 0)
  if (!first || !count) return []
  const res = await fetch('https://api.sleeper.app/v1/state/nba').catch(() => null)
  const state = res?.ok ? ((await res.json().catch(() => null)) as { season_start_date?: string } | null) : null
  if (!state?.season_start_date) return []
  const out: PlayoffWeek[] = []
  for (let w = first; w < first + count; w++) {
    const win = nbaWeekWindow(state.season_start_date, w)
    if (win) out.push({ week: w, ...win })
  }
  return out
}

/** Games per NBA team (Sleeper abbreviations) in one date range. Shared 12h; the schedule rarely moves. */
export async function teamGamesBetween(start: string, end: string, admin?: SupabaseClient): Promise<Record<string, number>> {
  return await sharedCached(
    `fantasy:nba-range-team-games:${start}:${end}`,
    { ttlMs: 12 * 60 * 60 * 1000, staleMaxMs: 72 * 60 * 60 * 1000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    async () => {
      const counts: Record<string, number> = {}
      for (const g of await weekGames(start, end)) {
        for (const t of [nbaTeam(g.home), nbaTeam(g.away)]) if (t) counts[t] = (counts[t] || 0) + 1
      }
      return counts
    },
  ).catch(() => ({}))
}
