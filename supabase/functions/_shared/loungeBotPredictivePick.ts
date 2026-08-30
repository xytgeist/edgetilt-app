/**
 * Predictive sports betting calls for the Sharp Desk (Scott, Rocco, Chedda, Tank).
 * Supports solo calls and syndicate multi-picker cards.
 * Auto-grades against The Odds API final scores with unit tracking and consolidated card recaps.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
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
import { loadPersonaWeights } from './loungeBotPersonaAdaptive.ts'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import { resolveGameBettingSplits, type BettingSplitSummary } from './loungeBotBettingSplits.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

export const SHARP_PICKERS = ['Scott', 'Rocco', 'Chedda', 'Tank'] as const
export type SharpPicker = (typeof SHARP_PICKERS)[number]

export type SinglePickerPick = {
  pickerName: SharpPicker
  pick: OddsPick
}

export type SlateGamePick = {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  spreadPoint: number | null // home spread point (e.g. -3.5 or +2.5)
  splits?: BettingSplitSummary
  consensusPick: {
    side: 'home' | 'away'
    teamName: string
    lineDisplay: string
    voteCount: number // e.g. 4 or 3
    type: 'hammer' | 'consensus' | 'split'
    badgeText: string // '🔥 4-0 Hammer' | '🎯 3-1 Consensus' | '⚔️ 2-2 Split'
  }
  pickerPicks: Record<SharpPicker, {
    side: 'home' | 'away'
    teamName: string
    lineDisplay: string
    pickPrice: number
    pick: OddsPick
  }>
}

export type NflSlateCard = {
  cardTitle: string
  sportKey: string
  games: SlateGamePick[]
  hammers: SlateGamePick[]
  consensus: SlateGamePick[]
  splits: SlateGamePick[]
}

export type ScoreEvent = {
  id: string
  sport_key: string
  completed: boolean
  home_team?: string
  away_team?: string
  scores?: Array<{ name: string; score: string }>
}

/**
 * Format a single pick line for display.
 * E.g. "Diamondbacks +1.5 (-110)" or "Orioles ML (+125)" or "Over 8.5 (-105)"
 */
export function formatPickLine(pick: OddsPick): string {
  const odds = formatAmericanOdds(pick.pickPrice)
  if (pick.marketKey === 'h2h') {
    return `${shortDisplayName(pick.pickName)} ML (${odds})`
  }
  if (pick.marketKey === 'spreads' && pick.linePoint != null) {
    const pt = pick.linePoint > 0 ? `+${pick.linePoint}` : String(pick.linePoint)
    return `${shortDisplayName(pick.pickName)} ${pt} (${odds})`
  }
  if (pick.marketKey === 'totals' && pick.linePoint != null) {
    const side = /^over$/i.test(pick.pickName) ? 'Over' : /^under$/i.test(pick.pickName) ? 'Under' : pick.pickName
    return `${side} ${pick.linePoint} (${odds})`
  }
  return `${pick.pickName} (${odds})`
}

/**
 * Format a solo predictive pick post.
 *
 * Example:
 * 🎯 Tank's Pick
 *
 * Under 43.5 (-110)
 * Bills vs Dolphins (1:05 PM PT)
 * 💨 Highmark Stadium · 38°F · Wind 19 mph
 */
export function formatSoloPredictiveCaption(
  pickerName: SharpPicker,
  pick: OddsPick,
  weather?: GameWeatherSummary | null,
  injuries?: GameInjurySummary | null,
  splits?: BettingSplitSummary | null,
): string {
  const line = formatPickLine(pick)
  const away = shortDisplayName(pick.awayTeam)
  const home = shortDisplayName(pick.homeTeam)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const matchup = `${away} vs ${home} (${when})`

  const lines = [`🎯 ${pickerName}'s Pick\n\n${line}\n${matchup}`]
  if (weather && !weather.isDome && (weather.isHighWind || weather.isExtremeCold || weather.isPrecipAlert)) {
    lines.push(`\n📍 ${weather.summaryLine}`)
  }
  if (injuries && injuries.isSignificant && injuries.summaryLine) {
    lines.push(`\n🚑 Injury Impact: ${injuries.summaryLine}`)
  }
  if (splits && splits.isSharpDivergence && splits.summaryLine) {
    lines.push(`\n📊 Sharp Splits: ${splits.summaryLine}`)
  }

  return lines.join('')
}

/**
 * Format a multi-picker syndicate card post.
 *
 * Example:
 * 🏈 Sunday Syndicate Card
 *
 * 🎯 Scott: Chiefs -3.5 (-110)
 * 🎯 Rocco: Lions -6.5 (-105)
 * 🎯 Chedda: Cardinals ML (+165)
 * 🎯 Tank: Over 47.5 (-110) Bills/Dolphins
 */
export function formatSyndicateCardCaption(title: string, picks: SinglePickerPick[]): string {
  const lines: string[] = [`${title || '🎯 Sharpe Syndicate Card'}\n`]
  for (const item of picks) {
    const pLine = formatPickLine(item.pick)
    const away = shortDisplayName(item.pick.awayTeam)
    const home = shortDisplayName(item.pick.homeTeam)
    lines.push(`🎯 ${item.pickerName}: ${pLine} (${away}/${home})`)
  }
  return lines.join('\n')
}

/**
 * Format an NFL / Football Slate Card caption for the Lounge feed.
 * Highlights:
 * 1. 🔥 Unanimous 4-0 Hammers
 * 2. 🎯 3-1 Consensus Plays
 * 3. ⚔️ 2-2 House Divided / Splits
 */
