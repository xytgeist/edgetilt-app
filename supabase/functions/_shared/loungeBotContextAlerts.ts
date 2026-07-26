/**
 * Context alert posts (starters, injuries, rest/travel).
 * Injury + rest/travel use opinionated "Situational Lean" voice; starters stay factual.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertRoute } from './loungeBotAlertAudience.ts'
import {
  findPlusEvOpportunities,
  formatOddsCommenceTimeShort,
  formatOddsPickLine,
  shortDisplayName,
  DEFAULT_MIN_EV_PCT,
  type OddsEvent,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import {
  hasDedupePublishedToday,
  ptTodayDate,
  type OddsBotRow,
  type OddsCfgRow,
} from './loungeBotOddsRun.ts'
import {
  countScheduledKindToday,
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'
import {
  evaluateRestTravelMatchup,
  buildTeamRestProfile,
  loadRestTravelSchedule,
  pickMatchesTeamName,
  type RestTravelMatchup,
} from './loungeBotRestTravel.ts'
import {
  confirmedStartersFromRundown,
  hasConfirmedStarterInfo,
  injuryImpactPlayers,
  ptDateFromIso,
  resolveRundownEvent,
  sportContextLabelFromKey,
  supportsRundownSchedule,
  type ConfirmedStarters,
  type ResolvedRundownEvent,
} from './loungeBotRundownContext.ts'

const CAPTION_MAX = 2000
const CONTEXT_MARKETS: Array<'h2h' | 'spreads' | 'totals'> = ['h2h', 'spreads', 'totals']
const SITUATIONAL_LEAN_HEADER = '📐 Situational Lean'
/** Combined daily cap for injury_impact + rest_travel_edge (Grok Path A). */
export const MAX_SITUATIONAL_LEANS_PER_DAY = 2

export type ContextAlertKind =
  | 'starter_spotlight'
  | 'confirmed_starters'
  | 'injury_impact'
  | 'rest_travel_edge'
  | 'fade_the_public'

const SITUATIONAL_LEAN_KINDS: ContextAlertKind[] = ['injury_impact', 'rest_travel_edge']

