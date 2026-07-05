/**
 * Live in-game edge + period/halftime reports (Scott Share poll_edges).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import {
  DEFAULT_MAX_EV_PCT,
  DEFAULT_MIN_BOOKS,
  findPlusEvOpportunities,
  formatAmericanOdds,
  formatOddsPickLine,
  marketLabel,
  type OddsEvent,
  type OddsPick,
  ptTodayDate,
} from './loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import {
  countScheduledKindToday,
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'
const LIVE_MARKETS: Array<'h2h' | 'spreads' | 'totals'> = ['h2h', 'spreads', 'totals']

function oddsApiKey(): string {
  return String(Deno.env.get('THE_ODDS_API_KEY') || '').trim()
}

export type LiveOddsBotRow = {
  user_id: string
  category_pills_default: string[] | null
}

export type LiveOddsCfgRow = {
  alert_audience?: Record<string, unknown> | null
  live_edge_enabled?: boolean | null
  period_report_enabled?: boolean | null
  min_live_edge_pct?: number | null
  max_live_alerts_per_day?: number | null
  max_period_reports_per_day?: number | null
}

export type ScoreEvent = {
  id?: string
  sport_key?: string
  home_team?: string
  away_team?: string
  commence_time?: string
  completed?: boolean
  scores?: { name?: string; score?: string }[]
  last_update?: string
}

type PeriodMilestone = {
  key: string
  label: string
  minMinutes: number
}

const PERIOD_RULES: Record<string, PeriodMilestone[]> = {
  basketball_nba: [
    { key: 'halftime', label: 'Halftime Report', minMinutes: 50 },
  ],
  basketball_ncaab: [
    { key: 'halftime', label: 'Halftime Report', minMinutes: 50 },
  ],
  basketball_wnba: [
    { key: 'halftime', label: 'Halftime Report', minMinutes: 50 },
  ],
  americanfootball_nfl: [
    { key: 'halftime', label: 'Halftime Report', minMinutes: 70 },
  ],
  americanfootball_ncaaf: [
    { key: 'halftime', label: 'Halftime Report', minMinutes: 70 },
  ],
  icehockey_nhl: [
    { key: 'p1_end', label: 'End of 1st Period', minMinutes: 20 },
    { key: 'p2_end', label: 'End of 2nd Period', minMinutes: 40 },
  ],
  baseball_mlb: [
    { key: 'inning_5', label: 'Mid-Game Update (5th Inning)', minMinutes: 135 },
  ],
}

export async function fetchSportScores(sportKey: string): Promise<ScoreEvent[]> {
  const key = oddsApiKey()
  if (!key) throw new Error('THE_ODDS_API_KEY not set on Edge.')
  const qs = new URLSearchParams({
    apiKey: key,
    daysFrom: '1',
    dateFormat: 'iso',
  })
  const res = await fetch(`${ODDS_BASE}/sports/${sportKey}/scores?${qs}`)
  if (!res.ok) throw new Error(`Odds API scores ${sportKey} ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/** Games that have kicked off but are not completed (today PT). */
