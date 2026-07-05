/**
 * Best Bet of the Hour — single strongest +EV play across all calendar sports.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import {
  DEFAULT_MAX_EV_PCT,
  DEFAULT_MIN_BOOKS,
  DEFAULT_ODDS_WINDOW_HOURS,
  filterOddsEventsByWindow,
  filterOddsEventsForPtCalendarDay,
  findPlusEvOpportunities,
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  formatOddsPickLine,
  marketLabel,
  ptTodayDate,
  type OddsEvent,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import {
  fetchActiveSportKeys,
  fetchSportOdds,
  filterLiveOddsEvents,
  loadTodayCalendarRows,
  type OddsBotRow,
  type OddsCfgRow,
} from './loungeBotOddsRun.ts'
import {
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const HOURLY_MARKETS: Array<'h2h' | 'spreads' | 'totals'> = ['h2h', 'spreads', 'totals']
const CAPTION_MAX = 2000

/** Higher = bigger game for tie-breaks (NFL > NBA > MLB, etc.). */
const SPORT_POPULARITY: Record<string, number> = {
  americanfootball_nfl: 100,
  americanfootball_ncaaf: 85,
  basketball_nba: 90,
  basketball_wnba: 72,
  basketball_ncaab: 70,
  baseball_mlb: 80,
  icehockey_nhl: 65,
  americanfootball_cfl: 55,
  soccer_usa_mls: 50,
}

export type HourlyBestPick = OddsPick & {
  categoryLabel: string
  calendarPriority: number
  popularityRank: number
}

export function sportPopularityRank(sportKey: string): number {
  const sk = String(sportKey || '').trim().toLowerCase()
  if (SPORT_POPULARITY[sk] != null) return SPORT_POPULARITY[sk]!
  if (sk.startsWith('americanfootball')) return 75
  if (sk.startsWith('basketball')) return 60
  if (sk.startsWith('baseball')) return 55
  if (sk.startsWith('icehockey')) return 50
  if (sk.startsWith('soccer')) return 40
  if (sk.startsWith('tennis')) return 35
  return 25
}

/** PT hour bucket for dedupe (YYYY-MM-DDTHH). */
export function ptHourBucket(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const d = parts.find((p) => p.type === 'day')?.value ?? ''
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  return `${y}-${m}-${d}T${h}`
}

