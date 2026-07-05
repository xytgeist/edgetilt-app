/**
 * Sports odds bot — manual fetch for one sport (edge alert or morning post).
 * Body: { slug, sportKey, calendarSlug?, dryRun?, postMode?: 'auto'|'edge_only'|'slate_only' }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, requireAdminUser } from '../_shared/adminAuth.ts'
import {
  buildOddsEdgeAlertCaption,
  buildOddsSlateCaption,
  DEFAULT_MIN_EV_PCT,
} from '../_shared/loungeBotOddsCaption.ts'
import { generateCoffeeAndCovers } from '../_shared/loungeBotCoffeeAndCovers.ts'
import {
  countPublishedKindToday,
  fetchActiveSportKeys,
  loadSportOddsContext,
  loadTodayCalendarRows,
  ptDayStartIso,
  resolveCalendarSelection,
  tryPublishCoffeeAndCovers,
  tryPublishEdgeAlert,
  tryPublishSlateCheckIn,
  type OddsCfgRow,
} from '../_shared/loungeBotOddsRun.ts'

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
    const dryRun = body?.dryRun === true
    const sportKey = String(body?.sportKey || '').trim()
    const calendarSlug = String(body?.calendarSlug || '').trim()
    const postMode = String(body?.postMode || 'auto').trim() as 'auto' | 'edge_only' | 'slate_only'

    if (!sportKey) {
      return adminOpsJson(400, { error: 'sportKey required. Pick today\'s sport in the bot portal.' })
    }

    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select('user_id, slug, run_state, pipeline, category_pills_default, max_posts_per_day, config')
      .eq('slug', slug)
      .maybeSingle()

    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bot?.user_id) return adminOpsJson(404, { error: 'Odds bot not configured.' })
    if (bot.pipeline !== 'odds_api') return adminOpsJson(400, { error: 'Not an odds_api bot.' })
    if (!dryRun && bot.run_state !== 'running') {
      return adminOpsJson(200, { ok: true, skipped: bot.run_state, slug })
    }

    const calendarRows = await loadTodayCalendarRows(admin)
    if (!calendarRows.length) {
      return adminOpsJson(200, { ok: true, skipped: 'no_calendar_today', slug })
    }

    const calendarPick = resolveCalendarSelection(calendarRows, sportKey, calendarSlug)
    if (!calendarPick.ok) return adminOpsJson(400, { error: calendarPick.error })

    const activeSports = await fetchActiveSportKeys()
    if (!activeSports.has(sportKey)) {
      return adminOpsJson(200, {
        ok: true,
        skipped: 'sport_not_active',
        slug,
        sportKey,
        calendarSlug: calendarPick.calendarSlug,
        categoryLabel: calendarPick.categoryLabel,
      })
    }

    const { data: oddsCfgRaw } = await admin
      .from('lounge_bot_odds_config')
      .select('*')
      .eq('bot_user_id', bot.user_id)
      .maybeSingle()

    const oddsCfg = (oddsCfgRaw || {}) as OddsCfgRow
    const regions = oddsCfg.regions || ['us']
    const markets = oddsCfg.markets || ['h2h', 'spreads']
    const minEdge = Number(oddsCfg.min_edge_pct) ?? DEFAULT_MIN_EV_PCT
    const maxEdgeAlerts = Number(oddsCfg.max_edge_alerts_per_day) || 6
    const maxMorningPosts = Number(oddsCfg.max_slate_posts_per_day) || 10
    const coffeeCoversEnabled = oddsCfg.coffee_covers_enabled !== false

    const dayStart = ptDayStartIso()
    const edgeCount = await countPublishedKindToday(admin, bot.user_id, 'edge', dayStart)
    const morningPostKind = coffeeCoversEnabled ? 'coffee_covers' : 'slate'
    const morningCount = await countPublishedKindToday(admin, bot.user_id, morningPostKind, dayStart)

    const ctx = await loadSportOddsContext(
      admin,
      bot.user_id,
      sportKey,
      calendarPick,
      regions,
      markets,
      dryRun,
    )

    let publishedEdge = false
    let publishedMorning = false
    let postKind: 'edge' | 'slate' | 'coffee_covers' | null = null
    let edgePick = null
    let coffeeMeta: { coverCount?: number; mlCount?: number; hasCovers?: boolean } = {}

    const wantEdge = postMode === 'auto' || postMode === 'edge_only'
    const wantMorning = postMode === 'auto' || postMode === 'slate_only'

    if (wantEdge && edgeCount < maxEdgeAlerts) {
      const edgeResult = await tryPublishEdgeAlert(
        admin,
        bot,
        ctx,
        minEdge,
        dayStart,
        dryRun,
        oddsCfg.alert_audience,
      )
      edgePick = edgeResult.pick
      if (edgeResult.published) {
        publishedEdge = true
        postKind = 'edge'
      } else if (postMode === 'edge_only' && dryRun && edgeResult.pick) {
        postKind = 'edge'
      }
    }

    if (!publishedEdge && wantMorning && morningCount < maxMorningPosts) {
      if (coffeeCoversEnabled) {
        const coffeeResult = await tryPublishCoffeeAndCovers(
          admin,
          bot,
          ctx,
          dayStart,
          dryRun,
          oddsCfg.alert_audience,
        )
        coffeeMeta = {
          coverCount: coffeeResult.coverCount,
          mlCount: coffeeResult.mlCount,
          hasCovers: coffeeResult.hasCovers,
        }
        if (coffeeResult.published) {
          publishedMorning = true
          postKind = 'coffee_covers'
        } else if (postMode !== 'edge_only') {
          postKind = 'coffee_covers'
        }
      } else {
        const slateResult = await tryPublishSlateCheckIn(
          admin,
          bot,
          ctx,
          dayStart,
          dryRun,
          oddsCfg.alert_audience,
        )
        if (slateResult.published) {
          publishedMorning = true
          postKind = 'slate'
        } else if (postMode !== 'edge_only') {
          postKind = 'slate'
        }
      }
    }

    if (!dryRun) {
      await admin.from('lounge_bot_accounts').update({
        last_poll_at: new Date().toISOString(),
        last_publish_at: (publishedEdge || publishedMorning)
          ? new Date().toISOString()
          : undefined,
        updated_at: new Date().toISOString(),
      }).eq('user_id', bot.user_id)
    }

    const morningPreview = coffeeCoversEnabled
      ? generateCoffeeAndCovers({
        categoryLabel: calendarPick.categoryLabel,
        sportKey,
        events: ctx.upcoming,
        eventsTomorrow: ctx.tomorrow,
      }).caption
      : buildOddsSlateCaption({
        categoryLabel: calendarPick.categoryLabel,
        events: ctx.upcoming,
      })

    const previewCaption = publishedEdge && edgePick
      ? buildOddsEdgeAlertCaption(edgePick, { categoryLabel: calendarPick.categoryLabel })
      : morningPreview

    if (dryRun) {
      const wouldPost = wantEdge && edgePick && edgePick.edgePct >= minEdge
        ? 'edge'
        : (coffeeCoversEnabled ? 'coffee_covers' : 'slate')
      return adminOpsJson(200, {
        ok: true,
        slug,
        dryRun: true,
        sportKey,
        calendarSlug: calendarPick.calendarSlug,
        categoryLabel: calendarPick.categoryLabel,
        eventsInWindow: ctx.eventsInWindow,
        coffeeCoversEnabled,
        wouldPostKind: wouldPost,
        edgeCandidate: edgePick
          ? { ev: edgePick.edgePct, clearsBar: edgePick.edgePct >= minEdge, consensusProb: edgePick.consensusProb }
          : null,
        morningPreview: morningPreview.slice(0, 320),
        coverCount: coffeeMeta.coverCount ?? null,
        mlCount: coffeeMeta.mlCount ?? null,
        hasCovers: coffeeMeta.hasCovers ?? null,
        requestsRemaining: ctx.requestsRemaining,
      })
    }

    if (!publishedEdge && !publishedMorning) {
      return adminOpsJson(200, {
        ok: true,
        skipped: postMode === 'edge_only' ? 'no_edge_picks' : 'already_posted_or_capped',
        slug,
        sportKey,
        calendarSlug: calendarPick.calendarSlug,
        categoryLabel: calendarPick.categoryLabel,
        eventsInWindow: ctx.eventsInWindow,
        edgeCount,
        morningCount,
        coffeeCoversEnabled,
        requestsRemaining: ctx.requestsRemaining,
      })
    }

    return adminOpsJson(200, {
      ok: true,
      slug,
      sportKey,
      calendarSlug: calendarPick.calendarSlug,
      categoryLabel: calendarPick.categoryLabel,
      eventsInWindow: ctx.eventsInWindow,
      published: (publishedEdge ? 1 : 0) + (publishedMorning ? 1 : 0),
      postKind,
      publishedEdge,
      publishedMorning,
      coffeeCoversEnabled,
      coverCount: coffeeMeta.coverCount ?? null,
      mlCount: coffeeMeta.mlCount ?? null,
      hasCovers: coffeeMeta.hasCovers ?? null,
      evPct: publishedEdge && edgePick ? edgePick.edgePct : null,
      requestsRemaining: ctx.requestsRemaining,
      captionPreview: previewCaption.slice(0, 160),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Unexpected error' })
  }
})
