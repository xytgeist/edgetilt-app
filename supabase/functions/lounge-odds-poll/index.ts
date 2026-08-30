/**
 * Background odds poller — edge alerts + morning Coffee & Covers batch + hourly best bet.
 * Body: {
 *   slug,
 *   action: 'poll_edges' | 'poll_live' | 'daily_slates' | 'best_bet_hour' | 'value_bet_radar',
 *   dryRun?: boolean,
 *   force?: boolean,
 *   alertKind?: string  // optional: run only one subsystem (portal per-alert invoke)
 * }
 *
 * Heavy poll_edges modules are dynamic-imported so daily_slates / best_bet_hour cold starts stay small.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import {
  countPublishedKindToday,
  evaluateEdgeAlertCandidate,
  fetchActiveSportsCatalog,
  formatPtMinuteAsClock,
  isOddsApiAuthOrQuotaError,
  loadSportOddsContext,
  marketsForOddsPoll,
  morningSlateShouldRunNow,
  publishEdgeAlertPick,
  ptDayStartIso,
  tryPublishCombinedCoffeeAndCovers,
  tryPublishLineMovementAlerts,
  tryPublishSlateCheckIn,
  type OddsCfgRow,
  type SportOddsContext,
} from '../_shared/loungeBotOddsRun.ts'
import { MAX_EDGE_ALERTS_PER_POLL_TICK } from '../_shared/loungeBotEdgeAlertThresholds.ts'
import { coffeeBestLinesRankForSport } from '../_shared/loungeBotCoffeeBestLinesPriority.ts'
import { DEFAULT_MIN_POST_GAP_MINUTES } from '../_shared/loungeBotPublishConstants.ts'
import { type OddsPick } from '../_shared/loungeBotOddsCaption.ts'
import type { SharpReportCandidate } from '../_shared/loungeBotSharpReport.ts'

const CONTEXT_ALERT_KINDS = new Set([
  'starter_spotlight',
  'confirmed_starters',
  'injury_impact',
  'rest_travel_edge',
  'fade_the_public',
])

function wantsAlertKind(alertKind: string | null, kind: string): boolean {
  return !alertKind || alertKind === kind
}

async function loadScanTargetsModules() {
  return import('../_shared/loungeBotScanTargets.ts')
}

async function authorize(req: Request): Promise<SupabaseClient> {
  return authorizeServiceRoleOrAdmin(req)
}

async function loadPollEdgesModules() {
  const [
    arbWatch,
    contextAlerts,
    sharpReport,
    publishSchedule,
  ] = await Promise.all([
    import('../_shared/loungeBotArbWatch.ts'),
    import('../_shared/loungeBotContextAlerts.ts'),
    import('../_shared/loungeBotSharpReport.ts'),
    import('../_shared/loungeBotPublishSchedule.ts'),
  ])

  return {
    tryPublishArbWatchAlerts: arbWatch.tryPublishArbWatchAlerts,
    tryPublishContextAlert: contextAlerts.tryPublishContextAlert,
    findSharpReportCandidateForSport: sharpReport.findSharpReportCandidateForSport,
    tryPublishSharpReport: sharpReport.tryPublishSharpReport,
    countScheduledKindToday: publishSchedule.countScheduledKindToday,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const admin = await authorize(req)
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || 'sports-odds').trim()
    const action = String(body?.action || 'poll_edges').trim()
    const dryRun = body?.dryRun === true
    const force = body?.force === true
    const alertKindRaw = String(body?.alertKind || '').trim().toLowerCase()
    const alertKind = alertKindRaw || null

    if (!['poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar', 'grade_picks', 'predictive_pick', 'nfl_slate_card', 'nfl_wong_teaser', 'nfl_primetime_spotlight', 'weekly_syndicate_recap', 'calibrate_persona_models'].includes(action)) {
      return adminOpsJson(400, {
        error: 'action must be poll_edges, poll_live, daily_slates, best_bet_hour, value_bet_radar, grade_picks, predictive_pick, nfl_slate_card, nfl_wong_teaser, nfl_primetime_spotlight, weekly_syndicate_recap, or calibrate_persona_models.',
      })
    }

    if (alertKind && action === 'poll_edges') {
      const allowed = new Set([
        'edge',
        'line_movement',
        'arb_watch',
        'sharp_report',
        ...CONTEXT_ALERT_KINDS,
      ])
      if (!allowed.has(alertKind)) {
        return adminOpsJson(400, {
          error: `alertKind "${alertKind}" is not valid for poll_edges.`,
        })
      }
    }
    if (alertKind && action === 'poll_live') {
      if (alertKind !== 'in_game_edge' && alertKind !== 'period_report') {
        return adminOpsJson(400, {
          error: `alertKind "${alertKind}" is not valid for poll_live.`,
        })
      }
    }

    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select('user_id, slug, run_state, pipeline, category_pills_default, display_name')
      .eq('slug', slug)
      .maybeSingle()

    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bot?.user_id) return adminOpsJson(404, { error: 'Odds bot not configured.' })
    if (bot.pipeline !== 'odds_api') return adminOpsJson(400, { error: 'Not an odds_api bot.' })
    if (!dryRun && bot.run_state !== 'running') {
      return adminOpsJson(200, { ok: true, skipped: bot.run_state, slug })
    }

    const { data: oddsCfgRaw } = await admin
      .from('lounge_bot_odds_config')
      .select('*')
      .eq('bot_user_id', bot.user_id)
      .maybeSingle()

    const oddsCfg = (oddsCfgRaw || {}) as OddsCfgRow

    if (action === 'best_bet_hour') {
      const { runBestBetHourPoll } = await import('../_shared/loungeBotBestBetHour.ts')
      const result = await runBestBetHourPoll(admin, bot, oddsCfg, dryRun, { force })
      return adminOpsJson(200, result)
    }

    if (action === 'value_bet_radar') {
      const { runValueBetRadarPoll } = await import('../_shared/loungeBotValueBetRadar.ts')
      const result = await runValueBetRadarPoll(admin, bot, oddsCfg, dryRun, { force })
      return adminOpsJson(200, result)
    }

    if (action === 'grade_picks') {
      const { gradePendingPicks } = await import('../_shared/loungeBotPredictivePick.ts')
      const key = oddsApiKey()
      if (!key) return adminOpsJson(500, { error: 'THE_ODDS_API_KEY not configured.' })
      const gradeResult = await gradePendingPicks(admin, key, bot.user_id)
      return adminOpsJson(200, { ok: true, action: 'grade_picks', ...gradeResult })
    }

    if (action === 'calibrate_persona_models') {
      const { runPersonaAdaptiveCalibration } = await import('../_shared/loungeBotPersonaAdaptive.ts')
      const calibResult = await runPersonaAdaptiveCalibration(admin)
      return adminOpsJson(200, { ok: true, action: 'calibrate_persona_models', ...calibResult })
    }

    if (action === 'nfl_slate_card') {
      const {
        buildNflAtsSlateCard,
        publishAndRecordNflSlateCard,
      } = await import('../_shared/loungeBotPredictivePick.ts')
      const { fetchSportOdds } = await import('../_shared/loungeBotOddsRun.ts')

      const sportKey = String(body?.sportKey || 'americanfootball_nfl').trim()
      let oddsData: any
      try {
        oddsData = await fetchSportOdds(sportKey, ['us'], ['spreads'])
      } catch (e) {
        return adminOpsJson(500, { ok: false, error: `Failed to fetch odds for ${sportKey}: ${e}` })
      }

      const events = oddsData?.events || []
      const { loadPersonaWeights } = await import('../_shared/loungeBotPersonaAdaptive.ts')
      const { loadDbTeamMetricsMap } = await import('../_shared/loungeBotTeamMetrics.ts')
      const { loadDbCfbPowerRatingsMap } = await import('../_shared/loungeBotCfbPowerRatings.ts')
      const weightsMap = await loadPersonaWeights(admin)
      const teamMetricsMap = await loadDbTeamMetricsMap(admin)
      const cfbRatingsMap = await loadDbCfbPowerRatingsMap(admin)

      const card = buildNflAtsSlateCard(events, {
        cardTitle: body?.cardTitle,
        sportKey,
        weightsMap,
        teamMetricsMap,
        cfbRatingsMap,
      })

      if (!card) {
        return adminOpsJson(200, {
          ok: false,
          message: `No active games with spread markets found for ${sportKey}.`,
          totalEvents: events.length,
        })
      }

      if (dryRun) {
        return adminOpsJson(200, {
          ok: true,
          dryRun: true,
          totalGames: card.games.length,
          hammersCount: card.hammers.length,
          consensusCount: card.consensus.length,
          splitsCount: card.splits.length,
          card,
        })
      }

      const result = await publishAndRecordNflSlateCard(admin, {
        botUserId: bot.user_id,
        card,
        categoryPills: bot.category_pills_default || ['sports'],
      })

      return adminOpsJson(200, {
        ok: true,
        action: 'nfl_slate_card',
        totalGames: card.games.length,
        hammersCount: card.hammers.length,
        consensusCount: card.consensus.length,
        splitsCount: card.splits.length,
        ...result,
      })
    }

    if (action === 'nfl_wong_teaser') {
      const { fetchSportOdds } = await import('../_shared/loungeBotOddsRun.ts')
      const { buildWongTeaserPair, publishAndRecordWongTeaser } = await import('../_shared/loungeBotWongTeaser.ts')

      const oddsData = await fetchSportOdds('americanfootball_nfl', ['us', 'us2'], ['spreads', 'totals'])
      const pair = buildWongTeaserPair(oddsData.events)

      if (!pair) {
        return adminOpsJson(200, {
          ok: false,
          action: 'nfl_wong_teaser',
          message: 'Fewer than 2 qualifying NFL Wong teaser legs available on the active board.',
          totalEvents: oddsData.events.length,
        })
      }

      if (dryRun) {
        return adminOpsJson(200, {
          ok: true,
          dryRun: true,
          action: 'nfl_wong_teaser',
          pair,
        })
      }

      const result = await publishAndRecordWongTeaser(
        admin,
        bot.user_id,
        oddsData.events,
        bot.category_pills_default || ['sports', 'nfl'],
      )

      return adminOpsJson(200, {
        ok: true,
        action: 'nfl_wong_teaser',
        pair,
        ...result,
      })
    }

    if (action === 'nfl_primetime_spotlight') {
      const { fetchSportOdds } = await import('../_shared/loungeBotOddsRun.ts')
      const {
        findPrimetimeGameCandidate,
        publishAndRecordPrimetimeSpotlight,
      } = await import('../_shared/loungeBotPrimetimeSpotlight.ts')

      const oddsData = await fetchSportOdds('americanfootball_nfl', ['us', 'us2'], ['spreads', 'totals'])
      const spotlight = await findPrimetimeGameCandidate(
        admin,
        oddsData.events,
        body?.primetimeType || undefined,
      )

      if (!spotlight) {
        return adminOpsJson(200, {
          ok: false,
          action: 'nfl_primetime_spotlight',
          message: 'No eligible NFL primetime game (TNF/SNF/MNF) found on the active board.',
          totalEvents: oddsData.events.length,
        })
      }

      if (dryRun) {
        return adminOpsJson(200, {
          ok: true,
          dryRun: true,
          action: 'nfl_primetime_spotlight',
          spotlight,
        })
      }

      const result = await publishAndRecordPrimetimeSpotlight(
        admin,
        bot.user_id,
        spotlight,
        bot.category_pills_default || ['sports', 'nfl'],
      )

      return adminOpsJson(200, {
        ok: true,
        action: 'nfl_primetime_spotlight',
        spotlight,
        ...result,
      })
    }

    if (action === 'weekly_syndicate_recap') {
      const {
        compileWeeklySyndicateRecap,
        publishWeeklySyndicateRecap,
      } = await import('../_shared/loungeBotLedgerRecap.ts')

      const recap = await compileWeeklySyndicateRecap(admin, bot.user_id)
      if (!recap) {
        return adminOpsJson(200, {
          ok: false,
          action: 'weekly_syndicate_recap',
          message: 'No graded picks found over the last 7 days to compile weekly recap.',
        })
      }

      if (dryRun) {
        return adminOpsJson(200, {
          ok: true,
          dryRun: true,
          action: 'weekly_syndicate_recap',
          recap,
        })
      }

      const result = await publishWeeklySyndicateRecap(
        admin,
        bot.user_id,
        recap,
        bot.category_pills_default || ['sports', 'recap'],
      )

      return adminOpsJson(200, {
        ok: true,
        action: 'weekly_syndicate_recap',
        recap,
        ...result,
      })
    }

    if (action === 'predictive_pick') {
      const {
        buildSyndicateCard,
        classifyPickPersona,
        filterPredictiveCandidates,
        publishAndRecordPicks,
      } = await import('../_shared/loungeBotPredictivePick.ts')
      const { findPlusEvOpportunities } = await import('../_shared/loungeBotOddsCaption.ts')
      const { fetchActiveSportsCatalog, fetchSportOdds } = await import('../_shared/loungeBotOddsRun.ts')
      const { resolveScottScanTargets } = await import('../_shared/loungeBotScanTargets.ts')

      const { keys: activeSports, titles: sportTitles } = await fetchActiveSportsCatalog()
      const scanTargetsModule = await loadScanTargetsModules()
      const scanTargets = await scanTargetsModule.resolveScottScanTargets(admin, activeSports, sportTitles)

      // Priority sort scan targets so NFL and CFB are scanned first
      const sortedTargets = [...scanTargets].sort((a, b) => {
        const aIsFootball = a.sportKey.startsWith('americanfootball_') ? 1 : 0
        const bIsFootball = b.sportKey.startsWith('americanfootball_') ? 1 : 0
        return bIsFootball - aIsFootball
      })

      const targetSport = body?.sportKey ? [body.sportKey] : sortedTargets.slice(0, 5).map((t) => t.sportKey)
      const allCandidates: any[] = []

      for (const sk of targetSport) {
        try {
          const oddsData = await fetchSportOdds(sk, ['us'], ['h2h', 'spreads', 'totals'])
          const opps = findPlusEvOpportunities(oddsData.events, sk, { minEvPct: 0.5, maxEvPct: 20.0 })
          const filtered = filterPredictiveCandidates(opps)
          allCandidates.push(...filtered)
        } catch (e) {
          console.warn(`Predictive pick scan error for ${sk}:`, e)
        }
      }

      const isSyndicate = body?.cardMode === 'syndicate' || (body?.cardMode !== 'solo' && allCandidates.length >= 3)

      if (isSyndicate) {
        const card = buildSyndicateCard(allCandidates, { cardTitle: body?.cardTitle })
        if (!card) {
          return adminOpsJson(200, { ok: false, message: 'Not enough distinct picks to build syndicate card.', candidates: allCandidates.length })
        }
        if (dryRun) {
          return adminOpsJson(200, { ok: true, dryRun: true, card })
        }
        const result = await publishAndRecordPicks(admin, {
          botUserId: bot.user_id,
          picks: card.picks,
          cardTitle: card.cardTitle,
          categoryPills: bot.category_pills_default || ['sports'],
        })
        return adminOpsJson(200, { ok: true, isSyndicate: true, ...result })
      } else {
        if (!allCandidates.length) {
          return adminOpsJson(200, { ok: false, message: 'No viable predictive pick candidates found.' })
        }
        const topPick = allCandidates[0]
        const persona = body?.pickerName || classifyPickPersona(topPick)
        if (dryRun) {
          return adminOpsJson(200, { ok: true, dryRun: true, pickerName: persona, pick: topPick })
        }
        const result = await publishAndRecordPicks(admin, {
          botUserId: bot.user_id,
          picks: [{ pickerName: persona, pick: topPick }],
          categoryPills: bot.category_pills_default || ['sports'],
        })
        return adminOpsJson(200, { ok: true, isSyndicate: false, pickerName: persona, ...result })
      }
    }

    if (action === 'poll_live') {
      const { runPollLive } = await import('../_shared/loungeBotPollLive.ts')
      const result = await runPollLive(admin, bot, oddsCfg, dryRun, { force, alertKind })
      return adminOpsJson(200, result)
    }

    const { keys: activeSports, titles: sportTitles } = await fetchActiveSportsCatalog()
    const scanTargetsModule = await loadScanTargetsModules()
    const scanTargets = await scanTargetsModule.resolveScottScanTargets(admin, activeSports, sportTitles)
    const calendarPickFromTarget = scanTargetsModule.calendarPickFromTarget
    if (!scanTargets.length) {
      return adminOpsJson(200, { ok: true, skipped: 'no_coverage_sports_active', slug, action })
    }

    const regions = oddsCfg.regions || ['us']
    const lineMovementEnabled = oddsCfg.line_movement_enabled !== false
    const markets = marketsForOddsPoll(oddsCfg, lineMovementEnabled)
    const maxEdgeAlerts = Number(oddsCfg.max_edge_alerts_per_day) || 8
    const maxMorningPosts = Number(oddsCfg.max_slate_posts_per_day) || 10
    const morningEnabled = oddsCfg.daily_slate_enabled !== false
    const coffeeCoversEnabled = oddsCfg.coffee_covers_enabled !== false

    if (action === 'daily_slates' && !dryRun) {
      const gate = morningSlateShouldRunNow(bot.user_id, { force })
      if (!gate.shouldRun) {
        return adminOpsJson(200, {
          ok: true,
          skipped: gate.reason,
          slug,
          action,
          scheduledPt: gate.scheduledMinute != null
            ? formatPtMinuteAsClock(gate.scheduledMinute)
            : null,
          nowMinute: gate.nowMinute,
        })
      }
    }

    const morningGate = action === 'daily_slates'
      ? morningSlateShouldRunNow(bot.user_id, { force: false })
      : null

    if (action === 'daily_slates' && morningEnabled && coffeeCoversEnabled) {
      const dayStart = ptDayStartIso()
      let morningCount = await countPublishedKindToday(admin, bot.user_id, 'coffee_covers', dayStart)
      const coffeeMarkets = ['h2h', 'spreads']
      const details: Record<string, unknown>[] = []
      let requestsRemaining: string | null = null

      const coffeeTargets = [...scanTargets].sort(
        (a, b) => coffeeBestLinesRankForSport(b.sportKey) - coffeeBestLinesRankForSport(a.sportKey),
      )

      const rowResults: Array<
        | {
          calendarSlug: string
          sportKey: string
          ctx: SportOddsContext
          gamesToday: number
          requestsRemaining: string | null
        }
        | {
          calendarSlug: string
          sportKey: string
          error: string
        }
      > = []

      for (const row of coffeeTargets) {
        const sportKey = row.sportKey
        try {
          const ctx = await loadSportOddsContext(
            admin,
            bot.user_id,
            sportKey,
            calendarPickFromTarget(row),
            regions,
            coffeeMarkets,
            dryRun,
          )
          rowResults.push({
            calendarSlug: row.slug,
            sportKey,
            ctx,
            gamesToday: ctx.eventsInWindow,
            requestsRemaining: ctx.requestsRemaining,
          })
          requestsRemaining = ctx.requestsRemaining ?? requestsRemaining
        } catch (err) {
          rowResults.push({
            calendarSlug: row.slug,
            sportKey,
            error: err instanceof Error ? err.message : 'fetch failed',
          })
        }
      }

      const coffeeSportContexts: SportOddsContext[] = []
      for (const row of rowResults) {
        if ('ctx' in row && row.ctx) {
          coffeeSportContexts.push(row.ctx)
          requestsRemaining = row.requestsRemaining ?? requestsRemaining
          details.push({
            calendarSlug: row.calendarSlug,
            sportKey: row.sportKey,
            gamesToday: row.gamesToday,
            queuedForCombinedCoffee: row.gamesToday > 0,
          })
        } else {
          details.push(row)
        }
      }

      let publishedCoffeeCovers = 0
      if (coffeeSportContexts.length > 0) {
        if (morningCount >= maxMorningPosts) {
          details.push({ combinedCoffee: true, skipped: 'morning_cap' })
        } else {
          const coffeeResult = await tryPublishCombinedCoffeeAndCovers(
            admin,
            bot,
            coffeeSportContexts,
            dayStart,
            dryRun,
            oddsCfg.alert_audience,
            force,
          )
          if (coffeeResult.published) {
            publishedCoffeeCovers = 1
            morningCount += 1
          }
          details.push({
            combinedCoffee: true,
            publishedCoffeeCovers: coffeeResult.published,
            gamesToday: coffeeResult.gamesToday ?? null,
            coverCount: coffeeResult.coverCount ?? null,
            mlCount: coffeeResult.mlCount ?? null,
            onTapCount: coffeeResult.onTapCount ?? null,
            hasCovers: coffeeResult.hasCovers ?? null,
            sportLinePartCount: coffeeResult.sportLinePartCount ?? null,
            threadPartCount: coffeeResult.threadPartCount ?? null,
            sportsIncluded: coffeeResult.sportsIncluded ?? null,
            skipped: coffeeResult.skipped,
          })
        }
      }

      if (!dryRun) {
        await admin.from('lounge_bot_accounts').update({
          last_poll_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', bot.user_id)
      }

      return adminOpsJson(200, {
        ok: true,
        slug,
        action,
        dryRun,
        coffeeCoversEnabled,
        sportsChecked: details.length,
        publishedEdges: 0,
        publishedLineMoves: 0,
        publishedArbWatch: 0,
        publishedSharpReport: 0,
        publishedLiveEdges: 0,
        publishedPeriodReports: 0,
        publishedContextAlerts: 0,
        publishedCoffeeCovers,
        publishedSlates: 0,
        publishedMorning: publishedCoffeeCovers,
        requestsRemaining,
        scheduledPt: morningGate?.scheduledMinute != null
          ? formatPtMinuteAsClock(morningGate.scheduledMinute)
          : null,
        wouldRunMorningSlates: morningGate?.shouldRun ?? null,
        details,
      })
    }

    const pollEdgesModules = action === 'poll_edges'
      ? await loadPollEdgesModules()
      : null

    const dayStart = ptDayStartIso()
    const minPostGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
    let edgeCount = await countPublishedKindToday(admin, bot.user_id, 'edge', dayStart)
    if (pollEdgesModules) {
      edgeCount += await pollEdgesModules.countScheduledKindToday(admin, bot.user_id, 'edge', dayStart)
    }
    const morningPostKind = coffeeCoversEnabled ? 'coffee_covers' : 'slate'
    let morningCount = await countPublishedKindToday(admin, bot.user_id, morningPostKind, dayStart)

    let publishedEdges = 0
    let publishedLineMoves = 0
    let publishedArbWatch = 0
    let publishedSharpReport = 0
    let publishedContextAlerts = 0
    let publishedCoffeeCovers = 0
    let publishedSlates = 0
    let requestsRemaining: string | null = null
    const details: Record<string, unknown>[] = []
    const edgeCandidates: Array<{
      ctx: SportOddsContext
      pick: OddsPick
      calendarSlug: string
    }> = []
    const coffeeSportContexts: SportOddsContext[] = []
    const sharpReportCandidates: SharpReportCandidate[] = []
    const lineMovementCfg = {
      minSpreadMovePts: Number(oddsCfg.min_spread_move_pts) || 0.5,
      minTotalMovePts: Number(oddsCfg.min_total_move_pts) || 0.5,
      minMlMovePts: Number(oddsCfg.min_ml_move_pts) || 20,
    }

    for (const row of scanTargets) {
      const sportKey = row.sportKey
      const calendarPick = calendarPickFromTarget(row)

      try {
        const ctx = await loadSportOddsContext(
          admin,
          bot.user_id,
          sportKey,
          calendarPick,
          regions,
          markets,
          dryRun,
        )
        requestsRemaining = ctx.requestsRemaining

        if (action === 'poll_edges' && pollEdgesModules) {
          const runEdge = wantsAlertKind(alertKind, 'edge')
          const runLine = wantsAlertKind(alertKind, 'line_movement')
          const runArb = wantsAlertKind(alertKind, 'arb_watch')
          const runSharp = wantsAlertKind(alertKind, 'sharp_report')
          const runContext = !alertKind || CONTEXT_ALERT_KINDS.has(alertKind)
          const contextOnlyKind = alertKind && CONTEXT_ALERT_KINDS.has(alertKind)
            ? alertKind
            : null

          if (runEdge && edgeCount >= maxEdgeAlerts) {
            details.push({ calendarSlug: row.slug, skipped: 'edge_cap' })
            if (!runLine && !runArb && !runSharp && !runContext) continue
          }

          let edgeResult: {
            published: boolean
            scheduled?: boolean
            pick: OddsPick | null
            skipped?: string
          } = {
            published: false,
            pick: null,
            skipped: runEdge ? undefined : 'alert_kind_filtered',
          }
          if (runEdge && edgeCount < maxEdgeAlerts) {
            const evaluated = await evaluateEdgeAlertCandidate(admin, bot, ctx, dayStart, dryRun)
            edgeResult = {
              published: false,
              pick: evaluated.pick,
              skipped: evaluated.skipped,
            }
            if (evaluated.pick && !evaluated.skipped) {
              edgeCandidates.push({
                ctx,
                pick: evaluated.pick,
                calendarSlug: row.slug,
              })
            }
          }

          if (runSharp) {
            const sharpCandidate = await pollEdgesModules.findSharpReportCandidateForSport(
              admin,
              bot.user_id,
              ctx.upcoming,
              sportKey,
              calendarPick.categoryLabel,
              lineMovementCfg,
              row,
            )
            if (sharpCandidate) sharpReportCandidates.push(sharpCandidate)
          }

          let lineResult: Awaited<ReturnType<typeof tryPublishLineMovementAlerts>> = {
            published: 0,
            detected: 0,
            skipped: runLine ? undefined : 'alert_kind_filtered',
          }
          if (runLine) {
            lineResult = await tryPublishLineMovementAlerts(
              admin,
              bot,
              ctx,
              oddsCfg,
              dayStart,
              dryRun,
            )
            if (lineResult.published > 0) {
              publishedLineMoves += lineResult.published
            }
          }

          let arbResult: Awaited<ReturnType<typeof pollEdgesModules.tryPublishArbWatchAlerts>> = {
            published: 0,
            detected: 0,
            skipped: runArb ? undefined : 'alert_kind_filtered',
          }
          if (runArb) {
            arbResult = await pollEdgesModules.tryPublishArbWatchAlerts(
              admin,
              bot,
              ctx.upcoming,
              sportKey,
              calendarPick.categoryLabel,
              oddsCfg,
              dayStart,
              dryRun,
            )
            if (arbResult.published > 0) publishedArbWatch += arbResult.published
          }

          let contextResult: Awaited<ReturnType<typeof pollEdgesModules.tryPublishContextAlert>> = {
            published: false,
            skipped: runContext ? undefined : 'alert_kind_filtered',
          }
          if (runContext) {
            contextResult = await pollEdgesModules.tryPublishContextAlert(
              admin,
              bot,
              ctx.upcoming,
              sportKey,
              oddsCfg,
              dayStart,
              dryRun,
              { onlyKind: contextOnlyKind as
                | 'starter_spotlight'
                | 'confirmed_starters'
                | 'injury_impact'
                | 'rest_travel_edge'
                | 'fade_the_public'
                | 'cfb_ranked_home_dog'
                | 'cfb_service_academy_under'
                | 'cfb_lookahead_trap'
                | null },
            )
            if (contextResult.published || contextResult.scheduled) {
              publishedContextAlerts += contextResult.scheduled ? 0 : 1
            }
          }

          details.push({
            calendarSlug: row.slug,
            sportKey,
            alertKind: alertKind || null,
            publishedEdge: edgeResult.published,
            edge: edgeResult.pick?.edgePct ?? null,
            skipped: edgeResult.skipped,
            publishedLineMoves: lineResult.published,
            lineMovementsDetected: lineResult.detected,
            lineSkipped: lineResult.skipped,
            publishedArbWatch: arbResult.published,
            arbsDetected: arbResult.detected,
            arbSkipped: arbResult.skipped,
            arbBestProfitPct: arbResult.best?.profitPct ?? null,
            liveGames: ctx.inProgress.length,
            publishedContextAlert: contextResult.published || contextResult.scheduled,
            contextAlertKind: contextResult.kind ?? null,
            contextAlertSkipped: contextResult.skipped ?? null,
            contextAlertPreview: contextResult.captionPreview ?? null,
          })
        } else if (morningEnabled) {
          if (coffeeCoversEnabled) {
            coffeeSportContexts.push(ctx)
            details.push({
              calendarSlug: row.slug,
              sportKey,
              gamesToday: ctx.eventsInWindow,
              queuedForCombinedCoffee: ctx.eventsInWindow > 0,
            })
          } else {
            if (morningCount >= maxMorningPosts) {
              details.push({ calendarSlug: row.slug, skipped: 'morning_cap' })
              continue
            }

            const slateResult = await tryPublishSlateCheckIn(
              admin,
              bot,
              ctx,
              dayStart,
              dryRun,
              oddsCfg.alert_audience,
            )
            if (slateResult.published) {
              publishedSlates += 1
              morningCount += 1
            }
            details.push({
              calendarSlug: row.slug,
              sportKey,
              publishedSlate: slateResult.published,
              gamesToday: slateResult.gamesToday ?? null,
              skipped: slateResult.skipped,
            })
          }
        }
      } catch (err) {
        details.push({
          calendarSlug: row.slug,
          sportKey,
          error: err instanceof Error ? err.message : 'fetch failed',
        })
      }
    }

    if (
      action === 'daily_slates'
      && morningEnabled
      && coffeeCoversEnabled
      && coffeeSportContexts.length > 0
    ) {
      if (morningCount >= maxMorningPosts) {
        details.push({ combinedCoffee: true, skipped: 'morning_cap' })
      } else {
        const coffeeResult = await tryPublishCombinedCoffeeAndCovers(
          admin,
          bot,
          coffeeSportContexts,
          dayStart,
          dryRun,
          oddsCfg.alert_audience,
          force,
        )
        if (coffeeResult.published) {
          publishedCoffeeCovers = 1
          morningCount += 1
        }
        details.push({
          combinedCoffee: true,
          publishedCoffeeCovers: coffeeResult.published,
          gamesToday: coffeeResult.gamesToday ?? null,
          coverCount: coffeeResult.coverCount ?? null,
          mlCount: coffeeResult.mlCount ?? null,
          onTapCount: coffeeResult.onTapCount ?? null,
          hasCovers: coffeeResult.hasCovers ?? null,
          sportLinePartCount: coffeeResult.sportLinePartCount ?? null,
          threadPartCount: coffeeResult.threadPartCount ?? null,
          sportsIncluded: coffeeResult.sportsIncluded ?? null,
          skipped: coffeeResult.skipped,
        })
      }
    }

    if (action === 'poll_edges' && edgeCandidates.length > 0) {
      const publishSlots = Math.min(
        MAX_EDGE_ALERTS_PER_POLL_TICK,
        Math.max(0, maxEdgeAlerts - edgeCount),
      )
      const rankedEdges = [...edgeCandidates].sort((a, b) => b.pick.edgePct - a.pick.edgePct)
      const edgesToPublish = rankedEdges.slice(0, publishSlots)
      const publishedSlugs = new Set<string>()

      for (const candidate of edgesToPublish) {
        const pubResult = await publishEdgeAlertPick(
          admin,
          bot,
          candidate.ctx,
          candidate.pick,
          dryRun,
          oddsCfg.alert_audience,
          minPostGap,
        )
        if (pubResult.published || pubResult.scheduled) {
          publishedEdges += pubResult.scheduled ? 0 : 1
          edgeCount += 1
          publishedSlugs.add(candidate.calendarSlug)
        }
      }

      details.push({
        edgeBatch: true,
        edgeCandidates: edgeCandidates.length,
        edgePublishedThisTick: edgesToPublish.length,
        edgePublishedSlugs: [...publishedSlugs],
        edgeTopEv: edgesToPublish.map((c) => ({
          calendarSlug: c.calendarSlug,
          sportKey: c.ctx.sportKey,
          edgePct: c.pick.edgePct,
          bookCount: c.pick.bookCount,
        })),
        edgeDeferredCount: Math.max(0, rankedEdges.length - edgesToPublish.length),
      })
    }

    if (action === 'poll_edges' && pollEdgesModules && wantsAlertKind(alertKind, 'sharp_report')) {
      const sharpReportResult = await pollEdgesModules.tryPublishSharpReport(
        admin,
        bot,
        sharpReportCandidates,
        oddsCfg,
        dayStart,
        dryRun,
      )
      if (sharpReportResult.published || sharpReportResult.scheduled) publishedSharpReport = 1
      details.push({
        sharpReport: true,
        publishedSharpReport: sharpReportResult.published,
        sharpReportSkipped: sharpReportResult.skipped,
        sharpReportCandidates: sharpReportCandidates.length,
        sharpReportPick: sharpReportResult.candidate,
        sharpReportPreview: sharpReportResult.captionPreview,
      })
    }

    const publishedMorning = publishedCoffeeCovers + publishedSlates

    const sportFetchErrors = details.filter((d) => typeof d.error === 'string' && d.sportKey)
    const attemptedSportFetches = details.filter((d) => d.sportKey && d.skipped !== 'sport_not_active' && !d.sharpReport && !d.combinedCoffee)
    const allSportFetchesFailed =
      attemptedSportFetches.length > 0
      && sportFetchErrors.length >= attemptedSportFetches.length
      && sportFetchErrors.every((d) => isOddsApiAuthOrQuotaError(String(d.error || '')))

    const oddsApiHealth = allSportFetchesFailed
      ? {
          ok: false,
          error: 'odds_api_auth_or_quota',
          message:
            sportFetchErrors[0] && typeof sportFetchErrors[0].error === 'string'
              ? sportFetchErrors[0].error
              : 'Odds API rejected all sport fetches (401 = bad key or out of monthly credits).',
          failedSports: sportFetchErrors.length,
        }
      : null

    if (!dryRun) {
      const { data: existingBot } = await admin
        .from('lounge_bot_accounts')
        .select('config')
        .eq('user_id', bot.user_id)
        .maybeSingle()
      const prevConfig = (existingBot?.config && typeof existingBot.config === 'object')
        ? existingBot.config as Record<string, unknown>
        : {}
      const nextConfig = {
        ...prevConfig,
        odds_api_requests_remaining: requestsRemaining,
        odds_api_last_error: oddsApiHealth?.message || null,
        odds_api_last_error_at: oddsApiHealth ? new Date().toISOString() : null,
        odds_api_last_ok_at: oddsApiHealth ? prevConfig.odds_api_last_ok_at || null : new Date().toISOString(),
      }
      await admin.from('lounge_bot_accounts').update({
        last_poll_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config: nextConfig,
      }).eq('user_id', bot.user_id)
    }

    if (oddsApiHealth) {
      console.error('lounge-odds-poll odds API hard fail', { slug, action, ...oddsApiHealth })
      return adminOpsJson(503, {
        ok: false,
        slug,
        action,
        dryRun,
        ...oddsApiHealth,
        requestsRemaining,
        details,
      })
    }

    if (!dryRun) {
      try {
        const { gradePendingPicks } = await import('../_shared/loungeBotPredictivePick.ts')
        const key = oddsApiKey()
        if (key) {
          await gradePendingPicks(admin, key, bot.user_id)
        }
      } catch (gradeErr) {
        console.warn('Auto-grading in poll_edges failed non-fatally:', gradeErr)
      }
    }

    return adminOpsJson(200, {
      ok: true,
      slug,
      action,
      dryRun,
      coffeeCoversEnabled,
      sportsChecked: details.length,
      publishedEdges,
      publishedLineMoves,
      publishedArbWatch,
      publishedSharpReport,
      publishedContextAlerts,
      publishedCoffeeCovers,
      publishedSlates,
      publishedMorning,
      requestsRemaining,
      scheduledPt: morningGate?.scheduledMinute != null
        ? formatPtMinuteAsClock(morningGate.scheduledMinute)
        : null,
      wouldRunMorningSlates: morningGate?.shouldRun ?? null,
      details,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Unexpected error' })
  }
})
