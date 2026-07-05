/**
 * Value Bet Radar — 2–3 strongest +EV plays across today's slate (snackable feed post).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import { eventsForBestBetHourScan, sportPopularityRank } from './loungeBotBestBetHour.ts'
import {
  DEFAULT_MAX_EV_PCT,
  DEFAULT_MIN_BOOKS,
  findPlusEvOpportunities,
  formatOddsCommenceTimeShort,
  formatOddsPickLine,
  type OddsEvent,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import {
  fetchActiveSportKeys,
  fetchSportOdds,
  loadTodayCalendarRows,
  ptMinutesSinceMidnightPt,
  type OddsBotRow,
  type OddsCfgRow,
} from './loungeBotOddsRun.ts'
import {
  countScheduledKindToday,
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const RADAR_MARKETS: Array<'h2h' | 'spreads' | 'totals'> = ['h2h', 'spreads', 'totals']
const CAPTION_MAX = 2000
const DEFAULT_MIN_RADAR_EV_PCT = 3.5
const MIN_RADAR_PICKS = 2
const MAX_RADAR_PICKS = 3
const PEAK_START_MIN_PT = 8 * 60
const PEAK_END_MIN_PT = 22 * 60

export type RadarPick = OddsPick & {
  categoryLabel: string
  popularityRank: number
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

/** PT half-hour bucket for dedupe (YYYY-MM-DDTHH:00|30). */
export function ptHalfHourBucket(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const d = parts.find((p) => p.type === 'day')?.value ?? ''
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const min = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const half = min < 30 ? '00' : '30'
  return `${y}-${m}-${d}T${h}:${half}`
}

export function valueBetRadarDedupeKey(bucket = ptHalfHourBucket()): string {
  return `value_bet_radar:${bucket}`
}

export function valueBetRadarInPeakWindow(now = new Date()): boolean {
  const mins = ptMinutesSinceMidnightPt(now)
  return mins >= PEAK_START_MIN_PT && mins < PEAK_END_MIN_PT
}

function radarEventKey(pick: RadarPick): string {
  return String(pick.eventId || `${pick.homeTeam}|${pick.awayTeam}|${pick.commenceTime}`).trim()
}

export function collectRadarPicksFromEvents(
  events: OddsEvent[],
  sportKey: string,
  categoryLabel: string,
  minEvPct: number,
): RadarPick[] {
  const scanEvents = eventsForBestBetHourScan(events)
  if (!scanEvents.length) return []

  const picks = findPlusEvOpportunities(scanEvents, sportKey, {
    minBooks: DEFAULT_MIN_BOOKS,
    minEvPct,
    maxEvPct: DEFAULT_MAX_EV_PCT,
    marketKeys: RADAR_MARKETS,
  })

  const popularityRank = sportPopularityRank(sportKey)
  return picks.map((pick) => ({
    ...pick,
    categoryLabel,
    popularityRank,
  }))
}

/** Top 2–3 picks with sport variety and one play per game. */
export function selectValueBetRadarPicks(
  candidates: RadarPick[],
  opts?: { minPicks?: number; maxPicks?: number },
): RadarPick[] {
  const minPicks = opts?.minPicks ?? MIN_RADAR_PICKS
  const maxPicks = opts?.maxPicks ?? MAX_RADAR_PICKS
  const sorted = [...candidates].sort((a, b) => {
    if (b.edgePct !== a.edgePct) return b.edgePct - a.edgePct
    if (b.popularityRank !== a.popularityRank) return b.popularityRank - a.popularityRank
    return b.bookCount - a.bookCount
  })

  const picked: RadarPick[] = []
  const usedEvents = new Set<string>()
  const usedSports = new Set<string>()

  for (const pick of sorted) {
    if (picked.length >= maxPicks) break
    const evKey = radarEventKey(pick)
    if (usedEvents.has(evKey)) continue
    if (!usedSports.has(pick.sportKey)) {
      picked.push(pick)
      usedEvents.add(evKey)
      usedSports.add(pick.sportKey)
    }
  }

  for (const pick of sorted) {
    if (picked.length >= maxPicks) break
    const evKey = radarEventKey(pick)
    if (usedEvents.has(evKey)) continue
    picked.push(pick)
    usedEvents.add(evKey)
  }

  if (picked.length < minPicks) return []
  return picked.slice(0, maxPicks)
}

