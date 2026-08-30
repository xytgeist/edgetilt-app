/**
 * NFL Primetime Solo Spotlights Engine (TNF / SNF / MNF).
 * Produces deep-dive 4-man syndicate breakdown posts for standalone primetime games:
 * 1. Scott (The Model & Net EPA)
 * 2. Rocco (Trenches, PBWR/PRWR & Pressure Rates)
 * 3. Tank (Venue Climate, Weather & Totals Pace)
 * 4. Chedda (Sharp Money Divergence & Live Dog Value)
 * 5. Official Syndicate Consensus / Primary Recommendation.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'
import {
  formatAmericanOdds,
  formatOddsCommenceTimeShort,
  shortDisplayName,
  type OddsPick,
} from './loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from './loungeBotPublish.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import { fetchGameWeather, type GameWeatherSummary } from './loungeBotWeather.ts'
import { oddsSportKeyToRundownSportId } from './loungeBotRundownContext.ts'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import { resolveGameBettingSplits, type BettingSplitSummary } from './loungeBotBettingSplits.ts'
import {
  calculateTrenchEpaMatchup,
  loadDbTeamMetricsMap,
  type TrenchEpaMatchupSummary,
} from './loungeBotTeamMetrics.ts'
import { analyzeFootballKeyNumbers } from './loungeBotKeyNumbers.ts'

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
  splits: BettingSplitSummary
  trenchEpa: TrenchEpaMatchupSummary | null
  consensusPick: {
    side: 'home' | 'away' | 'over' | 'under'
    pickedName: string
    lineDisplay: string
    marketKey: 'spreads' | 'totals'
    confidenceBadge: string
    consensusTitle: string
    summaryReason: string
  }
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

  // Load team metrics, injuries, weather, and betting splits in parallel
  const sportId = oddsSportKeyToRundownSportId(matchedEvent.sport_key) || 2
  const [teamMetrics, injuries, weather] = await Promise.all([
    loadDbTeamMetricsMap(admin),
    fetchGameInjuryPval(admin, sportId, homeTeam, awayTeam, matchedEvent.commence_time),
    fetchGameWeather(sportId, homeTeam, matchedEvent.commence_time),
  ])

  const trenchEpa = calculateTrenchEpaMatchup(homeTeam, awayTeam, teamMetrics)
  const splits = resolveGameBettingSplits(matchedEvent, spreadPoint, homeSpreadPrice, awaySpreadPrice)

  const homeSpreadDisp = `${shortDisplayName(homeTeam)} ${spreadPoint > 0 ? `+${spreadPoint}` : spreadPoint}`
  const awaySpreadDisp = `${shortDisplayName(awayTeam)} ${(-spreadPoint) > 0 ? `+${-spreadPoint}` : -spreadPoint}`
  const overDisp = `Over ${totalPoint}`
  const underDisp = `Under ${totalPoint}`

  const homeKeyAnalysis = analyzeFootballKeyNumbers(spreadPoint)
  const awayKeyAnalysis = analyzeFootballKeyNumbers(spreadPoint != null ? -spreadPoint : null)

  // 1. Scott (The Model / Net EPA)
  const epaFavorsHome = (trenchEpa?.netEpaDeltaHome ?? 0) >= 0.03
  const scottSide = epaFavorsHome ? 'home' : 'away'
  const scottTeam = scottSide === 'home' ? homeTeam : awayTeam
  const scottLineDisp = scottSide === 'home' ? homeSpreadDisp : awaySpreadDisp
  const scottKeyTag = (scottSide === 'home' ? homeKeyAnalysis?.isKeyNumber : awayKeyAnalysis?.isKeyNumber)
    ? ' [Key Margin]'
    : ''
  const scottBullet = trenchEpa?.isEpaMismatch
    ? `Net EPA/play favors ${shortDisplayName(scottTeam)} by +${Math.abs(trenchEpa.netEpaDeltaHome).toFixed(3)} pts/play (Model spread: ${trenchEpa.epaSpreadImpactHome > 0 ? shortDisplayName(homeTeam) : shortDisplayName(awayTeam)} ${Math.abs(trenchEpa.epaSpreadImpactHome).toFixed(1)}).${scottKeyTag}`
    : `Model rates ${shortDisplayName(scottTeam)} with an efficiency edge in high-leverage passing situations.${scottKeyTag}`

  // 2. Rocco (Trenches & Pressure Rates)
  const trenchFavorsHome = (trenchEpa?.netTrenchSpreadImpactHome ?? 0) > 0
  const roccoSide = trenchFavorsHome ? 'home' : 'away'
  const roccoTeam = roccoSide === 'home' ? homeTeam : awayTeam
  const roccoLineDisp = roccoSide === 'home' ? homeSpreadDisp : awaySpreadDisp
  const roccoKeyTaxTag = (roccoSide === 'home' ? homeKeyAnalysis?.isHookTax : awayKeyAnalysis?.isHookTax)
    ? ' [Hook Tax Alert]'
    : ''
  const roccoBullet = trenchEpa?.isTrenchMismatch
    ? `Trench Mismatch: ${shortDisplayName(roccoTeam)} holds a decisive edge in Pass Block Win Rate vs opponent pressure front.${roccoKeyTaxTag}`
    : `Offensive line protection grades higher in short-yardage and goal-to-go situations.${roccoKeyTaxTag}`

  // 3. Tank (Climate, Pace & Totals)
  const isUnderLean = (weather?.isHighWind || weather?.isExtremeCold) || (totalPoint >= 47.0 && (trenchEpa?.awayNetEpa ?? 0) < 0)
  const tankTotalSide = isUnderLean ? 'under' : 'over'
  const tankLineDisp = isUnderLean ? underDisp : overDisp
  const tankBullet = weather?.isHighWind || weather?.isExtremeCold || weather?.isPrecipAlert
    ? `Weather Alert: ${weather.summaryLine} suggests reduced deep ball EPA and increased ground game clock runoff.`
    : `Pace analysis projects sustained red zone efficiency against opponent standard defensive scheme.`

  // 4. Chedda (Sharp Splits & Dog Hunter)
  const sharpDogSide = (spreadPoint > 0 && splits.sharpFavoredSide === 'home')
    ? 'home'
    : ((-spreadPoint) > 0 && splits.sharpFavoredSide === 'away')
      ? 'away'
      : (spreadPoint > 0 ? 'home' : 'away')
  const cheddaTeam = sharpDogSide === 'home' ? homeTeam : awayTeam
  const cheddaLineDisp = sharpDogSide === 'home' ? homeSpreadDisp : awaySpreadDisp
  const cheddaGoldenTag = (cheddaTeam === homeTeam ? homeKeyAnalysis?.isHookGolden : awayKeyAnalysis?.isHookGolden)
    ? ' [Golden Hook · Key #3/7 Cluster]'
    : ''
  const cheddaBullet = splits.isSharpDivergence
    ? `${splits.summaryLine}. Backing the live dog with pro money support.${cheddaGoldenTag}`
    : `Taking points with ${shortDisplayName(cheddaTeam)} on key numbers against over-inflated chalk.${cheddaGoldenTag}`

  // Consensus Primary Recommendation
  const homeVotes = (scottSide === 'home' ? 1 : 0) + (roccoSide === 'home' ? 1 : 0) + (cheddaTeam === homeTeam ? 1 : 0)
  const consensusTeam = homeVotes >= 2 ? homeTeam : awayTeam
  const consensusSide = homeVotes >= 2 ? 'home' : 'away'
  const consensusLineDisp = consensusSide === 'home' ? homeSpreadDisp : awaySpreadDisp
  const isHammer = homeVotes === 3 || homeVotes === 0

  const primetimeLabels: Record<PrimetimeGameType, string> = {
    TNF: 'THURSDAY NIGHT FOOTBALL',
    SNF: 'SUNDAY NIGHT FOOTBALL',
    MNF: 'MONDAY NIGHT FOOTBALL',
    PRIMETIME: 'PRIMETIME SPOTLIGHT',
  }

  return {
    eventId: matchedEvent.id,
    sportKey: matchedEvent.sport_key,
    primetimeType: matchedType,
    primetimeLabel: primetimeLabels[matchedType],
    homeTeam,
    awayTeam,
    commenceTime: matchedEvent.commence_time,
    spreadPoint,
    totalPoint,
    homeSpreadPrice,
    awaySpreadPrice,
    overPrice,
    underPrice,
    weather,
    injuries,
    splits,
    trenchEpa,
    consensusPick: {
      side: consensusSide,
      pickedName: consensusTeam,
      lineDisplay: consensusLineDisp,
      marketKey: 'spreads',
      confidenceBadge: isHammer ? '🔥 SYNDICATE HAMMER' : '🎯 SYNDICATE CONSENSUS',
      consensusTitle: `${shortDisplayName(consensusTeam)} (${isHammer ? '3-0 Trench/Model Backed' : 'Syndicate Majority'})`,
      summaryReason: trenchEpa?.summaryLine || splits.summaryLine || 'High-value situational alignment across all desks.',
    },
    personaLeans: {
      Scott: {
        pickerName: 'Scott',
        roleTitle: 'The Model',
        pickTeamOrSide: scottTeam,
        lineDisplay: `${scottLineDisp} (${formatAmericanOdds(scottSide === 'home' ? homeSpreadPrice : awaySpreadPrice)})`,
        bulletRationale: scottBullet,
        fullPick: {
          eventId: matchedEvent.id,
          sportKey: matchedEvent.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: matchedEvent.commence_time,
          marketKey: 'spreads',
          pickName: scottTeam,
          linePoint: scottSide === 'home' ? spreadPoint : -spreadPoint,
          pickPrice: scottSide === 'home' ? homeSpreadPrice : awaySpreadPrice,
          bookmakerKey: 'consensus',
          evPct: 3.8,
        },
      },
      Rocco: {
        pickerName: 'Rocco',
        roleTitle: 'Vegas Spreads & Trenches',
        pickTeamOrSide: roccoTeam,
        lineDisplay: `${roccoLineDisp} (${formatAmericanOdds(roccoSide === 'home' ? homeSpreadPrice : awaySpreadPrice)})`,
        bulletRationale: roccoBullet,
        fullPick: {
          eventId: matchedEvent.id,
          sportKey: matchedEvent.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: matchedEvent.commence_time,
          marketKey: 'spreads',
          pickName: roccoTeam,
          linePoint: roccoSide === 'home' ? spreadPoint : -spreadPoint,
          pickPrice: roccoSide === 'home' ? homeSpreadPrice : awaySpreadPrice,
          bookmakerKey: 'consensus',
          evPct: 3.2,
        },
      },
      Tank: {
        pickerName: 'Tank',
        roleTitle: 'Totals & Climate',
        pickTeamOrSide: tankTotalSide === 'under' ? 'Under' : 'Over',
        lineDisplay: `${tankLineDisp} (${formatAmericanOdds(tankTotalSide === 'under' ? underPrice : overPrice)})`,
        bulletRationale: tankBullet,
        fullPick: {
          eventId: matchedEvent.id,
          sportKey: matchedEvent.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: matchedEvent.commence_time,
          marketKey: 'totals',
          pickName: tankTotalSide === 'under' ? 'Under' : 'Over',
          linePoint: totalPoint,
          pickPrice: tankTotalSide === 'under' ? underPrice : overPrice,
          bookmakerKey: 'consensus',
          evPct: 2.9,
        },
      },
      Chedda: {
        pickerName: 'Chedda',
        roleTitle: 'Dogs & Sharp Money',
        pickTeamOrSide: cheddaTeam,
        lineDisplay: `${cheddaLineDisp} (${formatAmericanOdds(cheddaTeam === homeTeam ? homeSpreadPrice : awaySpreadPrice)})`,
        bulletRationale: cheddaBullet,
        fullPick: {
          eventId: matchedEvent.id,
          sportKey: matchedEvent.sport_key,
          homeTeam,
          awayTeam,
          commenceTime: matchedEvent.commence_time,
          marketKey: 'spreads',
          pickName: cheddaTeam,
          linePoint: cheddaTeam === homeTeam ? spreadPoint : -spreadPoint,
          pickPrice: cheddaTeam === homeTeam ? homeSpreadPrice : awaySpreadPrice,
          bookmakerKey: 'consensus',
          evPct: 3.5,
        },
      },
    },
  }
}

/**
 * Format the full markdown caption for the Primetime Solo Spotlight post.
 */