export function bestBetHourDedupeKey(hourBucket = ptHourBucket()): string {
  return `best_bet_hour:${hourBucket}`
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

function formatPickNameLabel(name: string): string {
  const n = String(name || '').trim()
  if (/^draw$|^tie$/i.test(n)) return 'Draw'
  return shortName(n)
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

/** Today's unplayed + live in-progress events for hourly scan. */
export function eventsForBestBetHourScan(events: OddsEvent[]): OddsEvent[] {
  const inWindow = filterOddsEventsByWindow(events, DEFAULT_ODDS_WINDOW_HOURS)
  const today = ptTodayDate()
  const upcoming = filterOddsEventsForPtCalendarDay(inWindow, today)
  const live = filterLiveOddsEvents(inWindow)
  const byId = new Map<string, OddsEvent>()
  for (const ev of [...upcoming, ...live]) {
    const id = String(ev.id || '').trim()
    const key = id || `${ev.home_team}|${ev.away_team}|${ev.commence_time}`
    byId.set(key, ev)
  }
  return [...byId.values()]
}

export function compareHourlyPicks(a: HourlyBestPick, b: HourlyBestPick): number {
  if (b.edgePct !== a.edgePct) return b.edgePct - a.edgePct
  if (b.popularityRank !== a.popularityRank) return b.popularityRank - a.popularityRank
  if (b.calendarPriority !== a.calendarPriority) return b.calendarPriority - a.calendarPriority
  return b.bookCount - a.bookCount
}

export function findBestBetOfHour(
  events: OddsEvent[],
  sportKey: string,
  categoryLabel: string,
  calendarPriority: number,
  minEvPct: number,
): HourlyBestPick | null {
  const scanEvents = eventsForBestBetHourScan(events)
  if (!scanEvents.length) return null

  const picks = findPlusEvOpportunities(scanEvents, sportKey, {
    minBooks: DEFAULT_MIN_BOOKS,
    minEvPct,
    maxEvPct: DEFAULT_MAX_EV_PCT,
    marketKeys: HOURLY_MARKETS,
  })

  if (!picks.length) return null

  const popularityRank = sportPopularityRank(sportKey)
  const hourly: HourlyBestPick[] = picks.map((pick) => ({
    ...pick,
    categoryLabel,
    calendarPriority,
    popularityRank,
  }))

  hourly.sort(compareHourlyPicks)
  return hourly[0] ?? null
}

export function pickBestBetAcrossSports(candidates: HourlyBestPick[]): HourlyBestPick | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort(compareHourlyPicks)
  return sorted[0] ?? null
}

function buildBestBetHourReason(pick: HourlyBestPick): string {
  const team = formatPickNameLabel(pick.pickName)
  const odds = formatAmericanOdds(pick.pickPrice)
  const pct = Math.round(pick.consensusProb * 100)

  if (pick.marketKey === 'h2h') {
    return `Market consensus implies ~${pct}% chance ${team} win, but they're available at ${odds}. This is currently the sharpest edge on the board.`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    const pt = pick.linePoint > 0 ? `+${pick.linePoint}` : String(pick.linePoint)
    return `Consensus spread prices ${team} ${pt} near fair ${formatAmericanOdds(pick.consensusPrice)}, but ${odds} at ${pick.bookTitle} clears +EV. Sharpest edge on the board right now.`
  }
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `Consensus sets ${side} ${pick.linePoint} near fair ${formatAmericanOdds(pick.consensusPrice)}, but ${odds} at ${pick.bookTitle} is the top +EV total on the board.`
  }
  return `This is currently the sharpest +EV play on the board (${marketLabel(pick.marketKey)}).`
}

export function buildBestBetHourCaption(
  pick: HourlyBestPick,
  _opts?: { displayName?: string },
): string {
  const away = shortName(pick.awayTeam)
  const home = shortName(pick.homeTeam)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const pickLine = formatOddsPickLine(pick)
  const ev = Math.round(pick.edgePct * 10) / 10

  return joinCaptionLines([
    `🔥 Best Bet of the Hour`,
    `${pickLine} @ ${pick.bookTitle}`,
    `${away} vs ${home} (${when})`,
    `+${ev}% EV`,
    buildBestBetHourReason(pick),
  ])
}

async function hasDedupePublished(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
): Promise<boolean> {
  const hourStart = new Date()
  hourStart.setMinutes(0, 0, 0)
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', hourStart.toISOString())
    .maybeSingle()
  return Boolean(data?.id)
}

export type BestBetHourPollResult = {
  ok: boolean
  slug: string
  action: 'best_bet_hour'
  dryRun: boolean
  skipped?: string
  published?: boolean
  hourBucket?: string
  pick?: {
    edgePct: number
    sportKey: string
    categoryLabel: string
    marketKey: string
    pickName: string
  } | null
  captionPreview?: string
  sportsScanned?: number
  candidatesFound?: number
  requestsRemaining?: string | null
}

