/**
 * Shared odds fetch, slate, and edge-alert publish logic.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  buildOddsEdgeAlertCaption,
  buildOddsSlateCaption,
  DEFAULT_MAX_EV_PCT,
  DEFAULT_MIN_BOOKS,
  DEFAULT_MIN_EV_PCT,
  DEFAULT_ODDS_WINDOW_HOURS,
  edgeAlertDedupeKey,
  filterOddsEventsByWindow,
  filterOddsEventsForPtCalendarDay,
  pickBestOddsCandidate,
  slateDedupeKey,
  type OddsPick,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import {
  coffeeDailyDedupeKey,
  generateCoffeeAndCovers,
  generateCombinedCoffeeAndCovers,
  type CoffeeAndCoversOptions,
} from './loungeBotCoffeeAndCovers.ts'
import {
  buildLineMovementCaption,
  detectLineMovements,
  extractEventLines,
  lineMovementDedupeKey,
  loadStoredEventLines,
  SNAPSHOT_COMPARE_MAX_MS,
  SNAPSHOT_COMPARE_MIN_MS,
  upsertEventLines,
  type LineMovementAlert,
} from './loungeBotLineMovement.ts'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import { publishLoungeBotPost, publishLoungeBotPostWithThread } from './loungeBotPublish.ts'
import {
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export type CalendarRow = {
  slug: string
  label_short: string
  caption_prefix: string | null
  odds_sport_keys: string[]
  priority?: number
}

export type OddsBotRow = {
  user_id: string
  slug: string
  run_state: string
  category_pills_default: string[] | null
}

export type OddsCfgRow = {
  regions: string[] | null
  markets: string[] | null
  min_edge_pct: number | null
  max_edge_alerts_per_day: number | null
  max_slate_posts_per_day: number | null
  daily_slate_enabled: boolean | null
  coffee_covers_enabled: boolean | null
  line_movement_enabled: boolean | null
  max_line_alerts_per_day: number | null
  min_spread_move_pts: number | null
  min_total_move_pts: number | null
  min_ml_move_pts: number | null
  alert_audience?: Record<string, unknown> | null
  live_edge_enabled?: boolean | null
  period_report_enabled?: boolean | null
  min_live_edge_pct?: number | null
  max_live_alerts_per_day?: number | null
  max_period_reports_per_day?: number | null
  best_bet_hour_enabled?: boolean | null
  min_best_bet_hour_ev_pct?: number | null
  arb_watch_enabled?: boolean | null
  min_arb_profit_pct?: number | null
  max_arb_alerts_per_day?: number | null
  sharp_report_enabled?: boolean | null
  max_sharp_reports_per_day?: number | null
  value_bet_radar_enabled?: boolean | null
  min_value_bet_radar_ev_pct?: number | null
  max_value_bet_radar_posts_per_day?: number | null
  min_post_gap_minutes?: number | null
}

export function oddsApiKey(): string {
  return String(Deno.env.get('THE_ODDS_API_KEY') || '').trim()
}

export function ptTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function ptTomorrowDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 86_400_000))
}

export function ptDayStartIso(): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return new Date(`${y}-${m}-${d}T00:00:00-07:00`).toISOString()
}

const MORNING_SLATE_START_MIN_PT = 6 * 60
const MORNING_SLATE_END_MIN_PT = 8 * 60

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Minutes since midnight in America/Los_Angeles (0-1439). */
export function ptMinutesSinceMidnightPt(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/** Stable random minute between 6:00 and 7:59am PT for this bot + calendar day. */
export function morningSlateScheduledMinutePt(botUserId: string, ptDate = ptTodayDate()): number {
  const span = MORNING_SLATE_END_MIN_PT - MORNING_SLATE_START_MIN_PT
  return MORNING_SLATE_START_MIN_PT + (hashString(`${botUserId}:${ptDate}`) % span)
}

export function formatPtMinuteAsClock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const h12 = h24 % 12 || 12
  const suffix = h24 >= 12 ? 'pm' : 'am'
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export function morningSlateShouldRunNow(
  botUserId: string,
  opts: { force?: boolean } = {},
): { shouldRun: boolean; reason?: string; scheduledMinute?: number; nowMinute?: number } {
  const nowMinute = ptMinutesSinceMidnightPt()
  const scheduledMinute = morningSlateScheduledMinutePt(botUserId)

  if (opts.force) {
    return { shouldRun: true, scheduledMinute, nowMinute }
  }
  if (nowMinute < MORNING_SLATE_START_MIN_PT || nowMinute >= MORNING_SLATE_END_MIN_PT) {
    return { shouldRun: false, reason: 'outside_morning_window', scheduledMinute, nowMinute }
  }
  if (nowMinute < scheduledMinute) {
    return { shouldRun: false, reason: 'before_scheduled_time', scheduledMinute, nowMinute }
  }
  return { shouldRun: true, scheduledMinute, nowMinute }
}

export async function fetchActiveSportKeys(): Promise<Set<string>> {
  const key = oddsApiKey()
  if (!key) throw new Error('THE_ODDS_API_KEY not set on Edge.')
  const res = await fetch(`${ODDS_BASE}/sports/?apiKey=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(`Odds API sports list ${res.status}`)
  const sports = await res.json()
  const active = new Set<string>()
  if (Array.isArray(sports)) {
    for (const row of sports) {
      if (row?.active === true && typeof row.key === 'string') active.add(row.key)
    }
  }
  return active
}

export async function fetchSportOdds(sport: string, regions: string[], markets: string[]) {
  const key = oddsApiKey()
  if (!key) throw new Error('THE_ODDS_API_KEY not set on Edge.')
  const qs = new URLSearchParams({
    apiKey: key,
    regions: regions.join(','),
    markets: markets.join(','),
    oddsFormat: 'american',
  })
  const res = await fetch(`${ODDS_BASE}/sports/${sport}/odds?${qs}`)
  if (!res.ok) throw new Error(`Odds API ${sport} ${res.status}`)
  return { events: await res.json(), remaining: res.headers.get('x-requests-remaining') }
}

export async function loadTodayCalendarRows(admin: SupabaseClient): Promise<CalendarRow[]> {
  const today = ptTodayDate()
  const { data, error } = await admin
    .from('lounge_sports_betting_calendar')
    .select('slug, label_short, caption_prefix, odds_sport_keys, priority')
    .eq('enabled', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('priority', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as CalendarRow[]
}

export function resolveCalendarSelection(
  rows: CalendarRow[],
  sportKey: string,
  calendarSlug: string,
): { ok: true; categoryLabel: string; calendarSlug: string } | { ok: false; error: string } {
  const matches = rows.filter((row) => (row.odds_sport_keys || []).includes(sportKey))
  if (!matches.length) {
    return { ok: false, error: 'Selected sport is not on today\'s major events calendar.' }
  }

  let row = matches[0]
  if (calendarSlug) {
    const picked = matches.find((r) => r.slug === calendarSlug)
    if (!picked) {
      return { ok: false, error: 'Calendar selection does not match the sport key.' }
    }
    row = picked
  }

  return {
    ok: true,
    calendarSlug: row.slug,
    categoryLabel: String(row.caption_prefix || row.label_short || '').trim(),
  }
}

export async function countPublishedKindToday(
  admin: SupabaseClient,
  botUserId: string,
  postKind: 'edge' | 'slate' | 'coffee_covers',
  dayStart: string,
): Promise<number> {
  const { count } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .eq('post_kind', postKind)
    .gte('created_at', dayStart)
  return count || 0
}

const LINE_POST_KINDS = ['line_movement', 'sharp_move', 'steam', 'rlm'] as const

export async function countLineAlertsToday(
  admin: SupabaseClient,
  botUserId: string,
  dayStart: string,
): Promise<number> {
  const { count } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .in('post_kind', [...LINE_POST_KINDS])
    .gte('created_at', dayStart)
  return count || 0
}

export function marketsForOddsPoll(cfg: OddsCfgRow, lineMovementEnabled: boolean): string[] {
  const base = cfg.markets?.length ? cfg.markets : ['h2h', 'spreads']
  if (!lineMovementEnabled) return base
  return [...new Set([...base, 'totals'])]
}

export async function hasDedupePublishedToday(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
  dayStart: string,
): Promise<boolean> {
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', dayStart)
    .maybeSingle()
  return Boolean(data?.id)
}

export type SportOddsContext = {
  sportKey: string
  calendarSlug: string
  categoryLabel: string
  upcoming: ReturnType<typeof filterOddsEventsByWindow>
  tomorrow: ReturnType<typeof filterOddsEventsForPtCalendarDay>
  inProgress: OddsEvent[]
  eventsInWindow: number
  eventsTomorrow: number
  requestsRemaining: string | null
}

/** Games that kicked off recently and may still be in play (up to 6h). */
export function filterLiveOddsEvents(events: OddsEvent[], maxHoursAgo = 6): OddsEvent[] {
  const now = Date.now()
  const minT = now - maxHoursAgo * 3_600_000
  return events.filter((ev) => {
    const t = Date.parse(String(ev.commence_time || ''))
    return Number.isFinite(t) && t <= now && t >= minT
  })
}

export async function loadSportOddsContext(
  admin: SupabaseClient,
  botUserId: string,
  sportKey: string,
  calendarPick: { calendarSlug: string; categoryLabel: string },
  regions: string[],
  markets: string[],
  dryRun: boolean,
): Promise<SportOddsContext> {
  const { events, remaining } = await fetchSportOdds(sportKey, regions, markets)
  const raw = Array.isArray(events) ? events : []
  const inWindow = filterOddsEventsByWindow(raw, DEFAULT_ODDS_WINDOW_HOURS)
  const upcoming = filterOddsEventsForPtCalendarDay(inWindow, ptTodayDate())
  const tomorrow = filterOddsEventsForPtCalendarDay(inWindow, ptTomorrowDate())
  const inProgress = filterLiveOddsEvents(raw)

  if (!dryRun) {
    await admin.from('lounge_odds_snapshots').insert({
      bot_user_id: botUserId,
      sport: sportKey,
      payload: {
        calendarSlug: calendarPick.calendarSlug,
        categoryLabel: calendarPick.categoryLabel,
        rawCount: raw.length,
        windowCount: inWindow.length,
        todayCount: upcoming.length,
        tomorrowCount: tomorrow.length,
        liveCount: inProgress.length,
        ptDate: ptTodayDate(),
        events: upcoming,
      },
    })
  }

  return {
    sportKey,
    calendarSlug: calendarPick.calendarSlug,
    categoryLabel: calendarPick.categoryLabel,
    upcoming,
    tomorrow,
    inProgress,
    eventsInWindow: upcoming.length,
    eventsTomorrow: tomorrow.length,
    requestsRemaining: remaining,
  }
}

export async function tryPublishEdgeAlert(
  admin: SupabaseClient,
  bot: OddsBotRow,
  ctx: SportOddsContext,
  minEdge: number,
  dayStart: string,
  dryRun: boolean,
  alertAudience?: Record<string, unknown> | null,
  minPostGapMinutes = DEFAULT_MIN_POST_GAP_MINUTES,
): Promise<{ published: boolean; scheduled?: boolean; pick: OddsPick | null; skipped?: string }> {
  const pick = pickBestOddsCandidate(ctx.upcoming, ctx.sportKey, {
    minBooks: DEFAULT_MIN_BOOKS,
    minEvPct: minEdge,
    maxEvPct: DEFAULT_MAX_EV_PCT,
  })

  if (!pick || pick.edgePct < minEdge) {
    return { published: false, pick: pick && pick.edgePct < minEdge ? pick : null }
  }

  const dedupeKey = edgeAlertDedupeKey(pick, ptTodayDate())
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return { published: false, pick, skipped: 'edge_already_posted' }
  }
  if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
    return { published: false, pick, skipped: 'edge_already_scheduled' }
  }

  const caption = buildOddsEdgeAlertCaption(pick, { categoryLabel: ctx.categoryLabel })
  if (dryRun) return { published: false, pick }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('edge', alertAudience)
  const result = await submitLoungeBotAlertPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    subscriberOnly,
    postKind: 'edge',
    dedupeKey,
    score: pick.edgePct,
    minGapMinutes: minPostGapMinutes,
  })

  if (result.accepted) {
    return { published: false, scheduled: true, pick }
  }

  if (result.skipped) {
    return { published: false, pick, skipped: result.skipped }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption,
    score: pick.edgePct,
    status: 'failed',
    post_kind: 'edge',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })
  return { published: false, pick, skipped: 'schedule_failed' }
}

export async function tryPublishCoffeeAndCovers(
  admin: SupabaseClient,
  bot: OddsBotRow,
  ctx: SportOddsContext,
  dayStart: string,
  dryRun: boolean,
  alertAudience?: Record<string, unknown> | null,
): Promise<{
  published: boolean
  skipped?: string
  gamesToday?: number
  coverCount?: number
  mlCount?: number
  hasCovers?: boolean
}> {
  if (ctx.eventsInWindow <= 0) {
    return { published: false, skipped: 'no_games_today', gamesToday: 0, coverCount: 0, mlCount: 0, hasCovers: false }
  }

  const dedupeKey = coffeeDailyDedupeKey(ptTodayDate())
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return {
      published: false,
      skipped: 'coffee_already_posted',
      gamesToday: ctx.eventsInWindow,
    }
  }

  const generated = generateCoffeeAndCovers({
    categoryLabel: ctx.categoryLabel,
    sportKey: ctx.sportKey,
    events: ctx.upcoming,
    eventsTomorrow: ctx.tomorrow,
  })

  if (dryRun) {
    return {
      published: false,
      gamesToday: ctx.eventsInWindow,
      coverCount: generated.coverPicks.length,
      mlCount: generated.mlPicks.length,
      onTapCount: generated.onTapPicks.length,
      hasCovers: generated.hasCovers,
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('coffee_covers', alertAudience)
  const result = await publishLoungeBotPostWithThread(admin, {
    botUserId: bot.user_id,
    caption: generated.caption,
    categoryPills: pills,
    threadParts: generated.threadParts.map((part) => ({ body: part.body })),
    subscriberOnly,
  })

  const topScore = generated.coverPicks[0]?.edgePct
    ?? generated.mlPicks[0]?.edgePct
    ?? null

  if (result.postId) {
    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      post_id: result.postId,
      caption: generated.caption,
      score: topScore,
      status: 'published',
      post_kind: 'coffee_covers',
      dedupe_key: dedupeKey,
    })
    return {
      published: true,
      gamesToday: generated.gameCount,
      coverCount: generated.coverPicks.length,
      mlCount: generated.mlPicks.length,
      onTapCount: generated.onTapPicks.length,
      hasCovers: generated.hasCovers,
    }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption: generated.caption,
    status: 'failed',
    post_kind: 'coffee_covers',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })
  return { published: false, skipped: 'publish_failed', gamesToday: generated.gameCount }
}

/** Morning batch: one Coffee & Covers root post with a thread part per calendar sport. */
export async function tryPublishCombinedCoffeeAndCovers(
  admin: SupabaseClient,
  bot: OddsBotRow,
  sportContexts: SportOddsContext[],
  dayStart: string,
  dryRun: boolean,
  alertAudience?: Record<string, unknown> | null,
): Promise<{
  published: boolean
  skipped?: string
  gamesToday?: number
  coverCount?: number
  mlCount?: number
  onTapCount?: number
  hasCovers?: boolean
  threadPartCount?: number
  sportsIncluded?: number
}> {
  const withGames = sportContexts.filter((ctx) => ctx.eventsInWindow > 0)
  if (!withGames.length) {
    return {
      published: false,
      skipped: 'no_games_today',
      gamesToday: 0,
      coverCount: 0,
      mlCount: 0,
      hasCovers: false,
      sportsIncluded: 0,
    }
  }

  const dedupeKey = coffeeDailyDedupeKey(ptTodayDate())
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return {
      published: false,
      skipped: 'coffee_already_posted',
      gamesToday: withGames.reduce((sum, ctx) => sum + ctx.eventsInWindow, 0),
      sportsIncluded: withGames.length,
    }
  }

  const inputs: CoffeeAndCoversOptions[] = sportContexts
    .filter((ctx) => ctx.eventsInWindow > 0 || ctx.eventsTomorrow > 0)
    .map((ctx) => ({
      categoryLabel: ctx.categoryLabel,
      sportKey: ctx.sportKey,
      events: ctx.upcoming,
      eventsTomorrow: ctx.tomorrow,
    }))
  const generated = generateCombinedCoffeeAndCovers(inputs)

  if (dryRun) {
    return {
      published: false,
      gamesToday: generated.gameCount,
      coverCount: generated.coverPicks.length,
      mlCount: generated.mlPicks.length,
      onTapCount: generated.onTapPicks.length,
      hasCovers: generated.hasCovers,
      threadPartCount: generated.threadParts.length,
      sportsIncluded: withGames.length,
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('coffee_covers', alertAudience)
  const result = await publishLoungeBotPostWithThread(admin, {
    botUserId: bot.user_id,
    caption: generated.caption,
    categoryPills: pills,
    threadParts: generated.threadParts.map((part) => ({ body: part.body })),
    subscriberOnly,
  })

  const topScore = generated.coverPicks[0]?.edgePct
    ?? generated.mlPicks[0]?.edgePct
    ?? null

  if (result.postId) {
    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      post_id: result.postId,
      caption: generated.caption,
      score: topScore,
      status: 'published',
      post_kind: 'coffee_covers',
      dedupe_key: dedupeKey,
    })
    return {
      published: true,
      gamesToday: generated.gameCount,
      coverCount: generated.coverPicks.length,
      mlCount: generated.mlPicks.length,
      onTapCount: generated.onTapPicks.length,
      hasCovers: generated.hasCovers,
      threadPartCount: result.threadPartCount ?? (1 + generated.threadParts.length),
      sportsIncluded: withGames.length,
    }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption: generated.caption,
    status: 'failed',
    post_kind: 'coffee_covers',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })
  return {
    published: false,
    skipped: 'publish_failed',
    gamesToday: generated.gameCount,
    sportsIncluded: withGames.length,
  }
}

/** Legacy morning slate when Coffee & Covers is disabled. */
export async function tryPublishSlateCheckIn(
  admin: SupabaseClient,
  bot: OddsBotRow,
  ctx: SportOddsContext,
  dayStart: string,
  dryRun: boolean,
  alertAudience?: Record<string, unknown> | null,
): Promise<{ published: boolean; skipped?: string; gamesToday?: number }> {
  if (ctx.eventsInWindow <= 0) {
    return { published: false, skipped: 'no_games_today', gamesToday: 0 }
  }

  const dedupeKey = slateDedupeKey(ctx.calendarSlug, ptTodayDate())
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return { published: false, skipped: 'slate_already_posted', gamesToday: ctx.eventsInWindow }
  }

  const caption = buildOddsSlateCaption({
    categoryLabel: ctx.categoryLabel,
    events: ctx.upcoming,
  })

  if (dryRun) return { published: false, gamesToday: ctx.eventsInWindow }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('coffee_covers', alertAudience)
  const result = await publishLoungeBotPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    subscriberOnly,
  })

  if (result.postId) {
    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      post_id: result.postId,
      caption,
      score: null,
      status: 'published',
      post_kind: 'slate',
      dedupe_key: dedupeKey,
    })
    return { published: true, gamesToday: ctx.eventsInWindow }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption,
    status: 'failed',
    post_kind: 'slate',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })
  return { published: false, skipped: 'publish_failed', gamesToday: ctx.eventsInWindow }
}

export async function tryPublishLineMovementAlerts(
  admin: SupabaseClient,
  bot: OddsBotRow,
  ctx: SportOddsContext,
  oddsCfg: OddsCfgRow,
  dayStart: string,
  dryRun: boolean,
): Promise<{
  published: number
  detected: number
  skipped?: string
  alerts?: LineMovementAlert[]
}> {
  if (oddsCfg.line_movement_enabled === false) {
    return { published: 0, detected: 0, skipped: 'line_movement_disabled' }
  }
  if (!ctx.upcoming.length) {
    return { published: 0, detected: 0, skipped: 'no_games_today' }
  }

  const cfg = {
    minSpreadMovePts: Number(oddsCfg.min_spread_move_pts) || 0.5,
    minTotalMovePts: Number(oddsCfg.min_total_move_pts) || 0.5,
    minMlMovePts: Number(oddsCfg.min_ml_move_pts) || 20,
  }

  const eventIds = ctx.upcoming
    .map((ev) => String(ev.id || '').trim())
    .filter(Boolean)
  const { lines: previous, snapshotAgeMs } = await loadStoredEventLines(admin, bot.user_id, eventIds)
  const currentLines = ctx.upcoming.flatMap((ev) => extractEventLines(ev, ctx.sportKey))

  if (dryRun) {
    const movements = previous.length
      ? detectLineMovements(ctx.upcoming, ctx.sportKey, previous, cfg)
      : []
    return {
      published: 0,
      detected: movements.length,
      skipped: previous.length ? undefined : 'baseline_snapshot',
      alerts: movements.slice(0, 5),
    }
  }

  if (!previous.length) {
    await upsertEventLines(admin, bot.user_id, currentLines)
    return { published: 0, detected: 0, skipped: 'baseline_snapshot' }
  }

  if (snapshotAgeMs != null && snapshotAgeMs < SNAPSHOT_COMPARE_MIN_MS) {
    return { published: 0, detected: 0, skipped: 'snapshot_too_fresh' }
  }

  if (snapshotAgeMs != null && snapshotAgeMs > SNAPSHOT_COMPARE_MAX_MS) {
    await upsertEventLines(admin, bot.user_id, currentLines)
    return { published: 0, detected: 0, skipped: 'snapshot_stale_rebaseline' }
  }

  const movements = detectLineMovements(ctx.upcoming, ctx.sportKey, previous, cfg)

  const maxPerDay = Number(oddsCfg.max_line_alerts_per_day) || 12
  let publishedToday = await countLineAlertsToday(admin, bot.user_id, dayStart)
  let published = 0
  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']

  for (const alert of movements) {
    if (publishedToday >= maxPerDay) break

    const dedupeKey = lineMovementDedupeKey(alert)
    if (await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) continue
    if (await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) continue

    const caption = buildLineMovementCaption(alert, { categoryLabel: ctx.categoryLabel })
    const subscriberOnly = resolveAlertSubscriberOnly(alert.kind, oddsCfg.alert_audience)
    const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
    const result = await submitLoungeBotAlertPost(admin, {
      botUserId: bot.user_id,
      caption,
      categoryPills: pills,
      subscriberOnly,
      postKind: alert.kind,
      dedupeKey,
      score: Math.abs(alert.pointDelta) * 10 + Math.abs(alert.priceDelta),
      minGapMinutes: minGap,
    })

    if (result.accepted) {
      published += 1
      publishedToday += 1
    } else if (!result.skipped) {
      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: bot.user_id,
        caption,
        score: Math.abs(alert.pointDelta) * 10 + Math.abs(alert.priceDelta),
        status: 'failed',
        post_kind: alert.kind,
        dedupe_key: dedupeKey,
        error_message: result.error?.slice(0, 400),
      })
    }
  }

  await upsertEventLines(admin, bot.user_id, currentLines)

  return { published, detected: movements.length, alerts: movements.slice(0, 5) }
}