export function filterInProgressOddsEvents(
  events: OddsEvent[],
  completedIds: Set<string>,
): OddsEvent[] {
  const now = Date.now()
  const today = ptTodayDate()
  return events.filter((ev) => {
    const id = String(ev.id || '').trim()
    if (!id || completedIds.has(id)) return false
    const iso = String(ev.commence_time || '')
    const t = Date.parse(iso)
    if (!Number.isFinite(t) || t > now) return false
    return iso.slice(0, 10) <= today || true
  })
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

export function formatLiveScoreLine(
  homeTeam: string,
  awayTeam: string,
  scores: ScoreEvent['scores'],
): string {
  const home = String(homeTeam || '').trim()
  const away = String(awayTeam || '').trim()
  if (!scores?.length) return `${shortName(away)} @ ${shortName(home)}`

  let homeScore: string | null = null
  let awayScore: string | null = null
  for (const row of scores) {
    const name = String(row.name || '').trim()
    const score = String(row.score ?? '').trim()
    if (!name || !score) continue
    if (name === home) homeScore = score
    else if (name === away) awayScore = score
  }

  if (homeScore != null && awayScore != null) {
    return `${shortName(away)} ${awayScore} - ${homeScore} ${shortName(home)}`
  }
  return `${shortName(away)} @ ${shortName(home)}`
}

function elapsedMinutesSinceCommence(commenceIso: string, now = Date.now()): number {
  const t = Date.parse(String(commenceIso || ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 60_000))
}

export function detectPeriodMilestone(
  sportKey: string,
  commenceIso: string,
  now = Date.now(),
): PeriodMilestone | null {
  const rules = PERIOD_RULES[sportKey]
  if (!rules?.length) return null
  const elapsed = elapsedMinutesSinceCommence(commenceIso, now)
  let current: PeriodMilestone | null = null
  for (const milestone of rules) {
    if (elapsed >= milestone.minMinutes) current = milestone
  }
  return current
}

export function formatLiveClockHint(sportKey: string, commenceIso: string, now = Date.now()): string {
  const elapsed = elapsedMinutesSinceCommence(commenceIso, now)
  if (sportKey.startsWith('basketball')) {
    if (elapsed < 24) return `~${Math.max(1, 24 - elapsed)}m left in 1st half`
    if (elapsed < 48) return `~${Math.max(1, 48 - elapsed)}m left in regulation`
    return 'Late game'
  }
  if (sportKey.startsWith('americanfootball')) {
    if (elapsed < 45) return `~${Math.max(1, 45 - elapsed)}m left in 1st half`
    if (elapsed < 90) return '2nd half underway'
    return 'Late game'
  }
  if (sportKey.startsWith('icehockey')) {
    if (elapsed < 20) return `~${Math.max(1, 20 - elapsed)}m left in 1st`
    if (elapsed < 40) return `~${Math.max(1, 40 - elapsed)}m left in 2nd`
    return '3rd period'
  }
  if (sportKey.startsWith('baseball')) {
    if (elapsed < 135) return 'Early innings'
    return 'Mid/late innings'
  }
  return 'Live'
}

export function buildInGameEdgeCaption(
  pick: OddsPick,
  opts: { categoryLabel?: string; scoreLine?: string; clockHint?: string },
): string {
  const away = shortName(pick.awayTeam)
  const home = shortName(pick.homeTeam)
  const event = opts.categoryLabel?.trim()
  const matchup = opts.scoreLine || `${away} @ ${home}`
  const head = event ? `${event}: ${matchup}` : matchup
  const pickLine = formatOddsPickLine(pick)
  const fair = formatAmericanOdds(pick.consensusPrice)
  const clock = opts.clockHint ? ` · ${opts.clockHint}` : ''

  return [
    `🔴 LIVE In-Game Edge${clock}`,
    '',
    head,
    '',
    `${pickLine} at ${pick.bookTitle}`,
    `Fair ${fair} (${pick.bookCount} books)`,
    `+${pick.edgePct}% EV on ${marketLabel(pick.marketKey)}`,
  ].join('\n').trim()
}

export function buildPeriodReportCaption(
  event: OddsEvent,
  picks: OddsPick[],
  opts: {
    categoryLabel?: string
    periodLabel: string
    scoreLine?: string
  },
): string {
  const away = shortName(String(event.away_team || 'Away'))
  const home = shortName(String(event.home_team || 'Home'))
  const matchup = opts.scoreLine || `${away} @ ${home}`
  const eventLabel = opts.categoryLabel?.trim()
  const head = eventLabel ? `${eventLabel}: ${matchup}` : matchup

  const lines = [
    `📊 ${opts.periodLabel}`,
    '',
    head,
    '',
    'Best bets for the rest of the game:',
  ]

  if (!picks.length) {
    lines.push('No +EV live lines clearing the threshold right now.')
  } else {
    for (const pick of picks.slice(0, 2)) {
      lines.push(`• ${formatOddsPickLine(pick)} at ${pick.bookTitle} (+${pick.edgePct}% EV)`)
    }
  }

  return lines.join('\n').trim()
}

export function inGameEdgeDedupeKey(pick: OddsPick, ptDay: string): string {
  const line = pick.linePoint != null ? `:${pick.linePoint}` : ''
  return `live_edge:${pick.sportKey}:${pick.eventId}:${pick.marketKey}:${pick.pickName}${line}:${ptDay}`
}

export function periodReportDedupeKey(
  sportKey: string,
  eventId: string,
  periodKey: string,
  ptDay: string,
): string {
  return `period:${sportKey}:${eventId}:${periodKey}:${ptDay}`
}

async function countPublishedKindToday(
  admin: SupabaseClient,
  botUserId: string,
  postKind: 'in_game_edge' | 'period_report',
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

async function hasDedupePublishedToday(
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

type PeriodStateRow = {
  last_period_key: string
  home_score: number | null
  away_score: number | null
}

async function loadPeriodState(
  admin: SupabaseClient,
  botUserId: string,
  eventId: string,
): Promise<PeriodStateRow | null> {
  const { data } = await admin
    .from('lounge_odds_game_period_state')
    .select('last_period_key, home_score, away_score')
    .eq('bot_user_id', botUserId)
    .eq('event_id', eventId)
    .maybeSingle()
  return data as PeriodStateRow | null
}

async function upsertPeriodState(
  admin: SupabaseClient,
  botUserId: string,
  eventId: string,
  sportKey: string,
  periodKey: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<void> {
  await admin.from('lounge_odds_game_period_state').upsert({
    bot_user_id: botUserId,
    event_id: eventId,
    sport_key: sportKey,
    last_period_key: periodKey,
    home_score: homeScore,
    away_score: awayScore,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'bot_user_id,event_id' })
}

function parseScoreValue(scores: ScoreEvent['scores'], teamName: string): number | null {
  const row = (scores || []).find((s) => String(s.name || '').trim() === teamName)
  if (!row) return null
  const n = Number(String(row.score ?? '').trim())
  return Number.isFinite(n) ? n : null
}

export async function tryPublishLiveGameContent(
  admin: SupabaseClient,
  bot: LiveOddsBotRow,
  sportKey: string,
  inProgressEvents: OddsEvent[],
  oddsCfg: LiveOddsCfgRow,
  categoryLabel: string,
  dayStart: string,
  dryRun: boolean,
): Promise<{
  publishedLiveEdges: number
  publishedPeriodReports: number
  skipped?: string
  livePick?: OddsPick | null
}> {
  const liveEnabled = oddsCfg.live_edge_enabled !== false
  const periodEnabled = oddsCfg.period_report_enabled !== false
  if (!liveEnabled && !periodEnabled) {
    return { publishedLiveEdges: 0, publishedPeriodReports: 0, skipped: 'live_content_disabled' }
  }
  if (!inProgressEvents.length) {
    return { publishedLiveEdges: 0, publishedPeriodReports: 0, skipped: 'no_live_games' }
  }

  const minLiveEv = Number(oddsCfg.min_live_edge_pct) || 4
  const maxLive = Number(oddsCfg.max_live_alerts_per_day) || 8
  const maxPeriod = Number(oddsCfg.max_period_reports_per_day) || 6
  let liveCount = await countPublishedKindToday(admin, bot.user_id, 'in_game_edge', dayStart)
  let periodCount = await countPublishedKindToday(admin, bot.user_id, 'period_report', dayStart)

  let scores: ScoreEvent[] = []
  try {
    scores = await fetchSportScores(sportKey)
  } catch {
    scores = []
  }
  const scoreById = new Map<string, ScoreEvent>()
  for (const row of scores) {
    const id = String(row.id || '').trim()
    if (id) scoreById.set(id, row)
  }
  const completedIds = new Set(
    scores.filter((row) => row.completed === true).map((row) => String(row.id || '').trim()).filter(Boolean),
  )
  const activeEvents = filterInProgressOddsEvents(inProgressEvents, completedIds)
  if (!activeEvents.length) {
    return { publishedLiveEdges: 0, publishedPeriodReports: 0, skipped: 'no_live_games' }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const ptDay = ptTodayDate()
  let publishedLiveEdges = 0
  let publishedPeriodReports = 0
  let topLivePick: OddsPick | null = null

  const livePicks = findPlusEvOpportunities(activeEvents, sportKey, {
    minBooks: DEFAULT_MIN_BOOKS,
    minEvPct: minLiveEv,
    maxEvPct: DEFAULT_MAX_EV_PCT,
    marketKeys: LIVE_MARKETS,
  })

  if (liveEnabled && liveCount < maxLive) {
    for (const pick of livePicks) {
      if (liveCount >= maxLive) break
      const dedupeKey = inGameEdgeDedupeKey(pick, ptDay)
      if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) continue
      if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) continue

      const scoreRow = scoreById.get(pick.eventId)
      const scoreLine = formatLiveScoreLine(pick.homeTeam, pick.awayTeam, scoreRow?.scores)
      const clockHint = formatLiveClockHint(sportKey, pick.commenceTime)
      const caption = buildInGameEdgeCaption(pick, { categoryLabel, scoreLine, clockHint })

      if (dryRun) {
        if (!topLivePick) topLivePick = pick
        continue
      }

      const subscriberOnly = resolveAlertSubscriberOnly('in_game_edge', oddsCfg.alert_audience)
      const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
      const result = await submitLoungeBotAlertPost(admin, {
        botUserId: bot.user_id,
        caption,
        categoryPills: pills,
        subscriberOnly,
        postKind: 'in_game_edge',
        dedupeKey,
        score: pick.edgePct,
        minGapMinutes: minGap,
      })

      if (result.accepted) {
        publishedLiveEdges += 1
        liveCount += 1
        if (!topLivePick) topLivePick = pick
      } else if (!result.skipped) {
        await admin.from('lounge_bot_publish_log').insert({
          bot_user_id: bot.user_id,
          caption,
          score: pick.edgePct,
          status: 'failed',
          post_kind: 'in_game_edge',
          dedupe_key: dedupeKey,
          error_message: result.error?.slice(0, 400),
        })
      }
      break
    }
  }

  if (periodEnabled && periodCount < maxPeriod) {
    for (const ev of activeEvents) {
      if (periodCount >= maxPeriod) break
      const eventId = String(ev.id || '').trim()
      const commence = String(ev.commence_time || '')
      if (!eventId || !commence) continue

      const milestone = detectPeriodMilestone(sportKey, commence)
      if (!milestone) continue

      const prior = dryRun ? null : await loadPeriodState(admin, bot.user_id, eventId)
      if (prior?.last_period_key === milestone.key) continue

      const scoreRow = scoreById.get(eventId)
      const home = String(ev.home_team || '')
      const away = String(ev.away_team || '')
      const scoreLine = formatLiveScoreLine(home, away, scoreRow?.scores)

      const eventPicks = livePicks.filter((p) => p.eventId === eventId)
      const caption = buildPeriodReportCaption(ev, eventPicks, {
        categoryLabel,
        periodLabel: milestone.label,
        scoreLine,
      })

      const dedupeKey = periodReportDedupeKey(sportKey, eventId, milestone.key, ptDay)
      if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
        await upsertPeriodState(
          admin,
          bot.user_id,
          eventId,
          sportKey,
          milestone.key,
          parseScoreValue(scoreRow?.scores, home),
          parseScoreValue(scoreRow?.scores, away),
        )
        continue
      }
      if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
        await upsertPeriodState(
          admin,
          bot.user_id,
          eventId,
          sportKey,
          milestone.key,
          parseScoreValue(scoreRow?.scores, home),
          parseScoreValue(scoreRow?.scores, away),
        )
        continue
      }

      if (dryRun) {
        publishedPeriodReports += 1
        periodCount += 1
        continue
      }

      const subscriberOnly = resolveAlertSubscriberOnly('period_report', oddsCfg.alert_audience)
      const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
      const result = await submitLoungeBotAlertPost(admin, {
        botUserId: bot.user_id,
        caption,
        categoryPills: pills,
        subscriberOnly,
        postKind: 'period_report',
        dedupeKey,
        score: eventPicks[0]?.edgePct ?? null,
        minGapMinutes: minGap,
      })

      const topScore = eventPicks[0]?.edgePct ?? null
      if (result.accepted) {
        publishedPeriodReports += 1
        periodCount += 1
      } else if (!result.skipped) {
        await admin.from('lounge_bot_publish_log').insert({
          bot_user_id: bot.user_id,
          caption,
          status: 'failed',
          post_kind: 'period_report',
          dedupe_key: dedupeKey,
          error_message: result.error?.slice(0, 400),
        })
      }

      await upsertPeriodState(
        admin,
        bot.user_id,
        eventId,
        sportKey,
        milestone.key,
        parseScoreValue(scoreRow?.scores, home),
        parseScoreValue(scoreRow?.scores, away),
      )
    }
  }

  return {
    publishedLiveEdges,
    publishedPeriodReports,
    livePick: topLivePick,
  }
}