export function formatPrimetimeSpotlightCaption(spotlight: PrimetimeSpotlightGame): string {
  const kickoff = formatOddsCommenceTimeShort(spotlight.commenceTime)
  const homeShort = shortDisplayName(spotlight.homeTeam)
  const awayShort = shortDisplayName(spotlight.awayTeam)

  const lines: string[] = []

  // Header Banner
  lines.push(`🏈 **${spotlight.primetimeLabel} SPOTLIGHT**`)
  lines.push(`**${awayShort} @ ${homeShort}** · Kickoff: ${kickoff}`)
  lines.push('')

  // Consensus Primary Call
  lines.push(`🎯 **Official Syndicate Pick:** **${spotlight.consensusPick.lineDisplay}**`)
  lines.push(`*${spotlight.consensusPick.confidenceBadge} · ${spotlight.consensusPick.summaryReason}*`)
  lines.push('')

  // 4-Man Syndicate Breakdown
  lines.push('📋 **4-Man Crew Breakdown:**')
  lines.push(`• 🧠 **Scott (The Model):** ${spotlight.personaLeans.Scott.lineDisplay}`)
  lines.push(`  └ *${spotlight.personaLeans.Scott.bulletRationale}*`)
  lines.push(`• 🔨 **Rocco (The Trenches):** ${spotlight.personaLeans.Rocco.lineDisplay}`)
  lines.push(`  └ *${spotlight.personaLeans.Rocco.bulletRationale}*`)
  lines.push(`• 🛡️ **Tank (Totals & Pace):** ${spotlight.personaLeans.Tank.lineDisplay}`)
  lines.push(`  └ *${spotlight.personaLeans.Tank.bulletRationale}*`)
  lines.push(`• 💰 **Chedda (Sharp Splits):** ${spotlight.personaLeans.Chedda.lineDisplay}`)
  lines.push(`  └ *${spotlight.personaLeans.Chedda.bulletRationale}*`)
  lines.push('')

  // Situational Context
  if (spotlight.weather?.summaryLine || spotlight.injuries?.summaryLine) {
    lines.push('📊 **Situational Intelligence:**')
    if (spotlight.weather?.summaryLine) {
      lines.push(`• 🌤️ **Venue Weather:** ${spotlight.weather.summaryLine}`)
    }
    if (spotlight.injuries?.summaryLine) {
      lines.push(`• 🩹 **Injury PVAL:** ${spotlight.injuries.summaryLine}`)
    }
    if (spotlight.splits?.summaryLine) {
      lines.push(`• ⚡ **Market Splits:** ${spotlight.splits.summaryLine}`)
    }
    lines.push('')
  }

  // Footer & CTA
  lines.push(`💬 *Live in-game adjustments & alternate player props dropping in Sharpe VIP Syndicate chat.*`)

  return lines.join('\n')
}

