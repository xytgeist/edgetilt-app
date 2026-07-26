/**
 * Lightweight live poll — Rundown milestones + live edges/period reports every 5 min.
 * Only fetches odds for sports with games in progress (scores pre-check).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  fetchActiveSportsCatalog,
  loadSportOddsContext,
  marketsForOddsPoll,
  ptDayStartIso,
  ptMinutesSinceMidnightPt,
  type OddsCfgRow,
} from './loungeBotOddsRun.ts'
import { calendarPickFromTarget, resolveScottScanTargets } from './loungeBotScanTargets.ts'
import {
  fetchSportScores,
  filterInProgressOddsEvents,
  tryPublishLiveGameContent,
  type LiveOddsBotRow,
  type LiveOddsCfgRow,
} from './loungeBotLiveContent.ts'
import { isEventStillLive } from './loungeBotLiveGuards.ts'

const LIVE_POLL_START_MIN_PT = 10 * 60
const LIVE_POLL_END_MIN_PT = 2 * 60

export function livePollShouldRunNow(
  now = new Date(),
  opts: { force?: boolean } = {},
): { shouldRun: boolean; reason?: string; nowMinute?: number } {
  if (opts.force) return { shouldRun: true, nowMinute: ptMinutesSinceMidnightPt(now) }
  const nowMinute = ptMinutesSinceMidnightPt(now)
  const inWindow = nowMinute >= LIVE_POLL_START_MIN_PT || nowMinute < LIVE_POLL_END_MIN_PT
  if (!inWindow) {
    return { shouldRun: false, reason: 'outside_live_poll_window', nowMinute }
  }
  return { shouldRun: true, nowMinute }
}

type PollLiveBotRow = LiveOddsBotRow & {
  slug: string
  run_state: string
}

export async function runPollLive(
  admin: SupabaseClient,
  bot: PollLiveBotRow,
  oddsCfg: OddsCfgRow,
  dryRun: boolean,
  opts: { force?: boolean; alertKind?: string | null } = {},
): Promise<Record<string, unknown>> {
  const alertKind = String(opts.alertKind || '').trim() || null
  const onlyLiveKind =
    alertKind === 'in_game_edge' || alertKind === 'period_report'
      ? alertKind
      : null

  const gate = livePollShouldRunNow(new Date(), opts)
  if (!gate.shouldRun) {
    return { ok: true, skipped: gate.reason, slug: bot.slug, action: 'poll_live', nowMinute: gate.nowMinute }
  }

  const liveEnabled = (oddsCfg.live_edge_enabled !== false) && (!onlyLiveKind || onlyLiveKind === 'in_game_edge')
  const periodEnabled = (oddsCfg.period_report_enabled !== false) && (!onlyLiveKind || onlyLiveKind === 'period_report')
  if (!liveEnabled && !periodEnabled) {
    return { ok: true, skipped: 'live_content_disabled', slug: bot.slug, action: 'poll_live' }
  }

  const activeCatalog = await fetchActiveSportsCatalog()
  const scanTargets = await resolveScottScanTargets(admin, activeCatalog.keys, activeCatalog.titles)
  if (!scanTargets.length) {
    return { ok: true, skipped: 'no_coverage_sports_active', slug: bot.slug, action: 'poll_live' }
  }

  const regions = oddsCfg.regions || ['us']
  const lineMovementEnabled = oddsCfg.line_movement_enabled !== false
  const markets = marketsForOddsPoll(oddsCfg, lineMovementEnabled)
  const dayStart = ptDayStartIso()

  let publishedLiveEdges = 0
  let publishedPeriodReports = 0
  let sportsWithLive = 0
  let oddsFetches = 0
  const details: Record<string, unknown>[] = []

  for (const row of scanTargets) {
    const sportKey = row.sportKey
    const categoryLabel = calendarPickFromTarget(row).categoryLabel

    try {
      let scores: Awaited<ReturnType<typeof fetchSportScores>> = []
      try {
        scores = await fetchSportScores(sportKey)
      } catch {
        scores = []
      }

      const completedIds = new Set(
        scores.filter((s) => s.completed === true).map((s) => String(s.id || '').trim()).filter(Boolean),
      )

      const liveCandidates = scores.filter((s) => {
        const id = String(s.id || '').trim()
        const commence = String(s.commence_time || '')
        if (!id || completedIds.has(id)) return false
        const commenceMs = Date.parse(commence)
        if (!Number.isFinite(commenceMs) || commenceMs > Date.now()) return false
        return isEventStillLive(sportKey, commence, s)
      })

      if (!liveCandidates.length) {
        details.push({ calendarSlug: row.slug, sportKey, skipped: 'no_live_games' })
        continue
      }

      sportsWithLive += 1
      oddsFetches += 1

      const ctx = await loadSportOddsContext(
        admin,
        bot.user_id,
        sportKey,
        calendarPickFromTarget(row),
        regions,
        markets,
        dryRun,
      )

      const liveResult = await tryPublishLiveGameContent(
        admin,
        bot,
        sportKey,
        ctx.inProgress,
        oddsCfg as LiveOddsCfgRow,
        categoryLabel,
        dayStart,
        dryRun,
        { onlyKind: onlyLiveKind },
      )

      if (liveResult.publishedLiveEdges > 0) publishedLiveEdges += liveResult.publishedLiveEdges
      if (liveResult.publishedPeriodReports > 0) {
        publishedPeriodReports += liveResult.publishedPeriodReports
      }

      details.push({
        calendarSlug: row.slug,
        sportKey,
        liveGames: ctx.inProgress.length,
        scoresLive: liveCandidates.length,
        publishedLiveEdges: liveResult.publishedLiveEdges,
        publishedPeriodReports: liveResult.publishedPeriodReports,
        liveSkipped: liveResult.skipped,
        milestoneSource: 'rundown_or_elapsed',
      })
    } catch (err) {
      details.push({
        calendarSlug: row.slug,
        sportKey,
        error: err instanceof Error ? err.message : 'poll_live failed',
      })
    }
  }

  if (!dryRun && sportsWithLive > 0) {
    await admin.from('lounge_bot_accounts').update({
      last_poll_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', bot.user_id)
  }

  return {
    ok: true,
    slug: bot.slug,
    action: 'poll_live',
    publishedLiveEdges,
    publishedPeriodReports,
    sportsWithLive,
    oddsFetches,
    details,
  }
}