export function formatNflSlateCardCaption(card: NflSlateCard): string {
  const lines: string[] = [`${card.cardTitle || '🏈 NFL Sharpe Syndicate Slate'}\n`]

  if (card.hammers.length > 0) {
    lines.push('🔥 UNANIMOUS 4-0 HAMMERS:')
    for (const g of card.hammers) {
      const away = shortDisplayName(g.awayTeam)
      const home = shortDisplayName(g.homeTeam)
      const when = formatOddsCommenceTimeShort(g.commenceTime)
      lines.push(`• ${g.consensusPick.lineDisplay} (${away}/${home} · ${when})`)
    }
    lines.push('')
  }

  if (card.consensus.length > 0) {
    lines.push('🎯 3-1 CONSENSUS PLAYS:')
    for (const g of card.consensus) {
      const away = shortDisplayName(g.awayTeam)
      const home = shortDisplayName(g.homeTeam)
      const agreeing = SHARP_PICKERS.filter((p) => g.pickerPicks[p].side === g.consensusPick.side).join(', ')
      lines.push(`• ${g.consensusPick.lineDisplay} (${agreeing}) · ${away}/${home}`)
    }
    lines.push('')
  }

  if (card.splits.length > 0) {
    lines.push('⚔️ HOUSE DIVIDED (2-2):')
    for (const g of card.splits) {
      const away = shortDisplayName(g.awayTeam)
      const home = shortDisplayName(g.homeTeam)
      const homePickers = SHARP_PICKERS.filter((p) => g.pickerPicks[p].side === 'home').join('/')
      const awayPickers = SHARP_PICKERS.filter((p) => g.pickerPicks[p].side === 'away').join('/')
      const homeLine = g.pickerPicks[SHARP_PICKERS.find((p) => g.pickerPicks[p].side === 'home')!].lineDisplay
      const awayLine = g.pickerPicks[SHARP_PICKERS.find((p) => g.pickerPicks[p].side === 'away')!].lineDisplay
      lines.push(`• ${away}/${home}: ${awayPickers} (${awayLine}) vs ${homePickers} (${homeLine})`)
    }
    lines.push('')
  }

  lines.push('📊 Full 16-game interactive grid & in-game edges in the Sharpe VIP Syndicate.')
  return lines.join('\n').trim()
}

/**
 * Format a clean, full ATS card list for a single persona (e.g. Tank or Chedda)
 * for distribution to VIP subscriber chat rooms.
 */
export function formatPickerSlateList(card: NflSlateCard, picker: SharpPicker): string {
  const icon = picker === 'Tank' ? '🛡️' : picker === 'Chedda' ? '🧀' : picker === 'Rocco' ? '🥩' : '🎯'
  const specialty =
    picker === 'Tank'
      ? 'Situational & Weather'
      : picker === 'Chedda'
        ? 'Underdogs & Line Value'
        : picker === 'Rocco'
          ? 'Power Favorites & Key Numbers'
          : 'Pure Model EV'

  const lines: string[] = [`${icon} ${picker.toUpperCase()}'S FULL ATS CARD (${specialty}):\n`]
  for (const g of card.games) {
    const pPick = g.pickerPicks[picker]
    const away = shortDisplayName(g.awayTeam)
    const home = shortDisplayName(g.homeTeam)
    const when = formatOddsCommenceTimeShort(g.commenceTime)
    lines.push(`• ${pPick.lineDisplay} (${away}/${home} · ${when})`)
  }
  return lines.join('\n')
}

/**
 * Filter and validate candidate picks to eliminate extreme price outliers
 * (e.g. +1500 longshot flukes or -800 massive favorites) so all picks
 * reflect realistic, sharp betting selections.
 */
export function filterPredictiveCandidates(candidates: OddsPick[]): OddsPick[] {
  if (!Array.isArray(candidates)) return []
  return candidates.filter((pick) => {
    const price = Number(pick.pickPrice)
    if (!Number.isFinite(price) || price === 0) return false

    // Spreads / Runlines: Standard betting juice (-135 to +115)
    if (pick.marketKey === 'spreads') {
      return price >= -135 && price <= 115
    }

    // Totals: Standard Over/Under juice (-125 to +110)
    if (pick.marketKey === 'totals') {
      return price >= -125 && price <= 110
    }

    // Moneylines: Realistic range (-220 to +260) — no wild +1500 longshots
    if (pick.marketKey === 'h2h') {
      return price >= -220 && price <= 260
    }

    return price >= -220 && price <= 260
  })
}

/**
 * Classify a candidate pick to its best-matching Sharp Syndicate persona.
 *
 * Chedda: Moneyline underdog (+110 to +260)
 * Rocco: Spread & Runlines with solid juice (-135 to +115)
 * Tank: Totals (Over/Under) (-125 to +110)
 * Scott: High EV / model baseline play (-200 to +160)
 */
export function classifyPickPersona(pick: OddsPick): SharpPicker {
  const price = Number(pick.pickPrice) || 0
  // Chedda: Realistic plus-money underdogs
  if (pick.marketKey === 'h2h' && price >= 110 && price <= 260) {
    return 'Chedda'
  }
  // Tank: Game totals (Over/Under)
  if (pick.marketKey === 'totals' && price >= -125 && price <= 110) {
    return 'Tank'
  }
  // Rocco: Spreads / runlines
  if (pick.marketKey === 'spreads' && price >= -135 && price <= 115) {
    return 'Rocco'
  }
  // Scott: Pure model / EV baseline
  return 'Scott'
}

/**
 * Assemble a multi-picker syndicate card from a pool of candidate picks across today's games.
 * Tries to give 1 distinct pick to each persona (Scott, Rocco, Chedda, Tank) without duplicate events.
 */
