/**
 * Background odds poller — edge alerts + morning Coffee & Covers batch + hourly best bet.
 * Body: { slug, action: 'poll_edges' | 'poll_live' | 'daily_slates' | 'best_bet_hour' | 'value_bet_radar', dryRun?: boolean, force?: boolean }
 *
 * Heavy poll_edges modules are dynamic-imported so daily_slates / best_bet_hour cold starts stay small.
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import {
  countPublishedKindToday,
  fetchActiveSportKeys,
  formatPtMinuteAsClock,
  isOddsApiAuthOrQuotaError,
  loadSportOddsContext,
  loadTodayCalendarRows,
  marketsForOddsPoll,
  morningSlateShouldRunNow,
  ptDayStartIso,
  tryPublishCombinedCoffeeAndCovers,
  tryPublishEdgeAlert,
  tryPublishLineMovementAlerts,
  tryPublishSlateCheckIn,
  type OddsCfgRow,
  type SportOddsContext,
} from '../_shared/loungeBotOddsRun.ts'
import { DEFAULT_MIN_EV_PCT } from '../_shared/loungeBotOddsCaption.ts'
import type { SharpReportCandidate } from '../_shared/loungeBotSharpReport.ts'

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

    if (!['poll_edges', 'poll_live', 'daily_slates', 'best_bet_hour', 'value_bet_radar'].includes(action)) {
      return adminOpsJson(400, {
        error: 'action must be poll_edges, poll_live, daily_slates, best_bet_hour, or value_bet_radar.',
      })
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
      const result = await runBestBetHourPoll(admin, bot, oddsCfg, dryRun)
      return adminOpsJson(200, result)
    }

    if (action === 'value_bet_radar') {
      const { runValueBetRadarPoll } = await import('../_shared/loungeBotValueBetRadar.ts')
      const result = await runValueBetRadarPoll(admin, bot, oddsCfg, dryRun, { force })
      return adminOpsJson(200, result)
    }

    if (action === 'poll_live') {
      const { runPollLive } = await import('../_shared/loungeBotPollLive.ts')
      const result = await runPollLive(admin, bot, oddsCfg, dryRun, { force })
      return adminOpsJson(200, result)
    }

    const calendarRows = await loadTodayCalendarRows(admin)
    if (!calendarRows.length) {
      return adminOpsJson(200, { ok: true, skipped: 'no_calendar_today', slug, action })
    }

    const regions = oddsCfg.regions || ['us']
    const lineMovementEnabled = oddsCfg.line_movement_enabled !== false
    const markets = marketsForOddsPoll(oddsCfg, lineMovementEnabled)
    const minEdge = Number(oddsCfg.min_edge_pct) ?? DEFAULT_MIN_EV_PCT
    const maxEdgeAlerts = Number(oddsCfg.max_edge_alerts_per_day) || 6
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
      const activeSports = await fetchActiveSportKeys()
      const coffeeMarkets = ['h2h', 'spreads']
      const details: Record<string, unknown>[] = []
      let requestsRemaining: string | null = null

      const rowResults = await Promise.all(
        calendarRows.map(async (row) => {
          const sportKey = row.odds_sport_keys?.[0]
          if (!sportKey) {
            return { calendarSlug: row.slug, sportKey: null, skipped: 'no_sport_key' as const }
          }
          if (!activeSports.has(sportKey)) {
            return { calendarSlug: row.slug, sportKey, skipped: 'sport_not_active' as const }
          }
          try {
            const ctx = await loadSportOddsContext(
              admin,
              bot.user_id,
              sportKey,
              {
                calendarSlug: row.slug,
                categoryLabel: String(row.caption_prefix || row.label_short || '').trim(),
              },
              regions,
              coffeeMarkets,
              dryRun,
            )
            return {
              calendarSlug: row.slug,
              sportKey,
              ctx,
              gamesToday: ctx.eventsInWindow,
              requestsRemaining: ctx.requestsRemaining,
            }
          } catch (err) {
            return {
              calendarSlug: row.slug,
              sportKey,
              error: err instanceof Error ? err.message : 'fetch failed',
            }
          }
        }),
      )

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
    const minPostGap = Number(oddsCfg.min_post_gap_minutes) || 8
    let edgeCount = await countPublishedKindToday(admin, bot.user_id, 'edge', dayStart)
    if (pollEdgesModules) {
      edgeCount += await pollEdgesModules.countScheduledKindToday(admin, bot.user_id, 'edge', dayStart)
    }
    const morningPostKind = coffeeCoversEnabled ? 'coffee_covers' : 'slate'
    let morningCount = await countPublishedKindToday(admin, bot.user_id, morningPostKind, dayStart)

    const activeSports = await fetchActiveSportKeys()
    let publishedEdges = 0
    let publishedLineMoves = 0
    let publishedArbWatch = 0
    let publishedSharpReport = 0
    let publishedContextAlerts = 0
    let publishedCoffeeCovers = 0
    let publishedSlates = 0
    let requestsRemaining: string | null = null
    const details: Record<string, unknown>[] = []
    const coffeeSportContexts: SportOddsContext[] = []
    const sharpReportCandidates: SharpReportCandidate[] = []
    const lineMovementCfg = {
      minSpreadMovePts: Number(oddsCfg.min_spread_move_pts) || 0.5,
      minTotalMovePts: Number(oddsCfg.min_total_move_pts) || 0.5,
      minMlMovePts: Number(oddsCfg.min_ml_move_pts) || 20,
    }

    for (const row of calendarRows) {
      const sportKey = row.odds_sport_keys?.[0]
      if (!sportKey) continue
      if (!activeSports.has(sportKey)) {
        details.push({ calendarSlug: row.slug, sportKey, skipped: 'sport_not_active' })
        continue
      }

      const calendarPick = {
        calendarSlug: row.slug,
        categoryLabel: String(row.caption_prefix || row.label_short || '').trim(),
      }

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
          if (edgeCount >= maxEdgeAlerts) {
            details.push({ calendarSlug: row.slug, skipped: 'edge_cap' })
            continue
          }
          const edgeResult = await tryPublishEdgeAlert(
            admin,
            bot,
            ctx,
            minEdge,
            dayStart,
            dryRun,
            oddsCfg.alert_audience,
            minPostGap,
          )
          if (edgeResult.published || edgeResult.scheduled) {
            publishedEdges += edgeResult.scheduled ? 0 : 1
            edgeCount += 1
          }

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

          const lineResult = await tryPublishLineMovementAlerts(
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

          const arbResult = await pollEdgesModules.tryPublishArbWatchAlerts(
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

          const contextResult = await pollEdgesModules.tryPublishContextAlert(
            admin,
            bot,
            ctx.upcoming,
            sportKey,
            oddsCfg,
            dayStart,
            dryRun,
          )
          if (contextResult.published || contextResult.scheduled) {
            publishedContextAlerts += contextResult.scheduled ? 0 : 1
          }

          details.push({
            calendarSlug: row.slug,
            sportKey,
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
          threadPartCount: coffeeResult.threadPartCount ?? null,
          sportsIncluded: coffeeResult.sportsIncluded ?? null,
          skipped: coffeeResult.skipped,
        })
      }
    }

    if (action === 'poll_edges' && pollEdgesModules) {
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