export async function runBestBetHourPoll(
  admin: SupabaseClient,
  bot: OddsBotRow & { display_name?: string | null },
  oddsCfg: OddsCfgRow,
  dryRun: boolean,
): Promise<BestBetHourPollResult> {
  const slug = bot.slug
  if (oddsCfg.best_bet_hour_enabled === false) {
    return { ok: true, slug, action: 'best_bet_hour', dryRun, skipped: 'best_bet_hour_disabled' }
  }

  const calendarRows = await loadTodayCalendarRows(admin)
  if (!calendarRows.length) {
    return { ok: true, slug, action: 'best_bet_hour', dryRun, skipped: 'no_calendar_today' }
  }

  const minEv = Number(oddsCfg.min_best_bet_hour_ev_pct) || 4
  const regions = oddsCfg.regions || ['us']
  const markets = [...new Set([...(oddsCfg.markets || ['h2h', 'spreads']), 'totals'])]
  const activeSports = await fetchActiveSportKeys()
  const hourBucket = ptHourBucket()
  const dedupeKey = bestBetHourDedupeKey(hourBucket)

  if (!dryRun && await hasDedupePublished(admin, bot.user_id, dedupeKey)) {
    return { ok: true, slug, action: 'best_bet_hour', dryRun, skipped: 'already_posted_this_hour', hourBucket }
  }
  if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
    return { ok: true, slug, action: 'best_bet_hour', dryRun, skipped: 'already_scheduled_this_hour', hourBucket }
  }

  const candidates: HourlyBestPick[] = []
  let requestsRemaining: string | null = null

  for (const row of calendarRows) {
    const sportKey = row.odds_sport_keys?.[0]
    if (!sportKey || !activeSports.has(sportKey)) continue
    const categoryLabel = String(row.caption_prefix || row.label_short || '').trim()
    const calendarPriority = Number(row.priority) || 50

    try {
      const { events, remaining } = await fetchSportOdds(sportKey, regions, markets)
      requestsRemaining = remaining
      const raw = Array.isArray(events) ? events : []
      const pick = findBestBetOfHour(raw, sportKey, categoryLabel, calendarPriority, minEv)
      if (pick) candidates.push(pick)
    } catch {
      // Skip sport on fetch failure; continue scan.
    }
  }

  const best = pickBestBetAcrossSports(candidates)
  if (!best || best.edgePct < minEv) {
    return {
      ok: true,
      slug,
      action: 'best_bet_hour',
      dryRun,
      skipped: 'no_qualifying_edge',
      hourBucket,
      sportsScanned: calendarRows.length,
      candidatesFound: candidates.length,
      requestsRemaining,
    }
  }

  const caption = buildBestBetHourCaption(best, { displayName: bot.display_name || 'Scott Sharpe' })

  if (dryRun) {
    return {
      ok: true,
      slug,
      action: 'best_bet_hour',
      dryRun,
      published: false,
      hourBucket,
      pick: {
        edgePct: best.edgePct,
        sportKey: best.sportKey,
        categoryLabel: best.categoryLabel,
        marketKey: best.marketKey,
        pickName: best.pickName,
      },
      captionPreview: caption.slice(0, 400),
      sportsScanned: calendarRows.length,
      candidatesFound: candidates.length,
      requestsRemaining,
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const subscriberOnly = resolveAlertSubscriberOnly('best_bet_hour', oddsCfg.alert_audience)
  const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
  const result = await submitLoungeBotAlertPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    subscriberOnly,
    postKind: 'best_bet_hour',
    dedupeKey,
    score: best.edgePct,
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
      action: 'best_bet_hour',
      dryRun,
      published: false,
      scheduled: true,
      hourBucket,
      pick: {
        edgePct: best.edgePct,
        sportKey: best.sportKey,
        categoryLabel: best.categoryLabel,
        marketKey: best.marketKey,
        pickName: best.pickName,
      },
      sportsScanned: calendarRows.length,
      candidatesFound: candidates.length,
      requestsRemaining,
    }
  }

  if (result.skipped) {
    return {
      ok: true,
      slug,
      action: 'best_bet_hour',
      dryRun,
      skipped: result.skipped,
      hourBucket,
      requestsRemaining,
    }
  }

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: bot.user_id,
    caption,
    score: best.edgePct,
    status: 'failed',
    post_kind: 'best_bet_hour',
    dedupe_key: dedupeKey,
    error_message: result.error?.slice(0, 400),
  })

  return {
    ok: true,
    slug,
    action: 'best_bet_hour',
    dryRun,
    skipped: 'schedule_failed',
    hourBucket,
    requestsRemaining,
  }
}