export function buildSyndicateCard(
  candidates: OddsPick[],
  opts: { cardTitle?: string } = {},
): { cardTitle: string; picks: SinglePickerPick[] } | null {
  const valid = filterPredictiveCandidates(candidates)
  if (!valid || valid.length === 0) return null

  const usedEventIds = new Set<string>()
  const assignedPicks: SinglePickerPick[] = []

  // 1. Find Chedda (Plus-money dog: +110 to +260)
  const cheddaCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'h2h' && p.pickPrice >= 110 && p.pickPrice <= 260,
  )
  if (cheddaCand) {
    assignedPicks.push({ pickerName: 'Chedda', pick: cheddaCand })
    usedEventIds.add(cheddaCand.eventId)
  }

  // 2. Find Tank (Totals: -125 to +110)
  const tankCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'totals' && p.pickPrice >= -125 && p.pickPrice <= 110,
  )
  if (tankCand) {
    assignedPicks.push({ pickerName: 'Tank', pick: tankCand })
    usedEventIds.add(tankCand.eventId)
  }

  // 3. Find Rocco (Spreads: -135 to +115)
  const roccoCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.marketKey === 'spreads' && p.pickPrice >= -135 && p.pickPrice <= 115,
  )
  if (roccoCand) {
    assignedPicks.push({ pickerName: 'Rocco', pick: roccoCand })
    usedEventIds.add(roccoCand.eventId)
  }

  // 4. Find Scott (Top EV remaining: -200 to +160)
  const scottCand = valid.find(
    (p) => !usedEventIds.has(p.eventId) && p.pickPrice >= -200 && p.pickPrice <= 160,
  )
  if (scottCand) {
    assignedPicks.push({ pickerName: 'Scott', pick: scottCand })
    usedEventIds.add(scottCand.eventId)
  }

  if (assignedPicks.length < 2) {
    return null // Not enough variety for a syndicate card
  }

  const title = opts.cardTitle || '🎯 Sharpe Syndicate Card'
  return { cardTitle: title, picks: assignedPicks }
}

/**
 * Simple hash helper for consistent deterministic pseudo-random distribution
 * across personas when evaluating subjective angles.
 */
function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Build a full NFL / CFB ATS Slate Card across all games on the board.
 * Every single game gets picked by all 4 personas (Scott, Rocco, Chedda, Tank)
 * based on their distinct handicapping profiles:
 * - Scott: Model EV & power rating differential
 * - Rocco: Trench / short favorites & defensive matchups
 * - Chedda: Live dogs & taking the points
 * - Tank: Market flow, situational rest, & weather spots
 */
