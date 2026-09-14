/**
 * NFL Primetime Solo Spotlights Engine (TNF / SNF / MNF).
 * Desk votes come from the same house slate (`buildNflAtsSlateCard`) as Friday /
 * Desk Math. No costume EPA-sign / fake-RLM path. Chedda only votes on pasted
 * Action/VSiN money or dog+hook. PVAL is Scott. Synthetic splits never print.
 * Public Lounge + VIP chat get the 4-desk card. No fan-only Lounge post.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'
import {
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  shortDisplayName,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { formatColoredPickerName } from './loungeBotPickerColors.ts'
import { resolveSlatePublisher } from './loungeBotSyndicateIdentity.ts'
import {
  fanOutSyndicatePublish,
  resolvePublishDestinations,
} from './loungeBotPublishDestinations.ts'
import { X_LONG_FORM_CHARS } from './loungeBotXPublish.ts'
import { fetchGameWeather, type GameWeatherSummary } from './loungeBotWeather.ts'
import { oddsSportKeyToRundownSportId, resolveRundownEvent } from './loungeBotRundownContext.ts'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import {
  loadPastedBettingSplitsBoardForSlate,
  type BettingSplitSummary,
} from './loungeBotBettingSplits.ts'
import {
  calculateTrenchEpaMatchup,
  loadDbTeamMetricsMap,
  type TrenchEpaMatchupSummary,
} from './loungeBotTeamMetrics.ts'
import { loadPersonaWeights } from './loungeBotPersonaAdaptive.ts'
import { loadDbCfbPowerRatingsMap } from './loungeBotCfbPowerRatings.ts'
import { resolveSideModifiersForSlate } from './loungeBotSideModifier.ts'
import {
  buildNflAtsSlateCard,
  loadTankTotalsContextForSlate,
  type SlateDeskSide,
  type SlateGamePick,
} from './loungeBotPredictivePick.ts'

export type PrimetimeGameType = 'TNF' | 'SNF' | 'MNF' | 'PRIMETIME'

export type PrimetimePersonaLean = {
  pickerName: 'Scott' | 'Rocco' | 'Chedda' | 'Tank'
  roleTitle: string
  pickTeamOrSide: string
  lineDisplay: string
  bulletRationale: string
  fullPick: OddsPick
}

export type PrimetimeSpotlightGame = {
  eventId: string
  sportKey: string
  primetimeType: PrimetimeGameType
  primetimeLabel: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  spreadPoint: number | null
  totalPoint: number | null
  homeSpreadPrice: number
  awaySpreadPrice: number
  overPrice: number
  underPrice: number
  weather: GameWeatherSummary | null
  injuries: GameInjurySummary | null
  /** Pasted Action/VSiN only. Never a synthetic hash board. */
  splits: BettingSplitSummary | null
  trenchEpa: TrenchEpaMatchupSummary | null
  consensusPick: {
    side: 'home' | 'away' | 'over' | 'under' | 'pass'
    pickedName: string
    lineDisplay: string
    marketKey: 'spreads' | 'totals'
    confidenceBadge: string
    consensusTitle: string
    summaryReason: string
    houseVoteCount?: number
  }
  /** Tank totals for the header … vote, or the Over lean the wind/falling-total veto sat. */
  tankOuDisplay: string
  /** Totals equation for the tape footer. Not the ATS sidecar. */
  tankOuWhy: string
  personaLeans: Record<'Scott' | 'Rocco' | 'Chedda' | 'Tank', PrimetimePersonaLean>
}

/**
 * Identify whether an NFL game is TNF, SNF, MNF, or a standalone primetime window.
 */
