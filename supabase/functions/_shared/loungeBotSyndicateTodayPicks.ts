/**
 * Manual gap-fill: full syndicate card for every game kicking on a PT calendar day.
 * Not a replay of scheduled cron packages (Thu tease, Fri lock, etc.).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  filterOddsEventsKickoffPtDay,
  ptDateKey,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import { fetchSportOdds } from './loungeBotOddsRun.ts'
import {
  buildNflAtsSlateCard,
  publishAndRecordNflSlateCard,
} from './loungeBotPredictivePick.ts'
import { loadPersonaWeights } from './loungeBotPersonaAdaptive.ts'
import { loadDbTeamMetricsMap } from './loungeBotTeamMetrics.ts'
import { loadDbCfbPowerRatingsMap } from './loungeBotCfbPowerRatings.ts'
import { resolveSideModifiersForSlate } from './loungeBotSideModifier.ts'
import { loadPastedBettingSplitsForSlate } from './loungeBotBettingSplits.ts'
import {
  buildUfcSlateCard,
  formatUfcCardCaption,
  publishAndRecordUfcCard,
} from './loungeBotUfcPredictive.ts'

const FOOTBALL_SPORTS = new Set([
  'americanfootball_nfl',
  'americanfootball_nfl_preseason',
  'americanfootball_ncaaf',
])

function sportLabel(sportKey: string): string {
  if (sportKey.includes('ncaaf')) return 'CFB'
  if (sportKey.includes('nfl')) return 'NFL'
  if (sportKey.includes('mma')) return 'UFC'
  return sportKey
}

function ptDayTitle(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00-07:00`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export type PicksForTodayResult = {
  ok: boolean
  dryRun?: boolean
  skipped?: string
  sportKey?: string
  dayKey?: string
  gamesToday?: number
  totalGames?: number
  hammersCount?: number
  consensusCount?: number
  splitsCount?: number
  totalEventsRaw?: number
  message?: string
  captionPreview?: string
  postId?: string
}

async function loadFootballEventsWithTotals(sportKey: string): Promise<{
  sportKey: string
  rawEvents: OddsEvent[]
  todayEvents: OddsEvent[]
}> {
  let resolvedKey = sportKey
  let oddsData = await fetchSportOdds(resolvedKey, ['us'], ['spreads'])
  if ((!oddsData?.events || oddsData.events.length === 0) && resolvedKey === 'americanfootball_nfl') {
    const preseason = await fetchSportOdds('americanfootball_nfl_preseason', ['us'], ['spreads']).catch(() => null)
    if (preseason?.events?.length) {
      oddsData = preseason
      resolvedKey = 'americanfootball_nfl_preseason'
    }
  }

  const rawEvents = oddsData?.events || []
  const todaySpreads = filterOddsEventsKickoffPtDay(rawEvents)
  if (!todaySpreads.length) {
    return { sportKey: resolvedKey, rawEvents, todayEvents: [] }
  }

  try {
    const withTotals = await fetchSportOdds(resolvedKey, ['us'], ['spreads', 'totals'])
    const todayWithTotals = filterOddsEventsKickoffPtDay(withTotals?.events || [])
    if (todayWithTotals.length) {
      return { sportKey: resolvedKey, rawEvents, todayEvents: todayWithTotals }
    }
  } catch {
    // spreads-only ok
  }

  return { sportKey: resolvedKey, rawEvents, todayEvents: todaySpreads }
}

export async function runPicksForToday(
  admin: SupabaseClient,
  botUserId: string,
  opts: {
    sportKey: string
    dryRun?: boolean
    dayKey?: string
  },
): Promise<PicksForTodayResult> {
  const dayKey = opts.dayKey || ptDateKey()
  const dryRun = opts.dryRun === true
  const requestedSport = String(opts.sportKey || '').trim()

  if (requestedSport === 'mma_mixed_martial_arts') {
    const oddsData = await fetchSportOdds('mma_mixed_martial_arts', ['us', 'us2', 'eu'], ['h2h', 'totals'])
    const rawEvents = oddsData?.events || []
    const todayEvents = filterOddsEventsKickoffPtDay(rawEvents)
    if (!todayEvents.length) {
      return {
        ok: false,
        sportKey: requestedSport,
        dayKey,
        gamesToday: 0,
        totalEventsRaw: rawEvents.length,
        message: `No UFC/MMA fights kicking ${ptDayTitle(dayKey)} (PT).`,
      }
    }

    const cardTitle = `🥊 UFC · ${ptDayTitle(dayKey)} Picks`
    const card = await buildUfcSlateCard(todayEvents, admin, cardTitle)
    if (!card || card.totalFights === 0) {
      return {
        ok: false,
        sportKey: requestedSport,
        dayKey,
        gamesToday: todayEvents.length,
        totalEventsRaw: rawEvents.length,
        message: 'No desk votes on today\'s UFC fights.',
      }
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        sportKey: requestedSport,
        dayKey,
        gamesToday: todayEvents.length,
        totalGames: card.totalFights,
        hammersCount: card.hammers.length,
        consensusCount: card.consensus.length,
        captionPreview: formatUfcCardCaption(card).slice(0, 280),
      }
    }

    const result = await publishAndRecordUfcCard(admin, {
      botUserId,
      card,
    })
    return {
      ok: result.success,
      sportKey: requestedSport,
      dayKey,
      gamesToday: todayEvents.length,
      totalGames: card.totalFights,
      hammersCount: card.hammers.length,
      consensusCount: card.consensus.length,
      message: result.success
        ? `Recorded ${result.totalPicksRecorded} picks (VIP sub chat).`
        : result.error,
    }
  }

  if (!FOOTBALL_SPORTS.has(requestedSport) && requestedSport !== 'americanfootball_nfl') {
    return { ok: false, message: `Unsupported sport for picks_for_today: ${requestedSport}` }
  }

  const { sportKey, rawEvents, todayEvents } = await loadFootballEventsWithTotals(
    requestedSport === 'americanfootball_ncaaf' ? 'americanfootball_ncaaf' : 'americanfootball_nfl',
  )

  if (!todayEvents.length) {
    return {
      ok: false,
      sportKey,
      dayKey,
      gamesToday: 0,
      totalEventsRaw: rawEvents.length,
      message: `No ${sportLabel(sportKey)} games kicking ${ptDayTitle(dayKey)} (PT).`,
    }
  }

  const [weightsMap, teamMetricsMap, cfbRatingsMap, sideModifiersByEventId, pastedSplitsByEventId] =
    await Promise.all([
      loadPersonaWeights(admin),
      loadDbTeamMetricsMap(admin),
      loadDbCfbPowerRatingsMap(admin),
      resolveSideModifiersForSlate(admin, sportKey, todayEvents),
      loadPastedBettingSplitsForSlate(admin, sportKey, todayEvents),
    ])

  const label = sportLabel(sportKey)
  const card = buildNflAtsSlateCard(todayEvents, {
    cardTitle: `🏈 ${label} · ${ptDayTitle(dayKey)} Picks`,
    sportKey,
    weightsMap,
    teamMetricsMap,
    cfbRatingsMap,
    sideModifiersByEventId,
    pastedSplitsByEventId,
  })

  if (!card || !card.games.length) {
    return {
      ok: false,
      sportKey,
      dayKey,
      gamesToday: todayEvents.length,
      totalEventsRaw: rawEvents.length,
      message: `No ${label} desk votes on today's ${todayEvents.length} game${todayEvents.length === 1 ? '' : 's'}.`,
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      sportKey,
      dayKey,
      gamesToday: todayEvents.length,
      totalGames: card.games.length,
      hammersCount: card.hammers.length,
      consensusCount: card.consensus.length,
      splitsCount: card.splits.length,
      totalEventsRaw: rawEvents.length,
    }
  }

  const result = await publishAndRecordNflSlateCard(admin, {
    botUserId,
    card,
    categoryPills: ['sports', sportKey.includes('ncaaf') ? 'cfb' : 'nfl'],
  })

  return {
    ok: result.success,
    sportKey,
    dayKey,
    gamesToday: todayEvents.length,
    totalGames: card.games.length,
    hammersCount: card.hammers.length,
    consensusCount: card.consensus.length,
    splitsCount: card.splits.length,
    totalEventsRaw: rawEvents.length,
    postId: result.postId,
    message: result.error,
  }
}