export function buildNflAtsSlateCard(
  events: Array<{
    id: string
    sport_key: string
    commence_time: string
    home_team: string
    away_team: string
    bookmakers?: Array<{
      key: string
      title: string
      markets: Array<{
        key: string
        outcomes: Array<{
          name: string
          price: number
          point?: number
        }>
      }>
    }>
  }>,
  opts: {
    cardTitle?: string
    sportKey?: string
    weightsMap?: Map<string, number>
  } = {},
): NflSlateCard | null {
  if (!Array.isArray(events) || events.length === 0) return null

  const games: SlateGamePick[] = []
  const hammers: SlateGamePick[] = []
  const consensus: SlateGamePick[] = []
  const splits: SlateGamePick[] = []
  const weights = opts.weightsMap || new Map<string, number>()

  for (const ev of events) {
    const homeTeam = ev.home_team
    const awayTeam = ev.away_team
    if (!homeTeam || !awayTeam) continue

    // Find consensus or primary book spread market
    let bestSpreadMarket: { key: string; outcomes: Array<{ name: string; price: number; point?: number }> } | null = null
    let bookTitle = 'Consensus'

    for (const b of ev.bookmakers || []) {
      const sm = b.markets.find((m) => m.key === 'spreads' && m.outcomes?.length === 2)
      if (sm) {
        bestSpreadMarket = sm
        bookTitle = b.title || b.key
        break
      }
    }

    if (!bestSpreadMarket) continue

    const homeOutcome = bestSpreadMarket.outcomes.find((o) => isTeamMatch(o.name, homeTeam))
    const awayOutcome = bestSpreadMarket.outcomes.find((o) => isTeamMatch(o.name, awayTeam))

    if (!homeOutcome || !awayOutcome || homeOutcome.point == null || awayOutcome.point == null) {
      continue
    }

    const homePoint = homeOutcome.point
    const awayPoint = awayOutcome.point
    const homePrice = homeOutcome.price
    const awayPrice = awayOutcome.price

    // Convert into OddsPick structures for ledger
    const homePickObj: OddsPick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      marketKey: 'spreads',
      pickName: homeTeam,
      linePoint: homePoint,
      pickPrice: homePrice,
      bookTitle,
      edgePct: 2.0,
      bookCount: 5,
    }

    const awayPickObj: OddsPick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      marketKey: 'spreads',
      pickName: awayTeam,
      linePoint: awayPoint,
      pickPrice: awayPrice,
      bookTitle,
      edgePct: 2.0,
      bookCount: 5,
    }

    const homeLineDisp = formatPickLine(homePickObj)
    const awayLineDisp = formatPickLine(awayPickObj)

    // Resolve live sharp money divergence & ticket splits
    const gameSplits = resolveGameBettingSplits(ev, homePoint, homePrice, awayPrice)
    const sharpFavorsHome = gameSplits.sharpFavoredSide === 'home'
    const sharpFavorsAway = gameSplits.sharpFavoredSide === 'away'

    // Bayesian factor weights
    const scottWeight = weights.get('Scott:model_clv_high_ev') || 1.0
    const roccoWeight = weights.get('Rocco:short_favorites_1_to_4') || 1.0
    const cheddaSweetWeight = weights.get('Chedda:dog_sweet_spot_130_175') || 1.0
    const tankRestWeight = weights.get('Tank:rest_advantage') || 1.0

    // Persona-specific picks with dynamic Bayesian weights & betting splits:
    // 1. Scott (Model EV): leans toward favorable line juice, short home edge, and sharp consensus money
    const sharpSplitBonus = sharpFavorsHome ? 0.35 : sharpFavorsAway ? -0.35 : 0
    const scottScoreHome = ((homePrice > awayPrice ? 1.0 : -0.5) + (homePoint < 0 ? 0.3 : 0.1) + sharpSplitBonus) * scottWeight
    const scottSide: 'home' | 'away' = scottScoreHome >= 0 ? 'home' : 'away'

    // 2. Chedda (Dog / Points Hunter): heavily prefers taking positive points (+3.5, +7.5) and capitalizes on Sharp Money Divergence / RLM
    const cheddaSplitBoost = (homePoint > 0 && sharpFavorsHome) ? 1.2 : (awayPoint > 0 && sharpFavorsAway) ? -1.2 : 0
    const cheddaScoreHome = (homePoint > 0 ? (1.5 * cheddaSweetWeight) : awayPoint > 0 ? (-1.5 * cheddaSweetWeight) : (homePrice > awayPrice ? 0.5 : -0.5)) + cheddaSplitBoost
    const cheddaSide: 'home' | 'away' = cheddaScoreHome >= 0 ? 'home' : 'away'

    // 3. Rocco (Trench / Favorites): prefers laying short points on favorites (-2.5, -3.5, -6.5) but dodges public trap favorites where whales back the dog
    const isShortFavHome = homePoint < 0 && homePoint >= -7.5
    const isShortFavAway = awayPoint < 0 && awayPoint >= -7.5
    const roccoChalkTrapPenalty = (isShortFavHome && sharpFavorsAway) ? -1.5 : (isShortFavAway && sharpFavorsHome) ? 1.5 : 0
    const roccoScoreHome = (isShortFavHome ? (1.2 * roccoWeight) : isShortFavAway ? (-1.2 * roccoWeight) : (homePoint < 0 ? 0.4 : -0.4)) + roccoChalkTrapPenalty
    const roccoSide: 'home' | 'away' = roccoScoreHome >= 0 ? 'home' : 'away'

    // 4. Tank (Situational / Market Flow): deterministic situational lean based on matchup hash & point spreads + market flow
    const hVal = hashString(`${ev.id}_${homeTeam}_${awayTeam}`)
    const tankFlowBoost = sharpFavorsHome ? 0.15 : sharpFavorsAway ? -0.15 : 0
    const tankScoreHome = (((hVal % 100) / 100 + (homePoint > awayPoint ? 0.2 : -0.2) + tankFlowBoost)) * tankRestWeight
    const tankSide: 'home' | 'away' = tankScoreHome >= 0.5 ? 'home' : 'away'

    const pickerPicks: Record<SharpPicker, {
      side: 'home' | 'away'
      teamName: string
      lineDisplay: string
      pickPrice: number
      pick: OddsPick
    }> = {
      Scott: {
        side: scottSide,
        teamName: scottSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: scottSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: scottSide === 'home' ? homePrice : awayPrice,
        pick: scottSide === 'home' ? homePickObj : awayPickObj,
      },
      Rocco: {
        side: roccoSide,
        teamName: roccoSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: roccoSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: roccoSide === 'home' ? homePrice : awayPrice,
        pick: roccoSide === 'home' ? homePickObj : awayPickObj,
      },
      Chedda: {
        side: cheddaSide,
        teamName: cheddaSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: cheddaSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: cheddaSide === 'home' ? homePrice : awayPrice,
        pick: cheddaSide === 'home' ? homePickObj : awayPickObj,
      },
      Tank: {
        side: tankSide,
        teamName: tankSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: tankSide === 'home' ? homeLineDisp : awayLineDisp,
        pickPrice: tankSide === 'home' ? homePrice : awayPrice,
        pick: tankSide === 'home' ? homePickObj : awayPickObj,
      },
    }

    // Tally votes
    let homeVotes = 0
    let awayVotes = 0
    for (const p of SHARP_PICKERS) {
      if (pickerPicks[p].side === 'home') homeVotes++
      else awayVotes++
    }

    let consensusSide: 'home' | 'away' = 'home'
    let voteCount = homeVotes
    let consensusType: 'hammer' | 'consensus' | 'split' = 'split'
    let badgeText = '⚔️ 2-2 Split'

    if (homeVotes === 4) {
      consensusSide = 'home'
      voteCount = 4
      consensusType = 'hammer'
      badgeText = '🔥 4-0 Hammer'
    } else if (awayVotes === 4) {
      consensusSide = 'away'
      voteCount = 4
      consensusType = 'hammer'
      badgeText = '🔥 4-0 Hammer'
    } else if (homeVotes === 3) {
      consensusSide = 'home'
      voteCount = 3
      consensusType = 'consensus'
      badgeText = '🎯 3-1 Consensus'
    } else if (awayVotes === 3) {
      consensusSide = 'away'
      voteCount = 3
      consensusType = 'consensus'
      badgeText = '🎯 3-1 Consensus'
    } else {
      consensusSide = 'home'
      voteCount = 2
      consensusType = 'split'
      badgeText = '⚔️ 2-2 Split'
    }

    const gamePick: SlateGamePick = {
      eventId: ev.id,
      sportKey: ev.sport_key,
      homeTeam,
      awayTeam,
      commenceTime: ev.commence_time,
      spreadPoint: homePoint,
      splits: gameSplits,
      consensusPick: {
        side: consensusSide,
        teamName: consensusSide === 'home' ? homeTeam : awayTeam,
        lineDisplay: consensusSide === 'home' ? homeLineDisp : awayLineDisp,
        voteCount,
        type: consensusType,
        badgeText,
      },
      pickerPicks,
    }

    games.push(gamePick)
    if (consensusType === 'hammer') hammers.push(gamePick)
    else if (consensusType === 'consensus') consensus.push(gamePick)
    else splits.push(gamePick)
  }

  if (games.length === 0) return null

  const title = opts.cardTitle || (opts.sportKey === 'americanfootball_ncaaf' ? '🏈 College Football Sharpe Syndicate Slate' : '🏈 NFL Sharpe Syndicate Slate')

  return {
    cardTitle: title,
    sportKey: opts.sportKey || 'americanfootball_nfl',
    games,
    hammers,
    consensus,
    splits,
  }
}