export type ContextAlertCandidate = {
  kind: ContextAlertKind
  eventId: string
  sportKey: string
  awayTeam: string
  homeTeam: string
  commenceTime: string
  pick: OddsPick
  rundown: ResolvedRundownEvent
  starters?: ConfirmedStarters
  injuryPlayer?: { name: string; status: string }
  restTravel?: RestTravelMatchup
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

function formatMatchupParen(awayTeam: string, homeTeam: string, commenceTime: string): string {
  const when = formatOddsCommenceTimeShort(commenceTime)
  const matchup = `${shortDisplayName(awayTeam)} vs ${shortDisplayName(homeTeam)}`
  return when ? `${matchup} (${when})` : matchup
}

function formatPickInlineLine(pick: OddsPick): string {
  const ev = Math.round(pick.edgePct * 10) / 10
  return `${formatOddsPickLine(pick)} @ ${pick.bookTitle} (+${ev}% EV)`
}

function isSituationalLeanKind(kind: ContextAlertKind): boolean {
  return SITUATIONAL_LEAN_KINDS.includes(kind)
}

function sortContextPool(pool: ContextAlertCandidate[]): void {
  pool.sort((a, b) => {
    const evDiff = b.pick.edgePct - a.pick.edgePct
    if (Math.abs(evDiff) > 0.05) return evDiff
    const aMs = Date.parse(a.commenceTime) || 0
    const bMs = Date.parse(b.commenceTime) || 0
    return bMs - aMs
  })
}

function buildRestTravelSituationLine(restTravel: RestTravelMatchup): string {
  const fatigued = shortDisplayName(restTravel.fatiguedTeam)
  const isB2b = restTravel.fatiguedLine.includes('back-to-back')
  const hasTravel = restTravel.travelFatigue

  if (isB2b && hasTravel) {
    if (restTravel.travelTzNote) {
      return `${fatigued} on the 2nd night of a back-to-back after cross-time-zone travel (${restTravel.travelTzNote}).`
    }
    return `${fatigued} on the 2nd night of a back-to-back after a long road trip.`
  }
  if (isB2b) {
    return `${fatigued} on the 2nd night of a back-to-back.`
  }
  if (hasTravel && restTravel.travelTzNote) {
    return `${fatigued} in a tough spot with cross-time-zone travel on a short turnaround.`
  }
  if (restTravel.fatiguedLine.includes('short week')) {
    return `${fatigued} in a tough spot on a short week.`
  }
  return `${fatigued} on a short rest turnaround while the other side is rested.`
}

function buildRestTravelLeanLine(restTravel: RestTravelMatchup, pick: OddsPick): string {
  if (restTravel.restedAtHome && pickMatchesTeamName(pick.pickName, restTravel.restedTeam)) {
    return 'Prefer the rested home side here.'
  }
  if (pickMatchesTeamName(pick.pickName, restTravel.restedTeam)) {
    return `Leaning toward ${shortDisplayName(restTravel.restedTeam)} while the number is still soft.`
  }
  return 'Slight lean to the rested side.'
}

function buildInjurySituationLine(player: { name: string }): string {
  return `${player.name} has been ruled out and the market hasn't fully adjusted.`
}

function buildInjuryLeanLine(pick: OddsPick): string {
  const side = shortDisplayName(pick.pickName)
  if (pick.marketKey === 'spreads' && pick.linePoint != null && pick.linePoint > 0) {
    return 'Prefer the plus side here.'
  }
  return `Still see value on ${side}.`
}

export function buildStarterSpotlightCaption(
  awayTeam: string,
  homeTeam: string,
  commenceTime: string,
  starters: ConfirmedStarters,
  pick: OddsPick,
): string {
  const awayLabel = shortDisplayName(awayTeam)
  const homeLabel = shortDisplayName(homeTeam)
  return joinCaptionLines([
    '🔦 Starter Spotlight',
    '',
    formatMatchupParen(awayTeam, homeTeam, commenceTime),
    '',
    'Confirmed Starters:',
    `• ${awayLabel}: ${starters.away}`,
    `• ${homeLabel}: ${starters.home}`,
    '',
    formatPickInlineLine(pick),
  ])
}

export function buildConfirmedStartersCaption(
  awayTeam: string,
  homeTeam: string,
  sportKey: string,
  starters: ConfirmedStarters,
  pick: OddsPick,
): string {
  const awayLabel = shortDisplayName(awayTeam)
  const homeLabel = shortDisplayName(homeTeam)
  const sportLabel = sportContextLabelFromKey(sportKey)
  const header = sportLabel ? `✅ Confirmed Starters - ${sportLabel}` : '✅ Confirmed Starters'
  return joinCaptionLines([
    header,
    '',
    `• ${awayLabel}: ${starters.away}`,
    `• ${homeLabel}: ${starters.home}`,
    '',
    formatPickInlineLine(pick),
  ])
}

export function buildInjuryImpactCaption(
  _awayTeam: string,
  _homeTeam: string,
  _commenceTime: string,
  player: { name: string; status: string },
  pick: OddsPick,
): string {
  return joinCaptionLines([
    SITUATIONAL_LEAN_HEADER,
    '',
    formatPickInlineLine(pick),
    '',
    buildInjurySituationLine(player),
    buildInjuryLeanLine(pick),
  ])
}

export function buildRestTravelEdgeCaption(
  _awayTeam: string,
  _homeTeam: string,
  _commenceTime: string,
  restTravel: RestTravelMatchup,
  pick: OddsPick,
): string {
  return joinCaptionLines([
    SITUATIONAL_LEAN_HEADER,
    '',
    formatPickInlineLine(pick),
    '',
    buildRestTravelSituationLine(restTravel),
    buildRestTravelLeanLine(restTravel, pick),
  ])
}

export function buildFadeThePublicCaption(
  awayTeam: string,
  homeTeam: string,
  movedTeamLine: string,
  publicSideLine: string,
): string {
  return joinCaptionLines([
    '🚫 Fade the Public',
    '',
    formatMatchupParen(awayTeam, homeTeam, ''),
    '',
    `Line moved toward ${movedTeamLine} while public betting is heavy on ${publicSideLine}.`,
  ])
}

export function contextAlertCaption(candidate: ContextAlertCandidate): string {
  switch (candidate.kind) {
    case 'starter_spotlight':
      return buildStarterSpotlightCaption(
        candidate.awayTeam,
        candidate.homeTeam,
        candidate.commenceTime,
        candidate.starters!,
        candidate.pick,
      )
    case 'confirmed_starters':
      return buildConfirmedStartersCaption(
        candidate.awayTeam,
        candidate.homeTeam,
        candidate.sportKey,
        candidate.starters!,
        candidate.pick,
      )
    case 'injury_impact':
      return buildInjuryImpactCaption(
        candidate.awayTeam,
        candidate.homeTeam,
        candidate.commenceTime,
        candidate.injuryPlayer!,
        candidate.pick,
      )
    case 'rest_travel_edge':
      return buildRestTravelEdgeCaption(
        candidate.awayTeam,
        candidate.homeTeam,
        candidate.commenceTime,
        candidate.restTravel!,
        candidate.pick,
      )
    default:
      return ''
  }
}

export function contextAlertDedupeKey(kind: ContextAlertKind, eventId: string, ptDay = ptTodayDate()): string {
  return `${kind}:${ptDay}:${eventId}`
}

function bestPickForRestedTeam(
  events: OddsEvent[],
  sportKey: string,
  eventId: string,
  minEvPct: number,
  restedTeamName: string,
): OddsPick | null {
  const picks = findPlusEvOpportunities(events, sportKey, {
    minEvPct,
    marketKeys: CONTEXT_MARKETS,
  })
  return picks
    .filter((p) => p.eventId === eventId)
    .filter((p) => p.marketKey !== 'totals')
    .filter((p) => pickMatchesTeamName(p.pickName, restedTeamName))
    .sort((a, b) => b.edgePct - a.edgePct)[0] ?? null
}

function bestPickForEvent(
  events: OddsEvent[],
  sportKey: string,
  eventId: string,
  minEvPct: number,
): OddsPick | null {
  const picks = findPlusEvOpportunities(events, sportKey, {
    minEvPct,
    marketKeys: CONTEXT_MARKETS,
  })
  return picks
    .filter((p) => p.eventId === eventId)
    .sort((a, b) => b.edgePct - a.edgePct)[0] ?? null
}

function hasStarterInfo(rundown: ResolvedRundownEvent, sportKey: string): boolean {
  return hasConfirmedStarterInfo(rundown, sportKey)
}

function contextKindEnabled(kind: ContextAlertKind, oddsCfg: OddsCfgRow): boolean {
  switch (kind) {
    case 'starter_spotlight':
      return oddsCfg.starter_spotlight_enabled !== false
    case 'confirmed_starters':
      return oddsCfg.confirmed_starters_enabled !== false
    case 'injury_impact':
      return oddsCfg.injury_impact_enabled !== false
    case 'rest_travel_edge':
      return oddsCfg.rest_travel_edge_enabled !== false
    case 'fade_the_public':
      return oddsCfg.fade_the_public_enabled === true
    default:
      return false
  }
}

async function countKindAlertsToday(
  admin: SupabaseClient,
  botUserId: string,
  dayStart: string,
  kinds: ContextAlertKind[],
): Promise<number> {
  let total = 0
  for (const kind of kinds) {
    const { count } = await admin
      .from('lounge_bot_publish_log')
      .select('id', { count: 'exact', head: true })
      .eq('bot_user_id', botUserId)
      .eq('status', 'published')
      .eq('post_kind', kind)
      .gte('created_at', dayStart)
    total += count ?? 0
    total += await countScheduledKindToday(admin, botUserId, kind, dayStart)
  }
  return total
}

async function countContextAlertsToday(
  admin: SupabaseClient,
  botUserId: string,
  dayStart: string,
): Promise<number> {
  return countKindAlertsToday(admin, botUserId, dayStart, [
    'starter_spotlight',
    'confirmed_starters',
    'injury_impact',
    'rest_travel_edge',
    'fade_the_public',
  ])
}

async function countSituationalLeansToday(
  admin: SupabaseClient,
  botUserId: string,
  dayStart: string,
): Promise<number> {
  return countKindAlertsToday(admin, botUserId, dayStart, [...SITUATIONAL_LEAN_KINDS])
}

async function collectContextCandidates(
  events: OddsEvent[],
  sportKey: string,
  minEvPct: number,
  schedulePack: Awaited<ReturnType<typeof loadRestTravelSchedule>>,
): Promise<ContextAlertCandidate[]> {
  const out: ContextAlertCandidate[] = []
  const ptDay = ptTodayDate()

  for (const ev of events) {
    const eventId = String(ev.id || '').trim()
    const homeTeam = String(ev.home_team || '').trim()
    const awayTeam = String(ev.away_team || '').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!eventId || !homeTeam || !awayTeam || !commenceTime) continue

    const pick = bestPickForEvent(events, sportKey, eventId, minEvPct)
    if (!pick) continue

    const rundown = await resolveRundownEvent({ sportKey, homeTeam, awayTeam, commenceTime })
    if (!rundown) continue

    if (hasStarterInfo(rundown, sportKey)) {
      const starters = confirmedStartersFromRundown(rundown, sportKey)!
      out.push({
        kind: 'starter_spotlight',
        eventId,
        sportKey,
        awayTeam,
        homeTeam,
        commenceTime,
        pick,
        rundown,
        starters,
      })
      out.push({
        kind: 'confirmed_starters',
        eventId,
        sportKey,
        awayTeam,
        homeTeam,
        commenceTime,
        pick,
        rundown,
        starters,
      })
    }

    for (const player of injuryImpactPlayers(rundown)) {
      out.push({
        kind: 'injury_impact',
        eventId,
        sportKey,
        awayTeam,
        homeTeam,
        commenceTime,
        pick,
        rundown,
        injuryPlayer: { name: player.name, status: player.status },
      })
    }

    if (schedulePack && rundown.awayTeamId && rundown.homeTeamId) {
      const tonightPt = ptDateFromIso(commenceTime)
      const tonightMs = Date.parse(commenceTime)
      const awayProfile = buildTeamRestProfile(
        schedulePack.sportId,
        sportKey,
        schedulePack.events,
        rundown.awayTeamId,
        awayTeam,
        false,
        tonightPt,
        tonightMs,
        rundown.eventId,
        homeTeam,
      )
      const homeProfile = buildTeamRestProfile(
        schedulePack.sportId,
        sportKey,
        schedulePack.events,
        rundown.homeTeamId,
        homeTeam,
        true,
        tonightPt,
        tonightMs,
        rundown.eventId,
        awayTeam,
      )
      const matchup = evaluateRestTravelMatchup(
        schedulePack.sportId,
        sportKey,
        awayTeam,
        homeTeam,
        awayProfile,
        homeProfile,
        rundown.venueLocation,
      )
      if (matchup) {
        const restedPick = bestPickForRestedTeam(
          events,
          sportKey,
          eventId,
          minEvPct,
          matchup.restedTeam,
        )
        if (restedPick) {
          out.push({
            kind: 'rest_travel_edge',
            eventId,
            sportKey,
            awayTeam,
            homeTeam,
            commenceTime,
            pick: restedPick,
            rundown,
            restTravel: matchup,
          })
        }
      }
    }

    void ptDay
  }

  return out
}