function usesCategorySubline(pick: RadarPick): boolean {
  const label = pick.categoryLabel?.trim()
  if (!label) return false
  const home = shortName(pick.homeTeam).toLowerCase()
  const away = shortName(pick.awayTeam).toLowerCase()
  const ll = label.toLowerCase()
  return ll !== home && ll !== away && !ll.includes(' vs ')
}

function formatRadarSubline(pick: RadarPick): string {
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  if (usesCategorySubline(pick)) {
    return `${pick.categoryLabel.trim()} – ${when}`
  }
  if (pick.marketKey === 'totals') {
    return `${shortName(pick.awayTeam)} vs ${shortName(pick.homeTeam)} – ${when}`
  }
  const pn = String(pick.pickName || '').trim().toLowerCase()
  const home = String(pick.homeTeam || '').trim()
  const away = String(pick.awayTeam || '').trim()
  let opp = shortName(away)
  if (pn === home.toLowerCase() || shortName(home).toLowerCase() === pn) opp = shortName(away)
  else if (pn === away.toLowerCase() || shortName(away).toLowerCase() === pn) opp = shortName(home)
  return `vs ${opp} – ${when}`
}

export function formatRadarPickLines(pick: RadarPick): string[] {
  const ev = Math.round(pick.edgePct * 10) / 10
  return [
    `${formatOddsPickLine(pick)} @ ${pick.bookTitle} (+${ev}% EV)`,
    formatRadarSubline(pick),
  ]
}

export function buildValueBetRadarCaption(picks: RadarPick[]): string {
  const blocks = picks.flatMap((pick) => formatRadarPickLines(pick))
  return joinCaptionLines([
    '📡 Value Bet Radar',
    'Here are the strongest edges right now:',
    '',
    ...blocks,
    '',
    'Quick hits. Bet responsibly.',
  ])
}

async function hasRadarDedupePublished(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - 35 * 60 * 1000)
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', windowStart.toISOString())
    .maybeSingle()
  return Boolean(data?.id)
}

export type ValueBetRadarPollResult = {
  ok: boolean
  slug: string
  action: 'value_bet_radar'
  dryRun: boolean
  skipped?: string
  published?: boolean
  halfHourBucket?: string
  pickCount?: number
  picks?: Array<{ edgePct: number; sportKey: string; marketKey: string; pickName: string }>
  captionPreview?: string
  sportsScanned?: number
  candidatesFound?: number
  minEv?: number
  requestsRemaining?: string | null
}