export function identifyPrimetimeType(commenceTimeIso: string): PrimetimeGameType | null {
  const date = new Date(commenceTimeIso)
  if (isNaN(date.getTime())) return null

  // Convert UTC to US Pacific (America/Los_Angeles)
  const laFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = laFormatter.formatToParts(date)
  let dayOfWeek = ''
  let hour = 0
  for (const p of parts) {
    if (p.type === 'weekday') dayOfWeek = p.value
    if (p.type === 'hour') hour = parseInt(p.value, 10)
  }

  // Primetime kickoff in PT is typically 5:15 PM - 5:30 PM (17:00 - 18:30)
  if (dayOfWeek === 'Thu' && hour >= 16 && hour <= 19) return 'TNF'
  if (dayOfWeek === 'Sun' && hour >= 16 && hour <= 19) return 'SNF'
  if (dayOfWeek === 'Mon' && hour >= 16 && hour <= 19) return 'MNF'

  // Generic fallback if day matches
  if (dayOfWeek === 'Thu') return 'TNF'
  if (dayOfWeek === 'Sun' && hour >= 16) return 'SNF'
  if (dayOfWeek === 'Mon') return 'MNF'

  return null
}

function formatHouseDeskLine(lineDisplay: string, side: SlateDeskSide, pickPrice: number): string {
  if (side === 'pass' || !pickPrice) return lineDisplay
  if (/\([+-]\d+\)/.test(lineDisplay)) return lineDisplay
  return `${lineDisplay} (${formatAmericanOdds(pickPrice)})`
}

function houseDeskToPersonaLean(
  desk: 'Scott' | 'Rocco' | 'Chedda' | 'Tank',
  roleTitle: string,
  housePick: SlateGamePick['pickerPicks']['Scott'],
  matchedEvent: OddsEvent,
  homeTeam: string,
  awayTeam: string,
  bullet: string,
): PrimetimePersonaLean {
  const marketKey = desk === 'Tank' ? 'totals' : 'spreads'
  return {
    pickerName: desk,
    roleTitle,
    pickTeamOrSide: housePick.teamName,
    lineDisplay: formatHouseDeskLine(housePick.lineDisplay, housePick.side, housePick.pickPrice),
    bulletRationale: bullet,
    fullPick: {
      eventId: String(matchedEvent.id || ''),
      sportKey: String(matchedEvent.sport_key || 'americanfootball_nfl'),
      homeTeam,
      awayTeam,
      commenceTime: String(matchedEvent.commence_time || ''),
      marketKey,
      pickName: housePick.teamName,
      linePoint: housePick.pick?.linePoint ?? null,
      pickPrice: housePick.pickPrice,
      bookmakerKey: 'consensus',
      evPct: 0,
    } as OddsPick,
  }
}

function formatTotalNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatTankOuHeader(
  tankHouse: SlateGamePick['pickerPicks']['Tank'],
  marketTotal: number | null,
): string {
  const tot = formatTotalNumber(marketTotal)
  const totBit = tot ? ` ${tot}` : ''
  if (tankHouse.side === 'over' || tankHouse.side === 'under') {
    const side = tankHouse.side === 'over' ? 'Over' : 'Under'
    const juice = tankHouse.pickPrice ? ` (${formatAmericanOdds(tankHouse.pickPrice)})` : ''
    return `${side}${totBit}${juice}`
  }
  const signals = tankHouse.signals || []
  const why = String(tankHouse.why || '')
  const windKills = signals.includes('wind') || /wind veto/i.test(why)
  const fallKills = signals.includes('total_down') || /falling total/i.test(why)
  if (windKills) {
    return tot ? `Lean toward the Over (${tot}) … wind kills the bet` : 'Lean toward the Over … wind kills the bet'
  }
  if (fallKills) {
    return tot
      ? `Lean toward the Over (${tot}) … falling total kills the bet`
      : 'Lean toward the Over … falling total kills the bet'
  }
  return tot ? `PASS (${tot})` : 'PASS'
}

