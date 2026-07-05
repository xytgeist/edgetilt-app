/**
 * Background odds poller — edge alerts + morning Coffee & Covers batch + hourly best bet.
 * Body: { slug, action: 'poll_edges' | 'daily_slates' | 'best_bet_hour' | 'value_bet_radar', dryRun?: boolean, force?: boolean }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, requireAdminUser } from '../_shared/adminAuth.ts'
import { tryPublishArbWatchAlerts } from '../_shared/loungeBotArbWatch.ts'
import { runBestBetHourPoll } from '../_shared/loungeBotBestBetHour.ts'
import { runValueBetRadarPoll } from '../_shared/loungeBotValueBetRadar.ts'
import { tryPublishLiveGameContent } from '../_shared/loungeBotLiveContent.ts'
import {
  findSharpReportCandidateForSport,
  tryPublishSharpReport,
  type SharpReportCandidate,
} from '../_shared/loungeBotSharpReport.ts'
import {
  countPublishedKindToday,
  fetchActiveSportKeys,
  formatPtMinuteAsClock,
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
import { countScheduledKindToday } from '../_shared/loungeBotPublishSchedule.ts'

async function authorize(req: Request): Promise<SupabaseClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) throw adminOpsJson(503, { error: 'Missing env.' })

  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader.replace(/^Bearer\s+/i, '').trim() === serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey)
  }
  await requireAdminUser(req)
  return createClient(supabaseUrl, serviceRoleKey)
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

    if (!['poll_edges', 'daily_slates', 'best_bet_hour', 'value_bet_radar'].includes(action)) {
      return adminOpsJson(400, {
        error: 'action must be poll_edges, daily_slates, best_bet_hour, or value_bet_radar.',
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
      const result = await runBestBetHourPoll(admin, bot, oddsCfg, dryRun)
      return adminOpsJson(200, result)
    }

    if (action === 'value_bet_radar') {
      const result = await runValueBetRadarPoll(admin, bot, oddsCfg, dryRun, { force })
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

    const dayStart = ptDayStartIso()
    const minPostGap = Number(oddsCfg.min_post_gap_minutes) || 8
    let edgeCount = await countPublishedKindToday(admin, bot.user_id, 'edge', dayStart)
    edgeCount += await countScheduledKindToday(admin, bot.user_id, 'edge', dayStart)
    const morningPostKind = coffeeCoversEnabled ? 'coffee_covers' : 'slate'
    let morningCount = await countPublishedKindToday(admin, bot.user_id, morningPostKind, dayStart)

    const activeSports = await fetchActiveSportKeys()
    let publishedEdges = 0
    let publishedLineMoves = 0
    let publishedLiveEdges = 0
    let publishedPeriodReports = 0
    let publishedArbWatch = 0
    let publishedSharpReport = 0
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

        if (action === 'poll_edges') {
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

          const sharpCandidate = await findSharpReportCandidateForSport(
            admin,
            bot.user_id,
            ctx.upcoming,
            sportKey,
            calendarPick.categoryLabel,
            lineMovementCfg,
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

          const arbResult = await tryPublishArbWatchAlerts(
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

          const liveResult = await tryPublishLiveGameContent(
            admin,
            bot,
            sportKey,
            ctx.inProgress,
            oddsCfg,
            calendarPick.categoryLabel,
            dayStart,
            dryRun,
          )
          if (liveResult.publishedLiveEdges > 0) publishedLiveEdges += liveResult.publishedLiveEdges
          if (liveResult.publishedPeriodReports > 0) {
            publishedPeriodReports += liveResult.publishedPeriodReports
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
            publishedLiveEdges: liveResult.publishedLiveEdges,
            publishedPeriodReports: liveResult.publishedPeriodReports,
            liveSkipped: liveResult.skipped,
            liveGames: ctx.inProgress.length,
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

    let sharpReportResult: Awaited<ReturnType<typeof tryPublishSharpReport>> | null = null
    if (action === 'poll_edges') {
      sharpReportResult = await tryPublishSharpReport(
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

    if (!dryRun && (publishedEdges > 0 || publishedLineMoves > 0 || publishedArbWatch > 0
      || publishedSharpReport > 0 || publishedLiveEdges > 0
      || publishedPeriodReports > 0 || publishedMorning > 0)) {
      await admin.from('lounge_bot_accounts').update({
        last_poll_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', bot.user_id)
    } else if (!dryRun) {
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
      publishedEdges,
      publishedLineMoves,
      publishedArbWatch,
      publishedSharpReport,
      publishedLiveEdges,
      publishedPeriodReports,
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