/**
 * Publish the Primetime Solo Spotlight post and log picks to the ledger.
 */
export async function publishAndRecordPrimetimeSpotlight(
  admin: SupabaseClient,
  botUserId: string,
  spotlight: PrimetimeSpotlightGame,
  categoryPills: string[] = ['sports', 'nfl'],
): Promise<{ ok: boolean; postId?: string; pickIds: string[] }> {
  const caption = formatPrimetimeSpotlightCaption(spotlight)

  // 1. Publish public post to the Lounge feed
  const postRes = await publishLoungeBotPost(admin, botUserId, caption, {
    categoryPills: [...new Set([...categoryPills, 'nfl', 'primetime'])],
    dryRun: false,
  })

  if (!postRes.ok || !postRes.postId) {
    return { ok: false, pickIds: [] }
  }

  const postId = postRes.postId
  const pickIds: string[] = []

  // 2. Log official consensus pick into lounge_bot_picks for grading
  const officialLean = spotlight.personaLeans.Scott.fullPick
  const isHome = spotlight.consensusPick.side === 'home'
  const isOver = spotlight.consensusPick.side === 'over'

  const pickLine = spotlight.consensusPick.marketKey === 'spreads'
    ? (isHome ? spotlight.spreadPoint : (spotlight.spreadPoint != null ? -spotlight.spreadPoint : null))
    : spotlight.totalPoint

  const { data: inserted, error: insErr } = await admin
    .from('lounge_bot_picks')
    .insert({
      bot_user_id: botUserId,
      post_id: postId,
      picker_name: 'Scott', // Primary syndicate representative
      event_id: spotlight.eventId,
      sport_key: spotlight.sportKey,
      home_team: spotlight.homeTeam,
      away_team: spotlight.awayTeam,
      commence_time: spotlight.commenceTime,
      market_key: spotlight.consensusPick.marketKey,
      pick_name: spotlight.consensusPick.pickedName,
      pick_line: pickLine,
      pick_price: officialLean.pickPrice,
      bookmaker_key: officialLean.bookmakerKey || 'consensus',
      ev_pct: officialLean.evPct || 3.5,
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
        splits_summary: spotlight.splits?.summaryLine,
        trench_summary: spotlight.trenchEpa?.summaryLine,
      },
    })
    .select('id')
    .single()

  if (inserted?.id) {
    pickIds.push(inserted.id)
  }

  // 3. Drop private high-value deep-dive breakdown to Scott's VIP subscriber channel
  const vipDrop = [
    `🎯 **Sharpe VIP Primetime Deep Dive · ${shortDisplayName(spotlight.awayTeam)} @ ${shortDisplayName(spotlight.homeTeam)}**`,
    `Official Syndicate Pick: **${spotlight.consensusPick.lineDisplay}**`,
    '',
    `• Scott: ${spotlight.personaLeans.Scott.lineDisplay}`,
    `• Rocco: ${spotlight.personaLeans.Rocco.lineDisplay}`,
    `• Tank: ${spotlight.personaLeans.Tank.lineDisplay}`,
    `• Chedda: ${spotlight.personaLeans.Chedda.lineDisplay}`,
    '',
    `*In-game live odds hedge alerts will drop here at halftime.*`,
  ].join('\n')

  await publishBotSubChatMessage(admin, botUserId, vipDrop)

  return { ok: true, postId, pickIds }
}