function formatSplitLeanHeader(houseGame: SlateGamePick): string {
  const bits: string[] = []
  for (const name of ['Scott', 'Rocco', 'Chedda'] as const) {
    const p = houseGame.pickerPicks[name]
    if (p.side !== 'home' && p.side !== 'away') continue
    const line = String(p.lineDisplay || '')
      .replace(/\s*·\s*\[red\].*$/i, '')
      .trim()
    bits.push(`${name} ${line || shortDisplayName(p.teamName)}`)
  }
  if (houseGame.tankAts?.published) {
    const ats = houseGame.tankAts.lineDisplay || houseGame.tankAts.teamName || ''
    if (ats) bits.push(`Tank ${ats}`)
  }
  return bits.join(' / ') || 'SPLIT'
}

function cheddaPrimetimeWhy(
  housePick: SlateGamePick['pickerPicks']['Chedda'],
): string {
  return String(housePick.why || 'No hook on the number. Sitting.').trim()
}

/**
 * Find the most relevant primetime game candidate on the active NFL board.
 */
export async function findPrimetimeGameCandidate(
  admin: SupabaseClient,
  events: OddsEvent[],
  targetType?: PrimetimeGameType,
): Promise<PrimetimeSpotlightGame | null> {
  const nflEvents = events.filter((e) => (e.sport_key === 'americanfootball_nfl' || e.sport_key === 'americanfootball_nfl_preseason') && !e.completed)
  if (!nflEvents.length) return null

  // Sort by kickoff time
  const sorted = [...nflEvents].sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())

  // Find matching primetime event
  let matchedEvent: OddsEvent | null = null
  let matchedType: PrimetimeGameType = 'PRIMETIME'

  for (const ev of sorted) {
    const pType = identifyPrimetimeType(ev.commence_time)
    if (targetType) {
      if (pType === targetType) {
        matchedEvent = ev
        matchedType = pType
        break
      }
    } else if (pType) {
      matchedEvent = ev
      matchedType = pType
      break
    }
  }

  // Fallback: if no exact day match found, pick the earliest upcoming game
  if (!matchedEvent && sorted.length > 0) {
    matchedEvent = sorted[0]
    matchedType = identifyPrimetimeType(matchedEvent.commence_time) || 'PRIMETIME'
  }

  if (!matchedEvent) return null

  const homeTeam = matchedEvent.home_team
  const awayTeam = matchedEvent.away_team

  // Extract spreads & totals lines
  let spreadPoint: number | null = null
  let homeSpreadPrice = -110
  let awaySpreadPrice = -110
  let totalPoint: number | null = null
  let overPrice = -110
  let underPrice = -110

  for (const b of matchedEvent.bookmakers || []) {
    const sm = b.markets.find((m) => m.key === 'spreads')
    if (sm && spreadPoint == null) {
      const h = sm.outcomes.find((o) => o.name === homeTeam)
      const a = sm.outcomes.find((o) => o.name === awayTeam)
      if (h?.point != null) {
        spreadPoint = h.point
        homeSpreadPrice = h.price
        awaySpreadPrice = a?.price ?? -110
      }
    }

    const tm = b.markets.find((m) => m.key === 'totals')
    if (tm && totalPoint == null) {
      const over = tm.outcomes.find((o) => o.name.toLowerCase() === 'over')
      const under = tm.outcomes.find((o) => o.name.toLowerCase() === 'under')
      if (over?.point != null) {
        totalPoint = over.point
        overPrice = over.price
        underPrice = under?.price ?? -110
      }
    }
  }

  // Default fallback spreads
  if (spreadPoint == null) spreadPoint = -3.0
  if (totalPoint == null) totalPoint = 44.5

  const primetimeLabels: Record<PrimetimeGameType, string> = {
    TNF: 'THURSDAY NIGHT FOOTBALL',
    SNF: 'SUNDAY NIGHT FOOTBALL',
    MNF: 'MONDAY NIGHT FOOTBALL',
    PRIMETIME: 'PRIMETIME SPOTLIGHT',
  }

  const sportKey = String(matchedEvent.sport_key || 'americanfootball_nfl')
  const houseEvents = [{
    id: String(matchedEvent.id || ''),
    sport_key: sportKey,
    commence_time: String(matchedEvent.commence_time || ''),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers: matchedEvent.bookmakers || [],
  }]

  const sportId = oddsSportKeyToRundownSportId(sportKey) || 2
  const rundown = await resolveRundownEvent({
    sportKey,
    homeTeam,
    awayTeam,
    commenceTime: matchedEvent.commence_time,
  }).catch(() => null)
  const [
    teamMetrics,
    injuries,
    weather,
    weightsMap,
    cfbRatingsMap,
    sideModifiersByEventId,
    pastedSplitsBoard,
    tankCtx,
  ] = await Promise.all([
    loadDbTeamMetricsMap(admin),
    fetchGameInjuryPval(admin, sportId, homeTeam, awayTeam, matchedEvent.commence_time),
    fetchGameWeather(sportId, homeTeam, matchedEvent.commence_time, rundown?.venueLocation, rundown?.venueName),
    loadPersonaWeights(admin),
    loadDbCfbPowerRatingsMap(admin),
    resolveSideModifiersForSlate(admin, sportKey, houseEvents),
    loadPastedBettingSplitsBoardForSlate(admin, sportKey, houseEvents),
    loadTankTotalsContextForSlate(admin, sportKey, houseEvents),
  ])

  const trenchEpa = calculateTrenchEpaMatchup(homeTeam, awayTeam, teamMetrics)
  const houseWeather = tankCtx.weatherByEventId.get(String(matchedEvent.id || '')) || weather

  const houseCard = buildNflAtsSlateCard(houseEvents, {
    cardTitle: `🏈 NFL Primetime · ${primetimeLabels[matchedType]}`,
    sportKey,
    weightsMap,
    teamMetricsMap: teamMetrics,
    cfbRatingsMap,
    sideModifiersByEventId,
    pastedSplitsByEventId: pastedSplitsBoard.primaryByEventId,
    pastedSplitsAllByEventId: pastedSplitsBoard.allByEventId,
    weatherByEventId: tankCtx.weatherByEventId,
    openTotalByEventId: tankCtx.openTotalByEventId,
    marketFilesByEventId: tankCtx.marketFilesByEventId,
    restTravelByEventId: tankCtx.restTravelByEventId,
  })
  const houseGame = houseCard?.games?.[0] || null
  const pastedSplits = houseGame?.splits?.isPasted === true
    ? houseGame.splits
    : (pastedSplitsBoard.primaryByEventId.get(String(matchedEvent.id || '')) || null)
  const splits = pastedSplits?.isPasted === true ? pastedSplits : null

  const passPick = {
    side: 'pass' as const,
    teamName: 'PASS',
    lineDisplay: 'PASS',
    pickPrice: 0,
    pick: {
      sportKey,
      eventId: String(matchedEvent.id || ''),
      homeTeam,
      awayTeam,
      commenceTime: String(matchedEvent.commence_time || ''),
      marketKey: 'spreads' as const,
      pickName: 'PASS',
      pickPrice: 0,
      bookTitle: 'Consensus',
      linePoint: null,
      consensusPrice: -110,
      edgePct: 0,
      consensusProb: 0.5,
      bookCount: 0,
    },
    why: 'No house unlock.',
    signals: [] as string[],
  }

  const scottHouse = houseGame?.pickerPicks.Scott || passPick
  const roccoHouse = houseGame?.pickerPicks.Rocco || passPick
  const cheddaHouse = houseGame?.pickerPicks.Chedda || passPick
  const tankHouse = houseGame?.pickerPicks.Tank || {
    ...passPick,
    lineDisplay: 'PASS',
    pick: { ...passPick.pick, marketKey: 'totals' as const },
  }
  const tankOuWhy = String(tankHouse.why || '').trim()

  let tankBullet = tankOuWhy
  if (houseGame?.tankAts?.published) {
    const ats = houseGame.tankAts.lineDisplay || houseGame.tankAts.teamName || 'ATS spot'
    tankBullet = `${tankBullet} ATS spot: ${ats}.`.trim()
  }

  const houseC = houseGame?.consensusPick || null
  const housePass = !houseC || houseC.type === 'pass_only' || (houseC.voteCount || 0) === 0
  const houseSplit = houseC?.type === 'split'
  const consensusPick = housePass
    ? {
      side: 'pass' as const,
      pickedName: 'PASS',
      lineDisplay: 'PASS',
      marketKey: 'spreads' as const,
      confidenceBadge: houseC?.badgeText || '⏭️ All pass',
      consensusTitle: 'No house ATS lean',
      summaryReason: splits?.summaryLine || 'No house ATS unlock on this primetime card.',
      houseVoteCount: 0,
    }
    : houseSplit && houseGame
      ? {
        side: 'pass' as const,
        pickedName: 'SPLIT',
        lineDisplay: formatSplitLeanHeader(houseGame),
        marketKey: 'spreads' as const,
        confidenceBadge: houseC.badgeText,
        consensusTitle: 'House split',
        summaryReason: 'Desks disagree. No cloned Chedda vote to break it.',
        houseVoteCount: 0,
      }
    : {
      side: houseC.side,
      pickedName: houseC.teamName,
      lineDisplay: houseC.lineDisplay,
      marketKey: 'spreads' as const,
      confidenceBadge: houseC.badgeText,
      consensusTitle: `${shortDisplayName(houseC.teamName)} (${houseC.badgeText})`,
      summaryReason: houseC.badgeText,
      houseVoteCount: houseC.voteCount,
    }

  return {
    eventId: String(matchedEvent.id || ''),
    sportKey,
    primetimeType: matchedType,
    primetimeLabel: primetimeLabels[matchedType],
    homeTeam,
    awayTeam,
    commenceTime: String(matchedEvent.commence_time || ''),
    spreadPoint,
    totalPoint,
    homeSpreadPrice,
    awaySpreadPrice,
    overPrice,
    underPrice,
    weather: houseWeather,
    injuries,
    splits,
    trenchEpa,
    consensusPick,
    tankOuDisplay: formatTankOuHeader(
      tankHouse,
      houseGame?.marketTotal ?? totalPoint,
    ),
    tankOuWhy,
    personaLeans: {
      Scott: houseDeskToPersonaLean(
        'Scott',
        'The Model',
        scottHouse,
        matchedEvent,
        homeTeam,
        awayTeam,
        String(scottHouse.why || 'No house unlock.').trim(),
      ),
      Rocco: houseDeskToPersonaLean(
        'Rocco',
        'Short-fav / Hooks',
        roccoHouse,
        matchedEvent,
        homeTeam,
        awayTeam,
        String(roccoHouse.why || 'No house unlock.').trim(),
      ),
      Tank: houseDeskToPersonaLean(
        'Tank',
        'Totals & Climate',
        tankHouse,
        matchedEvent,
        homeTeam,
        awayTeam,
        tankBullet,
      ),
      Chedda: houseDeskToPersonaLean(
        'Chedda',
        'Dogs & Action Splits',
        cheddaHouse,
        matchedEvent,
        homeTeam,
        awayTeam,
        cheddaPrimetimeWhy(cheddaHouse),
      ),
    },
  }
}