function pickBestCandidate(
  candidates: ContextAlertCandidate[],
  oddsCfg: OddsCfgRow,
  onlyKind?: ContextAlertKind | null,
): ContextAlertCandidate | null {
  const priority: ContextAlertKind[] = [
    'injury_impact',
    'starter_spotlight',
    'rest_travel_edge',
    'confirmed_starters',
    'fade_the_public',
  ]

  let enabled = candidates.filter((c) => contextKindEnabled(c.kind, oddsCfg))
  if (onlyKind) enabled = enabled.filter((c) => c.kind === onlyKind)
  if (!enabled.length) return null

  for (const kind of priority) {
    const pool = enabled.filter((c) => c.kind === kind)
    if (!pool.length) continue
    sortContextPool(pool)
    return pool[0]!
  }
  return null
}

export async function tryPublishContextAlert(
  admin: SupabaseClient,
  bot: OddsBotRow,
  events: OddsEvent[],
  sportKey: string,
  oddsCfg: OddsCfgRow,
  dayStart: string,
  dryRun: boolean,
  opts: { onlyKind?: ContextAlertKind | null } = {},
): Promise<{
  published: boolean
  scheduled?: boolean
  skipped?: string
  kind?: ContextAlertKind
  captionPreview?: string
}> {
  const maxPerDay = Number(oddsCfg.max_context_alerts_per_day) || 6
  const acceptedToday = await countContextAlertsToday(admin, bot.user_id, dayStart)
  if (acceptedToday >= maxPerDay) {
    return { published: false, skipped: 'daily_cap' }
  }

  const minEv = Number(oddsCfg.min_edge_pct) || DEFAULT_MIN_EV_PCT
  const schedulePack = supportsRundownSchedule(sportKey)
    ? await loadRestTravelSchedule(sportKey, ptTodayDate())
    : null

  let candidates = await collectContextCandidates(events, sportKey, minEv, schedulePack)
  const situationalToday = await countSituationalLeansToday(admin, bot.user_id, dayStart)
  if (situationalToday >= MAX_SITUATIONAL_LEANS_PER_DAY) {
    candidates = candidates.filter((c) => !isSituationalLeanKind(c.kind))
  }

  const best = pickBestCandidate(candidates, oddsCfg, opts.onlyKind ?? null)
  if (!best) return { published: false, skipped: 'no_qualifying_context' }

  if (best.kind === 'confirmed_starters') {
    const spotlightKey = contextAlertDedupeKey('starter_spotlight', best.eventId)
    if (!dryRun) {
      if (await hasDedupePublishedToday(admin, bot.user_id, spotlightKey, dayStart)) {
        return { published: false, skipped: 'starter_spotlight_preferred' }
      }
      if (await hasPendingScheduleDedupe(admin, bot.user_id, spotlightKey)) {
        return { published: false, skipped: 'starter_spotlight_scheduled' }
      }
    }
  }

  const dedupeKey = contextAlertDedupeKey(best.kind, best.eventId)
  if (!dryRun && await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) {
    return { published: false, skipped: 'already_posted_today', kind: best.kind }
  }
  if (!dryRun && await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) {
    return { published: false, skipped: 'already_scheduled', kind: best.kind }
  }

  const caption = contextAlertCaption(best)
  if (!caption) return { published: false, skipped: 'empty_caption' }

  if (dryRun) {
    return {
      published: false,
      kind: best.kind,
      captionPreview: caption.slice(0, 400),
    }
  }

  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const alertRoute = resolveAlertRoute(best.kind, oddsCfg.alert_audience)
  const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES
  const result = await submitLoungeBotAlertPost(admin, {
    botUserId: bot.user_id,
    caption,
    categoryPills: pills,
    alertRoute,
    postKind: best.kind,
    dedupeKey,
    score: best.pick.edgePct,
    minGapMinutes: minGap,
  })

  if (result.accepted) {
    return {
      published: result.published,
      scheduled: result.scheduled,
      kind: best.kind,
      captionPreview: caption.slice(0, 200),
    }
  }

  if (!result.skipped) {
    await admin.from('lounge_bot_publish_log').insert({
      bot_user_id: bot.user_id,
      caption,
      score: best.pick.edgePct,
      status: 'failed',
      post_kind: best.kind,
      dedupe_key: dedupeKey,
      error_message: result.error?.slice(0, 400),
    })
  }

  return { published: false, skipped: result.skipped || 'publish_failed', kind: best.kind }
}