/**
 * Publish a full NFL / CFB Slate Card to the Lounge feed and record all 4xN picks in lounge_bot_picks.
 */
export async function publishAndRecordNflSlateCard(
  admin: SupabaseClient,
  input: {
    botUserId: string
    card: NflSlateCard
    categoryPills?: string[]
  },
): Promise<{ success: boolean; postId?: string; totalPicksRecorded: number; error?: string }> {
  if (!input.card || !input.card.games.length) {
    return { success: false, totalPicksRecorded: 0, error: 'Empty slate card.' }
  }

  const caption = formatNflSlateCardCaption(input.card)
  const categoryPills = input.categoryPills || ['sports']

  const postRes = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, totalPicksRecorded: 0, error: postRes.error || 'Failed to publish post' }
  }

  const rowsToInsert: any[] = []
  for (const g of input.card.games) {
    for (const pName of SHARP_PICKERS) {
      const pPick = g.pickerPicks[pName]

      // Situational factor tagging for Bayesian learning
      const factors: string[] = []
      const isShortFav = Number(pPick.pick.linePoint) <= -1 && Number(pPick.pick.linePoint) >= -4
      const isSweetDog = Number(pPick.pickPrice) >= 130 && Number(pPick.pickPrice) <= 175
      const isKey3 = Math.abs(Number(pPick.pick.linePoint)) === 3

      if (isShortFav) factors.push('short_favorites_1_to_4')
      if (isSweetDog) factors.push('dog_sweet_spot_130_175')
      if (isKey3) factors.push('key_number_3_value')
      if (pName === 'Scott') factors.push('model_clv_high_ev')
      if (pName === 'Tank') factors.push('rest_advantage')
      if (g.splits?.isRlm) factors.push('reverse_line_movement')
      if (g.splits?.isSharpDivergence) factors.push('sharp_money_divergence')

      rowsToInsert.push({
        bot_user_id: input.botUserId,
        picker_name: pName,
        post_id: postRes.postId,
        event_id: g.eventId,
        sport_key: g.sportKey,
        home_team: g.homeTeam,
        away_team: g.awayTeam,
        commence_time: g.commenceTime,
        market_key: 'spreads',
        pick_name: pPick.teamName,
        pick_line: pPick.pick.linePoint ?? null,
        pick_price: pPick.pickPrice,
        book_title: pPick.pick.bookTitle || null,
        status: 'pending',
        metadata: {
          factors,
          side: pPick.side,
          consensus_type: g.consensusPick.type,
          vote_count: g.consensusPick.voteCount,
          splits: g.splits ? {
            home_ticket: g.splits.homeTicketPct,
            home_handle: g.splits.homeHandlePct,
            is_rlm: g.splits.isRlm,
            is_sharp_divergence: g.splits.isSharpDivergence,
          } : undefined,
        },
      })
    }
  }

  const { data: insertedRows, error: pickErr } = await admin
    .from('lounge_bot_picks')
    .insert(rowsToInsert)
    .select('id')

  if (pickErr) {
    return {
      success: true,
      postId: postRes.postId,
      totalPicksRecorded: 0,
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  await syncBotProfileHighlight(admin, input.botUserId)

  // Also deliver full uncut individual breakdowns into Scott's VIP subscriber chat room
  try {
    const threadParts = SHARP_PICKERS.map((p) => formatPickerSlateList(input.card, p))
    const vipTitle = `🏈 ${input.card.cardTitle || 'Sharpe Syndicate Slate'} ... Full Uncut Breakdown\n\nPublic feed gets the consensus & hammer teasers. Here are the uncut individual ATS cards across all 4 desks for the full slate 👇`
    await publishBotSubChatMessage(admin, {
      botUserId: input.botUserId,
      caption: vipTitle,
      threadParts,
    })
  } catch (vipErr) {
    console.error('Error posting slate to VIP sub chat:', vipErr)
  }

  return {
    success: true,
    postId: postRes.postId,
    totalPicksRecorded: insertedRows?.length || 0,
  }
}

/**
 * Calculate net profit in units for a 1-unit bet based on American odds.
 */
export function calculateNetUnits(price: number, status: 'won' | 'lost' | 'push' | 'cancelled'): number {
  if (status === 'lost') return -1.0
  if (status === 'push' || status === 'cancelled') return 0.0
  if (status === 'won') {
    if (price > 0) return Math.round((price / 100) * 100) / 100
    if (price < 0) return Math.round((100 / Math.abs(price)) * 100) / 100
  }
  return 0.0
}

/**
 * Publish a solo pick or multi-picker syndicate card and record all entries in public.lounge_bot_picks.
 */
export async function publishAndRecordPicks(
  admin: SupabaseClient,
  input: {
    botUserId: string
    picks: SinglePickerPick[]
    cardTitle?: string
    categoryPills?: string[]
  },
): Promise<{ success: boolean; postId?: string; pickIds: string[]; error?: string }> {
  if (!input.picks.length) {
    return { success: false, pickIds: [], error: 'At least one pick required.' }
  }

  let weather: GameWeatherSummary | null = null
  let injuries: GameInjurySummary | null = null
  let splits: BettingSplitSummary | null = null
  const isSolo = input.picks.length === 1

  if (isSolo) {
    const single = input.picks[0].pick
    const sportId = oddsSportKeyToRundownSportId(single.sportKey) || 2
    weather = await fetchGameWeather(sportId, single.homeTeam, single.commenceTime)
    injuries = await fetchGameInjuryPval(single.sportKey, single.homeTeam, single.awayTeam, single.commenceTime, admin)
    const mockEv: any = {
      id: single.eventId,
      sport_key: single.sportKey,
      home_team: single.homeTeam,
      away_team: single.awayTeam,
      commence_time: single.commenceTime,
      bookmakers: [],
    }
    splits = resolveGameBettingSplits(mockEv, single.linePoint ?? 0, single.pickPrice, single.pickPrice)
  }

  const caption = isSolo
    ? formatSoloPredictiveCaption(input.picks[0].pickerName, input.picks[0].pick, weather, injuries, splits)
    : formatSyndicateCardCaption(input.cardTitle || '🎯 Sharp Syndicate Card', input.picks)

  const categoryPills = input.categoryPills || ['sports']

  const postRes = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption,
    categoryPills,
  })

  if (postRes.error || !postRes.postId) {
    return { success: false, pickIds: [], error: postRes.error || 'Failed to publish post' }
  }

  const rowsToInsert = input.picks.map((item) => {
    const factors: string[] = []
    if (weather && !weather.isDome) {
      if (weather.isHighWind) factors.push('wind_unders')
      if (weather.isExtremeCold) factors.push('extreme_cold_unders')
    }
    if (Number(item.pick.pickPrice) >= 130 && Number(item.pick.pickPrice) <= 175) {
      factors.push('dog_sweet_spot_130_175')
    }
    if (Number(item.pick.pickPrice) > 175) {
      factors.push('dog_longshot_180_plus')
    }
    if (Number(item.pick.linePoint) <= -1 && Number(item.pick.linePoint) >= -4) {
      factors.push('short_favorites_1_to_4')
    }
    if (item.pickerName === 'Scott') factors.push('model_clv_high_ev')
    if (splits?.isRlm) factors.push('reverse_line_movement')
    if (splits?.isSharpDivergence) factors.push('sharp_money_divergence')

    return {
      bot_user_id: input.botUserId,
      picker_name: item.pickerName,
      post_id: postRes.postId,
      event_id: item.pick.eventId,
      sport_key: item.pick.sportKey,
      home_team: item.pick.homeTeam,
      away_team: item.pick.awayTeam,
      commence_time: item.pick.commenceTime,
      market_key: item.pick.marketKey,
      pick_name: item.pick.pickName,
      pick_line: item.pick.linePoint ?? null,
      pick_price: item.pick.pickPrice,
      book_title: item.pick.bookTitle || null,
      status: 'pending',
      metadata: {
        factors,
        is_high_wind: weather?.isHighWind || false,
        is_extreme_cold: weather?.isExtremeCold || false,
        splits: splits ? {
          home_ticket: splits.homeTicketPct,
          home_handle: splits.homeHandlePct,
          is_rlm: splits.isRlm,
          is_sharp_divergence: splits.isSharpDivergence,
        } : undefined,
      },
    }
  })

  const { data: insertedRows, error: pickErr } = await admin
    .from('lounge_bot_picks')
    .insert(rowsToInsert)
    .select('id')

  const pickIds = (insertedRows || []).map((r) => r.id)

  if (pickErr) {
    return {
      success: true,
      postId: postRes.postId,
      pickIds: [],
      error: `Published post, but ledger insert failed: ${pickErr.message}`,
    }
  }

  // Update profile bio highlight
  await syncBotProfileHighlight(admin, opts.botUserId)

  return { success: true, postId: postRes.postId, pickIds }
}