/**
 * Short fallback lean. Primetime X / Lounge / VIP chat use the 4-desk card.
 */
export function formatPrimetimeSpotlightCaption(spotlight: PrimetimeSpotlightGame): string {
  const kickoff = formatOddsCommenceTimeShort(spotlight.commenceTime)
  const homeShort = shortDisplayName(spotlight.homeTeam)
  const awayShort = shortDisplayName(spotlight.awayTeam)

  return [
    `🏈 **${spotlight.primetimeLabel} SPOTLIGHT LEAN**`,
    `**${awayShort} @ ${homeShort}** · ${kickoff}`,
    '',
    spotlight.consensusPick.pickedName === 'SPLIT'
      ? `⚔️ **House Divided**`
      : `🔦 **Lean:** **${spotlight.consensusPick.lineDisplay}**`,
    ...(spotlight.consensusPick.pickedName === 'SPLIT'
      ? [`**${spotlight.consensusPick.lineDisplay}**`]
      : []),
    `**O/U:** ${spotlight.tankOuDisplay}`,
  ].join('\n')
}

/** Public Lounge + VIP chat card. Same 4-desk writeup. No fan-only Lounge twin. */
export function formatPrimetimeVipDeepDive(spotlight: PrimetimeSpotlightGame): string {
  const homeShort = shortDisplayName(spotlight.homeTeam)
  const awayShort = shortDisplayName(spotlight.awayTeam)
  const divided = spotlight.consensusPick.pickedName === 'SPLIT'
  const lines = [
    `🔦 **${spotlight.primetimeLabel} Spotlight · ${awayShort} @ ${homeShort}**`,
    ...(divided
      ? [`**⚔️ House Divided**`, `**${spotlight.consensusPick.lineDisplay}**`]
      : [`**Lean:** **${spotlight.consensusPick.lineDisplay}**`]),
    `**O/U:** ${spotlight.tankOuDisplay}`,
    '',
  ]
  for (const desk of ['Scott', 'Rocco', 'Tank', 'Chedda'] as const) {
    const lean = spotlight.personaLeans[desk]
    lines.push(`• ${formatColoredPickerName(desk)}: ${lean.lineDisplay}`)
    const isPass = lean.pickTeamOrSide === 'PASS' || /^PASS\b/i.test(lean.lineDisplay)
    if (!isPass && lean.bulletRationale) {
      lines.push(`  └ *${lean.bulletRationale}*`)
    }
  }
  const pastedLine = spotlight.splits?.isPasted === true ? spotlight.splits.summaryLine : ''
  if (spotlight.weather?.summaryLine || spotlight.injuries?.summaryLine || pastedLine || spotlight.tankOuWhy) {
    lines.push('')
    if (spotlight.weather?.summaryLine) lines.push(`🌤️ ${spotlight.weather.summaryLine}`)
    if (spotlight.injuries?.summaryLine) lines.push(`🩹 ${spotlight.injuries.summaryLine}`)
    if (pastedLine) lines.push(`⚡ ${pastedLine}`)
    if (spotlight.tankOuWhy) lines.push(`Tank O/U: ${spotlight.tankOuWhy}`)
  }
  lines.push(
    '',
    `*Lean, not lock. Desks stay as written. We only kill or flip if a listed starter (QB / LT / edge / featured RB) is ruled out, or the number walks off the edge. Official lock is 90-min inactives.*`,
    `*Halftime pivots drop in Sharpe VIP when there's a real 2H play.*`,
  )
  return lines.join('\n')
}