export async function runValueBetRadarPoll(
  admin: SupabaseClient,
  bot: OddsBotRow,
  oddsCfg: OddsCfgRow,
  dryRun: boolean,
  opts?: { force?: boolean },
): Promise<ValueBetRadarPollResult> {
  const slug = bot.slug
  const force = opts?.force === true

  if (oddsCfg.value_bet_radar_enabled === false) {
    return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'value_bet_radar_disabled' }
  }

  if (!dryRun && !force && !valueBetRadarInPeakWindow()) {
    return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'outside_peak_window' }
  }

  const calendarRows = await loadTodayCalendarRows(admin)
  if (!calendarRows.length) {
    return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'no_calendar_today' }
  }

  const minEv = Number(oddsCfg.min_value_bet_radar_ev_pct) || DEFAULT_MIN_RADAR_EV_PCT
  const maxPerDay = Number(oddsCfg.max_value_bet_radar_posts_per_day) || 20
  const regions = oddsCfg.regions || ['us']
  const markets = [...new Set([...(oddsCfg.markets || ['h2h', 'spreads']), 'totals'])]
  const activeSports = await fetchActiveSportKeys()
  const halfHourBucket = ptHalfHourBucket()
  const dedupeKey = valueBetRadarDedupeKey(halfHourBucket)

  if (!dryRun) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayStartIso = dayStart.toISOString()
    const { count } = await admin
      .from('lounge_bot_publish_log')
      .select('id', { count: 'exact', head: true })
      .eq('bot_user_id', bot.user_id)
      .eq('status', 'published')
      .eq('post_kind', 'value_bet_radar')
      .gte('created_at', dayStartIso)
    const acceptedToday = (count ?? 0) + await countScheduledKindToday(
      admin,
      bot.user_id,
      'value_bet_radar',
      dayStartIso,
    )
    if (acceptedToday >= maxPerDay) {
      return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'daily_cap', halfHourBucket }
    }
    if (await hasRadarDedupePublished(admin, bot.user_id, dedupeKey)) {
      return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'already_posted_this_window', halfHourBucket }
    }
    if (await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
      return { ok: true, slug, action: 'value_bet_radar', dryRun, skipped: 'already_scheduled_this_window', halfHourBucket }
    }
  }

  const allCandidates: RadarPick[] = []
  let requestsRemaining: string | null = null

  for (const row of calendarRows) {
    const sportKey = row.odds_sport_keys?.[0]
    if (!sportKey || !activeSports.has(sportKey)) continue
    const categoryLabel = String(row.caption_prefix || row.label_short || '').trim()

    try {
      const { events, remaining } = await fetchSportOdds(sportKey, regions, markets)
      requestsRemaining = remaining
      const raw = Array.isArray(events) ? events : []
      allCandidates.push(...collectRadarPicksFromEvents(raw, sportKey, categoryLabel, minEv))
    } catch {
      // Skip sport on fetch failure.
    }
  }

  const selected = selectValueBetRadarPicks(allCandidates)
  if (!selected.length) {
    return {
      ok: true,
      slug,
      action: 'value_bet_radar',
      dryRun,
      skipped: 'no_qualifying_edges',
      halfHourBucket,
      sportsScanned: calendarRows.length,
      candidatesFound: allCandidates.length,
      minEv,
      requestsRemaining,
    }
  }

  const caption = buildValueBetRadarCaption(selected)
  const pickMeta = selected.map((p) => ({
    edgePct: p.edgePct,
    sportKey: p.sportKey,
    marketKey: p.marketKey,
    pickName: p.pickName,
  }))

  if (dryRun) {
    return {
      ok: true,
      slug,
      action: 'value_bet_radar',
      dryRun,
      published: false,
      halfHourBucket,
      pickCount: selected.length,
      picks: pickMeta,
      captionPreview: caption.slice(0, 500),
      sportsScanned: calendarRows.length,
      candidatesFound: allCandidates.length,
      requestsRemaining,
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('value_bet_radar', oddsCfg.alert_audience)
  const topEv = selected[0]?.edgePct ?? 0
  const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
  const result = await submitLoungeBotAlertPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    subscriberOnly,
    postKind: 'value_bet_radar',
    dedupeKey,
    score: topEv,
    minGapMinutes: minGap,
  })

  if (result.accepted) {
    await admin.from('lounge_bot_accounts').update({
      last_poll_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', bot.user_id)

    return {
      ok: true,
      slug,
      action: 'value_bet_radar',
      dryRun,
      published: false,
      scheduled: true,
      halfHourBucket,
      pickCount: selected.length,
      picks: pickMeta,
      sportsScanned: calendarRows.length,
      candidatesFound: allCandidates.length,
      requestsRemaining,
    }
  }

  if (result.skipped) {
    return {
      ok: true,
      slug,
      action: 'value_bet_radar',
      dryRun,
      skipped: result.skipped,
      halfHourBucket,
      requestsRemaining,
    }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption,
    score: topEv,
    status: 'failed',
    post_kind: 'value_bet_radar',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })

  return {
    ok: true,
    slug,
    action: 'value_bet_radar',
    dryRun,
    skipped: 'schedule_failed',
    halfHourBucket,
    requestsRemaining,
  }
}