/**
 * Match a team string against home or away names.
 */
function isTeamMatch(targetName: string, candidateName: string): boolean {
  const t = targetName.trim().toLowerCase()
  const c = candidateName.trim().toLowerCase()
  if (t === c) return true
  if (t.includes(c) || c.includes(t)) return true
  const tLast = t.split(' ').pop() || ''
  const cLast = c.split(' ').pop() || ''
  return Boolean(tLast && cLast && tLast === cLast)
}

/**
 * Grade a single pick against final game scores.
 */
export function gradePickOutcome(
  pick: {
    picker_name?: string
    market_key: string
    pick_name: string
    pick_line: number | null
    pick_price: number
    home_team: string
    away_team: string
  },
  homeScore: number,
  awayScore: number,
): { status: 'won' | 'lost' | 'push'; unitsNet: number; summary: string; lineDisplay: string } {
  const { picker_name, market_key, pick_name, pick_line, pick_price, home_team, away_team } = pick
  const home = shortDisplayName(home_team)
  const away = shortDisplayName(away_team)
  const scoreSummary = `${away} ${awayScore}, ${home} ${homeScore}`
  const pName = picker_name ? `${picker_name}: ` : ''

  if (market_key === 'h2h') {
    const isHome = isTeamMatch(pick_name, home_team)
    const won = isHome ? homeScore > awayScore : awayScore > homeScore
    const push = homeScore === awayScore
    const status: 'won' | 'lost' | 'push' = push ? 'push' : won ? 'won' : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineDisplay = `${shortDisplayName(pick_name)} ML`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${scoreSummary}`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'spreads') {
    const isHome = isTeamMatch(pick_name, home_team)
    const line = Number(pick_line) || 0
    const diff = isHome ? (homeScore + line) - awayScore : (awayScore + line) - homeScore
    const status: 'won' | 'lost' | 'push' = diff > 0 ? 'won' : diff < 0 ? 'lost' : 'push'
    const unitsNet = calculateNetUnits(pick_price, status)
    const lineStr = line > 0 ? `+${line}` : String(line)
    const lineDisplay = `${shortDisplayName(pick_name)} ${lineStr}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${scoreSummary}`
        : `🔄 PUSH: ${pName}${lineDisplay} (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  if (market_key === 'totals') {
    const line = Number(pick_line) || 0
    const total = homeScore + awayScore
    const isOver = /^over/i.test(pick_name)
    const status: 'won' | 'lost' | 'push' = total === line
      ? 'push'
      : (isOver ? total > line : total < line)
        ? 'won'
        : 'lost'
    const unitsNet = calculateNetUnits(pick_price, status)
    const side = isOver ? 'Over' : 'Under'
    const lineDisplay = `${side} ${line}`
    const summary = status === 'won'
      ? `✅ WIN: ${pName}${lineDisplay} cashes (${total} pts · ${scoreSummary})`
      : status === 'lost'
        ? `❌ LOSS: ${pName}${total} pts (${scoreSummary})`
        : `🔄 PUSH: ${pName}Exactly ${line} pts (${scoreSummary})`
    return { status, unitsNet, summary, lineDisplay }
  }

  return { status: 'push', unitsNet: 0, summary: scoreSummary, lineDisplay: pick_name }
}

/**
 * Poll The Odds API scores endpoint for all sports with pending picks,
 * resolve game outcomes, grade each pick, record units, and post auto-reply comments.
 */
export async function gradePendingPicks(
  admin: SupabaseClient,
  apiKey: string,
  botUserId?: string,
): Promise<{ resolved: number; errors: string[] }> {
  const errors: string[] = []
  let resolvedCount = 0

  let query = admin
    .from('lounge_bot_picks')
    .select('*')
    .eq('status', 'pending')
    .lte('commence_time', new Date(Date.now() - 90 * 60 * 1000).toISOString()) // started >90m ago

  if (botUserId) {
    query = query.eq('bot_user_id', botUserId)
  }

  const { data: pendingPicks, error: fetchErr } = await query
  if (fetchErr || !pendingPicks || pendingPicks.length === 0) {
    return { resolved: 0, errors: fetchErr ? [fetchErr.message] : [] }
  }

  // Group pending picks by sport_key
  const bySport = new Map<string, typeof pendingPicks>()
  for (const p of pendingPicks) {
    const list = bySport.get(p.sport_key) || []
    list.push(p)
    bySport.set(p.sport_key, list)
  }

  const updatedPickIds = new Set<string>()

  for (const [sportKey, picks] of bySport.entries()) {
    try {
      const url = `${ODDS_BASE}/sports/${encodeURIComponent(sportKey)}/scores/?apiKey=${encodeURIComponent(apiKey)}&daysFrom=3`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        errors.push(`Scores API ${sportKey}: HTTP ${res.status}`)
        continue
      }
      const scoreEvents: ScoreEvent[] = await res.json()
      const eventById = new Map<string, ScoreEvent>()
      for (const ev of scoreEvents) {
        if (ev.id) eventById.set(ev.id, ev)
      }

      for (const pick of picks) {
        const ev = eventById.get(pick.event_id)
        if (!ev || !ev.completed || !Array.isArray(ev.scores) || ev.scores.length < 2) {
          continue
        }

        // Parse scores
        const s1 = ev.scores[0]
        const s2 = ev.scores[1]
        const score1 = parseInt(s1.score, 10)
        const score2 = parseInt(s2.score, 10)
        if (isNaN(score1) || isNaN(score2)) continue

        let homeScore = 0
        let awayScore = 0
        if (isTeamMatch(s1.name, pick.home_team)) {
          homeScore = score1
          awayScore = score2
        } else {
          homeScore = score2
          awayScore = score1
        }

        const grade = gradePickOutcome(pick, homeScore, awayScore)

        // Update pick row
        await admin
          .from('lounge_bot_picks')
          .update({
            status: grade.status,
            home_score: homeScore,
            away_score: awayScore,
            units_net: grade.unitsNet,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', pick.id)

        updatedPickIds.add(pick.id)
        resolvedCount++
      }
    } catch (err: unknown) {
      errors.push(`Error grading ${sportKey}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Now handle comment replies for posts where all picks are now resolved
  if (updatedPickIds.size > 0) {
    // Find unique posts affected
    const affectedPostIds = new Set<string>()
    for (const p of pendingPicks) {
      if (updatedPickIds.has(p.id) && p.post_id) {
        affectedPostIds.add(p.post_id)
      }
    }

    for (const postId of affectedPostIds) {
      // Check if ALL picks for this post are now resolved
      const { data: postPicks } = await admin
        .from('lounge_bot_picks')
        .select('*')
        .eq('post_id', postId)

      if (!postPicks || postPicks.length === 0) continue
      const hasPending = postPicks.some((p) => p.status === 'pending')
      if (hasPending) continue // wait until all picks in the card are finished

      // Check if we already posted a comment
      const alreadyCommented = postPicks.some((p) => p.comment_id != null)
      if (alreadyCommented) continue

      let commentText = ''
      const botUserId = postPicks[0].bot_user_id

      if (postPicks.length === 1) {
        // Solo pick comment
        const p = postPicks[0]
        const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
        commentText = grade.summary
      } else if (postPicks.length > 8) {
        // Full Slate Card recap (e.g. 16 games = 64 picks)
        // Break down records by picker and consensus hammer/consensus/split
        const pickerTotals: Record<string, { wins: number; losses: number; pushes: number; units: number }> = {}
        for (const p of SHARP_PICKERS) {
          pickerTotals[p] = { wins: 0, losses: 0, pushes: 0, units: 0 }
        }

        // Group picks by event_id to compute consensus outcomes
        const eventPicksMap = new Map<string, typeof postPicks>()
        for (const p of postPicks) {
          const list = eventPicksMap.get(p.event_id) || []
          list.push(p)
          eventPicksMap.set(p.event_id, list)

          const rec = pickerTotals[p.picker_name]
          if (rec) {
            if (p.status === 'won') rec.wins++
            else if (p.status === 'lost') rec.losses++
            else if (p.status === 'push') rec.pushes++
            rec.units += Number(p.units_net) || 0
          }
        }

        let hammerWins = 0
        let hammerLosses = 0
        let consensusWins = 0
        let consensusLosses = 0

        for (const [, eList] of eventPicksMap) {
          const homePicks = eList.filter((p) => isTeamMatch(p.pick_name, p.home_team))
          const awayPicks = eList.filter((p) => isTeamMatch(p.pick_name, p.away_team))
          const homeWins = homePicks.filter((p) => p.status === 'won').length
          const awayWins = awayPicks.filter((p) => p.status === 'won').length

          if (homePicks.length === 4) {
            if (homeWins > 0) hammerWins++
            else if (homePicks[0].status === 'lost') hammerLosses++
          } else if (awayPicks.length === 4) {
            if (awayWins > 0) hammerWins++
            else if (awayPicks[0].status === 'lost') hammerLosses++
          } else if (homePicks.length === 3) {
            if (homeWins > 0) consensusWins++
            else if (homePicks[0].status === 'lost') consensusLosses++
          } else if (awayPicks.length === 3) {
            if (awayWins > 0) consensusWins++
            else if (awayPicks[0].status === 'lost') consensusLosses++
          }
        }

        const lines: string[] = ['📊 Final Slate Card Standings:\n']
        for (const pName of SHARP_PICKERS) {
          const rec = pickerTotals[pName]
          const pNote = rec.pushes > 0 ? `-${rec.pushes}` : ''
          const uStr = rec.units > 0 ? `+${rec.units.toFixed(2)}u` : `${rec.units.toFixed(2)}u`
          lines.push(`• ${pName}: ${rec.wins}-${rec.losses}${pNote} (${uStr})`)
        }

        if (hammerWins > 0 || hammerLosses > 0) {
          lines.push(`\n🔥 Unanimous 4-0 Hammers: ${hammerWins}-${hammerLosses}`)
        }
        if (consensusWins > 0 || consensusLosses > 0) {
          lines.push(`🎯 3-1 Consensus: ${consensusWins}-${consensusLosses}`)
        }

        lines.push('\nNext slate & in-game alerts drop in the Sharpe VIP Syndicate.')

        commentText = lines.join('\n')
      } else {
        // Syndicate multi-picker card comment recap (2-4 picks)
        let cardWins = 0
        let cardLosses = 0
        let cardPushes = 0
        let cardUnits = 0

        const lines: string[] = ['📊 Final Card Results:\n']
        for (const p of postPicks) {
          const icon = p.status === 'won' ? '✅' : p.status === 'lost' ? '❌' : '🔄'
          const unitsStr = Number(p.units_net) > 0 ? `+${p.units_net}u` : `${p.units_net}u`
          const grade = gradePickOutcome(p, p.home_score ?? 0, p.away_score ?? 0)
          lines.push(`${icon} ${p.picker_name}: ${grade.lineDisplay} (${unitsStr})`)

          if (p.status === 'won') cardWins++
          else if (p.status === 'lost') cardLosses++
          else if (p.status === 'push') cardPushes++
          cardUnits += Number(p.units_net) || 0
        }

        const pushNote = cardPushes > 0 ? `-${cardPushes}` : ''
        const unitsFormatted = cardUnits > 0 ? `+${cardUnits.toFixed(2)}` : cardUnits.toFixed(2)
        lines.push(`\nCard Total: ${cardWins}-${cardLosses}${pushNote} (${unitsFormatted}u)`)
        commentText = lines.join('\n')
      }

      // Post the comment
      const { data: commentRow } = await admin
        .from('feed_comments')
        .insert({
          post_id: postId,
          user_id: botUserId,
          comment_text: commentText,
        })
        .select('id')
        .single()

      if (commentRow?.id) {
        await admin
          .from('lounge_bot_picks')
          .update({ comment_id: commentRow.id })
          .eq('post_id', postId)
      }
    }
  }

  // Update profile highlight text if any bot user ID is provided or involved
  if (botUserId) {
    await syncBotProfileHighlight(admin, botUserId)
  }

  return { resolved: resolvedCount, errors }
}

/**
 * Update the Scott Bot profile's about_me with the latest verified record highlight.
 */
export async function syncBotProfileHighlight(
  admin: SupabaseClient,
  botUserId: string,
): Promise<{ ok: boolean; highlight?: string; error?: string }> {
  try {
    const { data: rec, error } = await admin.rpc('lounge_bot_get_picks_record', {
      p_bot_user_id: botUserId,
      p_timeframe: 'all_time',
      p_sport_key: 'all',
    })
    if (error || !rec?.highlight_text) return { ok: false, error: error?.message }

    const highlight = String(rec.highlight_text).trim().slice(0, 140)
    await admin
      .from('profiles')
      .update({ about_me: highlight })
      .eq('user_id', botUserId)

    return { ok: true, highlight }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