export type PrimetimePublishResult = {
  ok: boolean
  postId?: string
  publicPostId?: string
  privatePostId?: string | null
  publisherMode?: string
  pickIds: string[]
  error?: string
  fanOnlyWarning?: string
  vipChatWarning?: string
  xWarning?: string
  tweetId?: string | null
}

/**
 * Publish the Primetime Solo Spotlight: public Lounge + VIP chat + X
 * all get the 4-desk card. No fan-only Lounge post. Ledger the lean.
 */
export async function publishAndRecordPrimetimeSpotlight(
  admin: SupabaseClient,
  botUserId: string,
  spotlight: PrimetimeSpotlightGame,
  categoryPills: string[] = ['sports'],
  destinations?: unknown,
): Promise<PrimetimePublishResult> {
  const publisher = await resolveSlatePublisher(admin, botUserId)
  const publishAs = publisher.botUserId
  const pills = categoryPills.length ? categoryPills : ['sports']
  const loungeCaption = formatPrimetimeVipDeepDive(spotlight)
  const dest = resolvePublishDestinations(destinations, {
    loungePublic: true,
    loungeFanOnly: false,
    vipChat: true,
    x: true,
  })
  dest.loungeFanOnly = false

  const fan = await fanOutSyndicatePublish({
    admin,
    botUserId: publishAs,
    dest,
    publicCaption: loungeCaption,
    vipCaption: loungeCaption,
    xCaption: loungeCaption,
    xMaxChars: X_LONG_FORM_CHARS,
    categoryPills: pills,
  })

  if (dest.loungePublic && fan.error) {
    return {
      ok: false,
      pickIds: [],
      publisherMode: publisher.mode,
      error: fan.error,
      xWarning: fan.xWarning,
    }
  }

  const postId = fan.privatePostId || fan.publicPostId || undefined
  const pickIds: string[] = []

  const houseLean = spotlight.consensusPick.side !== 'pass'
    && spotlight.consensusPick.pickedName !== 'PASS'
    && (spotlight.consensusPick.houseVoteCount ?? 1) > 0

  if (houseLean) {
    const officialLean = spotlight.personaLeans.Scott.fullPick
    const isHome = spotlight.consensusPick.side === 'home'
    const pickLine = spotlight.consensusPick.marketKey === 'spreads'
      ? (isHome ? spotlight.spreadPoint : (spotlight.spreadPoint != null ? -spotlight.spreadPoint : null))
      : spotlight.totalPoint
    const leanPrice = officialLean.pickPrice
      || (isHome ? spotlight.homeSpreadPrice : spotlight.awaySpreadPrice)

    const { data: inserted } = await admin
      .from('lounge_bot_picks')
      .insert({
        bot_user_id: publishAs,
        post_id: postId,
        picker_name: 'Scott',
        event_id: spotlight.eventId,
        sport_key: spotlight.sportKey,
        home_team: spotlight.homeTeam,
        away_team: spotlight.awayTeam,
        commence_time: spotlight.commenceTime,
        market_key: spotlight.consensusPick.marketKey,
        pick_name: spotlight.consensusPick.pickedName,
        pick_line: pickLine,
        pick_price: leanPrice,
        bookmaker_key: 'consensus',
        ev_pct: 0,
        status: 'pending',
        metadata: {
          primetime_type: spotlight.primetimeType,
          is_primetime_spotlight: true,
          consensus_side: spotlight.consensusPick.side,
          scott_pick: spotlight.personaLeans.Scott.lineDisplay,
          rocco_pick: spotlight.personaLeans.Rocco.lineDisplay,
          tank_pick: spotlight.personaLeans.Tank.lineDisplay,
          chedda_pick: spotlight.personaLeans.Chedda.lineDisplay,
          weather_summary: spotlight.weather?.summaryLine,
          splits_summary: spotlight.splits?.isPasted === true ? spotlight.splits.summaryLine : null,
          trench_summary: spotlight.trenchEpa?.summaryLine,
        },
      })
      .select('id')
      .single()

    if (inserted?.id) {
      pickIds.push(inserted.id)
    }
  }

  // Friday house lean is not the primetime lock. Void leftover pending
  // desk rows on this event so SNF/MNF does not double-grade.
  const { data: houseRows } = await admin
    .from('lounge_bot_picks')
    .select('id, market_key, metadata')
    .eq('bot_user_id', publishAs)
    .eq('event_id', spotlight.eventId)
    .eq('status', 'pending')
  for (const row of houseRows || []) {
    if (String(row.market_key || '') === 'teasers') continue
    const meta = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {}
    if (meta.is_primetime_spotlight === true) continue
    await admin
      .from('lounge_bot_picks')
      .update({
        status: 'cancelled',
        units_net: 0,
        resolved_at: new Date().toISOString(),
        metadata: { ...meta, slate_void: 'primetime_owns_lock' },
      })
      .eq('id', row.id)
  }

  return {
    ok: true,
    postId,
    publicPostId: fan.publicPostId,
    privatePostId: fan.privatePostId,
    publisherMode: publisher.mode,
    pickIds,
    tweetId: fan.tweetId,
    ...(fan.fanOnlyWarning ? { fanOnlyWarning: fan.fanOnlyWarning } : {}),
    ...(fan.vipChatWarning ? { vipChatWarning: fan.vipChatWarning } : {}),
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
  }
}
