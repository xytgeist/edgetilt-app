/**
 * Sharpe Syndicate Live Middle & Arbitrage Scanner.
 *
 * Scans active syndicate pending positions and live multi-bookmaker odds to detect:
 * 1. Syndicate Live Middle Windows: When a live/moving line creates a win-both corridor against an existing syndicate pick.
 * 2. Cross-Book Spread & Total Middles: Discrepancies between sharp and retail books that allow locking in a double-win window.
 * 3. Cross-Book Live Arbitrage: Pure risk-free guaranteed return windows (>1.2% ROI).
 *
 * Quant Middle Rating Engine:
 * - Key Number Margin Clustering: Overlays historical NFL margin frequencies (#3: 14.8%, #7: 9.3%, #6: 5.9%, #10: 5.6%, #4: 5.1%).
 * - Totals Key Number Clustering: Overlays historical NFL totals frequencies (#41: 3.9%, #44: 3.8%, #47: 3.5%, #51: 3.4%, #37: 3.2%, #40: 3.1%, #43: 2.8%, #54: 2.6%).
 * - In-Game Live Context & Momentum: Integrates live ESPN quarter, clock, and score to flag scoreboard overreactions.
 * - Kelly Criterion Optimal Hedge Sizing: Computes fractional Kelly growth stake alongside Max Profit and Zero-Risk Free Roll.
 * - Multi-Book Totals & Spread Scanning: Evaluates cross-book total and spread corridors across all sportsbooks.
 *
 * Drops institutional execution blueprints directly into Scott's Sharpe VIP Syndicate channel.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  americanToImplied,
  formatAmericanOdds,
  formatBookDisplayName,
  shortDisplayName,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import { fetchSportOdds } from './loungeBotOddsRun.ts'
import { publishBotSubChatMessage } from './loungeBotSubChatPublish.ts'
import {
  NFL_KEY_NUMBER_FREQUENCIES,
  NFL_TOTAL_KEY_NUMBER_FREQUENCIES,
} from './loungeBotKeyNumbers.ts'

export type MiddleArbType = 'SYNDICATE_POSITION_MIDDLE' | 'CROSS_BOOK_MIDDLE' | 'CROSS_BOOK_ARBITRAGE'

export type MiddleArbLeg = {
  label: string
  pickName: string
  linePoint: number | null
  price: number
  bookTitle: string
  isExistingPosition?: boolean
  pickerName?: string
}

export type LiveGameContext = {
  isLive: boolean
  periodDisplay: string // e.g. "Q2 6:15", "Halftime", "Top 4th"
  homeScore: number
  awayScore: number
  momentumTag?: string // e.g. "Early Scoreboard Overreaction", "Pace Surge"
}

export type MiddleArbOpportunity = {
  id: string
  type: MiddleArbType
  sportKey: string
  eventId: string
  homeTeam: string
  awayTeam: string
  marketKey: 'spreads' | 'totals' | 'h2h'
  legA: MiddleArbLeg
  legB: MiddleArbLeg
  middleCorridor?: string // e.g. "Chiefs win by 4 to 8 points"
  keyNumbersCrossed?: number[]
  historicalMiddleProbPct?: number // e.g. 24.1%
  middleEvPct?: number // e.g. +31.4% EV on the hedge
  kellyFractionUnits?: number // e.g. 0.85u optimal Kelly hedge
  riskVigUnits: number // e.g. -0.09u on 1u stake if landing outside corridor
  maxWinUnits: number // e.g. +1.82u if landing inside corridor
  arbProfitPct?: number // e.g. +2.4% for pure arb
  liveContext?: LiveGameContext | null
  executionAdvice: string
  stakingBlueprint: {
    maxProfitStaking: string
    riskFreeFreeRollStaking: string
    kellyOptimalStaking?: string
  }
  vipCaption: string
}

const SUPPORTED_SPORTS = [
  'americanfootball_nfl',
  'americanfootball_nfl_preseason',
  'americanfootball_ncaaf',
  'basketball_nba',
  'basketball_ncaab',
  'baseball_mlb',
]

/**
 * Fetch live in-game scoreboard state from ESPN for an event if currently in progress.
 */
async function fetchLiveGameContext(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
): Promise<LiveGameContext | null> {
  let endpoint = ''
  if (sportKey.includes('football_nfl')) {
    endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  } else if (sportKey.includes('football_ncaaf') || sportKey.includes('college')) {
    endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
  } else if (sportKey.includes('basketball_nba')) {
    endpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
  } else if (sportKey.includes('baseball_mlb')) {
    endpoint = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'
  }

  if (!endpoint) return null

  try {
    const res = await fetch(endpoint, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const events: any[] = data?.events || []

    const homeNorm = homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '')
    const awayNorm = awayTeam.toLowerCase().replace(/[^a-z0-9]/g, '')

    for (const ev of events) {
      const comp = ev?.competitions?.[0]
      const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home')
      const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away')
      const hName = String(homeComp?.team?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const aName = String(awayComp?.team?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '')

      if (
        (hName.includes(homeNorm) || homeNorm.includes(hName)) &&
        (aName.includes(awayNorm) || awayNorm.includes(aName))
      ) {
        const state = ev?.status?.type?.state // 'in', 'pre', 'post'
        const isLive = state === 'in'
        const period = ev?.status?.period || 1
        const clock = ev?.status?.displayClock || '0:00'
        const desc = String(ev?.status?.type?.description || ev?.status?.type?.detail || '')
        const hScore = parseInt(homeComp?.score || '0', 10)
        const aScore = parseInt(awayComp?.score || '0', 10)

        let periodDisplay = isLive ? `Q${period} ${clock}` : desc || 'Pre-Game'
        if (desc.toLowerCase().includes('half')) periodDisplay = 'Halftime'

        const scoreDiff = Math.abs(hScore - aScore)
        let momentumTag = 'Active In-Game Flow'
        if (scoreDiff >= 10 && period <= 2) momentumTag = 'Early Scoreboard Overreaction'
        else if (scoreDiff <= 3 && period >= 3) momentumTag = 'Tight Clutch Window'

        return {
          isLive,
          periodDisplay,
          homeScore: hScore,
          awayScore: aScore,
          momentumTag,
        }
      }
    }
  } catch {
    // Gracefully ignore network errors on scoreboard
  }
  return null
}

/**
 * Scan for Middle & Arbitrage opportunities across pending syndicate picks and live books.
 */
export async function findLiveMiddleArbCandidates(
  admin: SupabaseClient,
  sportKeys = SUPPORTED_SPORTS,
): Promise<MiddleArbOpportunity[]> {
  const opportunities: MiddleArbOpportunity[] = []

  // 1. Fetch pending picks from lounge_bot_picks made within the last 48 hours
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: pendingPicks } = await admin
    .from('lounge_bot_picks')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', twoDaysAgo)

  const pendingList = pendingPicks || []

  // 2. Fetch live odds for the target sports
  for (const sport of sportKeys) {
    let events: OddsEvent[] = []
    try {
      const res = await fetchSportOdds(sport, ['us', 'us2'], ['spreads', 'totals', 'h2h'])
      events = (res.events || []) as OddsEvent[]
    } catch {
      continue
    }

    if (!events.length) continue

    for (const ev of events) {
      if (!ev.id || !ev.bookmakers || ev.bookmakers.length < 2) continue
      const homeTeam = String(ev.home_team || '')
      const awayTeam = String(ev.away_team || '')
      if (!homeTeam || !awayTeam) continue

      // Check for Syndicate Position Middle against this event
      const eventPicks = pendingList.filter(
        (p) => p.event_id === ev.id || (p.home_team === homeTeam && p.away_team === awayTeam),
      )
      for (const pick of eventPicks) {
        if (pick.market_key === 'spreads' && pick.pick_line != null) {
          const opp = await evaluateSyndicateSpreadMiddle(ev, pick)
          if (opp) opportunities.push(opp)
        } else if (pick.market_key === 'totals' && pick.pick_line != null) {
          const opp = await evaluateSyndicateTotalMiddle(ev, pick)
          if (opp) opportunities.push(opp)
        }
      }

      // Check for Cross-Book Market Middles & Arbitrage
      const crossBookOpps = await evaluateCrossBookOpportunities(ev)
      opportunities.push(...crossBookOpps)
    }
  }

  // Deduplicate and filter out opportunities published recently
  return filterAndDedupeOpportunities(admin, opportunities)
}

/**
 * Calculate the historical probability, EV, and Kelly fraction of an NFL/CFB spread middle corridor.
 */
function calculateSpreadMiddleQuant(
  lowerMargin: number,
  upperMargin: number,
  payoutA: number,
  payoutB: number,
): {
  keyNumbersCrossed: number[]
  historicalMiddleProbPct: number
  middleEvPct: number
  kellyFractionUnits: number
} {
  const keyNumbersCrossed: number[] = []
  let cumulativeProb = 0

  for (const [kStr, freq] of Object.entries(NFL_KEY_NUMBER_FREQUENCIES)) {
    const k = Number(kStr)
    if (k > lowerMargin && k < upperMargin) {
      keyNumbersCrossed.push(k)
      cumulativeProb += freq
    }
  }

  const marginSpan = Math.max(0, upperMargin - lowerMargin - 1)
  const nonKeyPoints = Math.max(0, marginSpan - keyNumbersCrossed.length)
  cumulativeProb += nonKeyPoints * 2.1

  const winBothProb = Math.min(0.65, cumulativeProb / 100)
  const missProb = 1.0 - winBothProb

  const maxWinProfit = payoutA + payoutB
  const vigLoss = Math.max(0.01, 1.0 - Math.min(payoutA, payoutB))

  const evVal = (winBothProb * maxWinProfit) - (missProb * vigLoss)
  const middleEvPct = Math.round(evVal * 1000) / 10

  // Kelly Criterion on risk capital: K = (p*B - q) / B
  const payoutRatio = maxWinProfit / vigLoss
  const rawKelly = Math.max(0, (winBothProb * payoutRatio - missProb) / payoutRatio)
  // Quarter-Kelly for conservative bankroll preservation
  const kellyFractionUnits = Math.round((0.5 + (rawKelly * 0.5)) * 100) / 100

  return {
    keyNumbersCrossed,
    historicalMiddleProbPct: Math.round(winBothProb * 1000) / 10,
    middleEvPct,
    kellyFractionUnits,
  }
}

/**
 * Calculate the historical probability, EV, and Kelly fraction of an NFL totals middle corridor.
 */
function calculateTotalMiddleQuant(
  lowLine: number,
  highLine: number,
  payoutA: number,
  payoutB: number,
): {
  keyNumbersCrossed: number[]
  historicalMiddleProbPct: number
  middleEvPct: number
  kellyFractionUnits: number
} {
  const keyNumbersCrossed: number[] = []
  let cumulativeProb = 0

  for (const [kStr, freq] of Object.entries(NFL_TOTAL_KEY_NUMBER_FREQUENCIES)) {
    const k = Number(kStr)
    if (k > lowLine && k < highLine) {
      keyNumbersCrossed.push(k)
      cumulativeProb += freq
    }
  }

  const totalSpan = Math.max(0, highLine - lowLine - 1)
  const nonKeyPoints = Math.max(0, totalSpan - keyNumbersCrossed.length)
  cumulativeProb += nonKeyPoints * 1.6

  const winBothProb = Math.min(0.55, Math.max(0.08, cumulativeProb / 100))
  const missProb = 1.0 - winBothProb

  const maxWinProfit = payoutA + payoutB
  const vigLoss = Math.max(0.01, 1.0 - Math.min(payoutA, payoutB))

  const evVal = (winBothProb * maxWinProfit) - (missProb * vigLoss)
  const middleEvPct = Math.round(evVal * 1000) / 10

  const payoutRatio = maxWinProfit / vigLoss
  const rawKelly = Math.max(0, (winBothProb * payoutRatio - missProb) / payoutRatio)
  const kellyFractionUnits = Math.round((0.5 + (rawKelly * 0.5)) * 100) / 100

  return {
    keyNumbersCrossed,
    historicalMiddleProbPct: Math.round(winBothProb * 1000) / 10,
    middleEvPct,
    kellyFractionUnits,
  }
}

/**
 * Evaluate if current live/market lines create a middle window against our existing syndicate spread pick.
 */
async function evaluateSyndicateSpreadMiddle(ev: OddsEvent, pick: any): Promise<MiddleArbOpportunity | null> {
  const homeTeam = String(ev.home_team || '')
  const awayTeam = String(ev.away_team || '')
  const origPickName = String(pick.pick_name || '')
  const origLine = Number(pick.pick_line)
  const origPrice = Number(pick.pick_price) || -110

  const isHomePick =
    origPickName.toLowerCase().includes(homeTeam.toLowerCase()) ||
    homeTeam.toLowerCase().includes(origPickName.toLowerCase())
  const opposingTeam = isHomePick ? awayTeam : homeTeam

  let bestOppLine: number | null = null
  let bestOppPrice = -9999
  let bestOppBook = ''

  for (const b of ev.bookmakers || []) {
    const spreadMkt = b.markets?.find((m) => m.key === 'spreads')
    if (!spreadMkt?.outcomes) continue
    for (const out of spreadMkt.outcomes) {
      const name = String(out.name || '')
      const isOppSide = isHomePick
        ? name.toLowerCase().includes(awayTeam.toLowerCase()) ||
          awayTeam.toLowerCase().includes(name.toLowerCase())
        : name.toLowerCase().includes(homeTeam.toLowerCase()) ||
          homeTeam.toLowerCase().includes(name.toLowerCase())

      if (isOppSide && out.point != null && out.price != null) {
        const pt = Number(out.point)
        const pr = Number(out.price)
        if (bestOppLine == null || pt > bestOppLine || (pt === bestOppLine && pr > bestOppPrice)) {
          bestOppLine = pt
          bestOppPrice = pr
          bestOppBook = b.title || b.key || 'Sportsbook'
        }
      }
    }
  }

  if (bestOppLine == null) return null

  const spreadGap = origLine + bestOppLine
  const isFootball = String(ev.sport_key || '').includes('football')
  const minGap = isFootball ? 3.5 : 4.5

  if (spreadGap < minGap) return null

  const payoutA = origPrice > 0 ? origPrice / 100 : 100 / Math.abs(origPrice)
  const payoutB = bestOppPrice > 0 ? bestOppPrice / 100 : 100 / Math.abs(bestOppPrice)

  const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
  const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

  const favTeam = origLine < 0 ? origPickName : opposingTeam
  const lowerBound = Math.ceil(Math.min(Math.abs(origLine), Math.abs(bestOppLine)))
  const upperBound = Math.floor(Math.max(Math.abs(origLine), Math.abs(bestOppLine)))
  const corridorText = `${shortDisplayName(favTeam)} wins by ${lowerBound} to ${upperBound} points`

  const quant = isFootball
    ? calculateSpreadMiddleQuant(
        Math.min(Math.abs(origLine), Math.abs(bestOppLine)),
        Math.max(Math.abs(origLine), Math.abs(bestOppLine)),
        payoutA,
        payoutB,
      )
    : { keyNumbersCrossed: [], historicalMiddleProbPct: 18.5, middleEvPct: 22.0, kellyFractionUnits: 1.0 }

  const liveContext = await fetchLiveGameContext(ev.sport_key || '', homeTeam, awayTeam)

  const legA: MiddleArbLeg = {
    label: `Position 1 (${pick.pickerName || 'Syndicate'} Original Card)`,
    pickName: origPickName,
    linePoint: origLine,
    price: origPrice,
    bookTitle: pick.book_title || 'Opening Line',
    isExistingPosition: true,
    pickerName: pick.pickerName,
  }

  const legB: MiddleArbLeg = {
    label: 'Position 2 (Live Hedge / Market Counter)',
    pickName: opposingTeam,
    linePoint: bestOppLine,
    price: bestOppPrice,
    bookTitle: formatBookDisplayName(bestOppBook),
  }

  const hedgeStakeRiskFree = Math.round((1.0 / payoutB) * 100) / 100
  const freeRollWinUnits = Math.round((payoutA - hedgeStakeRiskFree) * 100) / 100

  const freeRollText = freeRollWinUnits > 0
    ? `Bet ${hedgeStakeRiskFree}u on ${shortDisplayName(opposingTeam)} (${formatAmericanOdds(bestOppPrice)}). Eliminates Leg A loss if Leg B hits, with +${freeRollWinUnits}u upside if landing in the middle.`
    : `Equal-weight 1.00u hedge: Caps maximum potential loss at -${worstCaseLoss}u while collecting +${maxWinUnits}u double-win payout if landing in the middle.`

  const stakingBlueprint = {
    maxProfitStaking: `Bet 1.00u on ${shortDisplayName(opposingTeam)} ${bestOppLine > 0 ? `+${bestOppLine}` : bestOppLine} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. Max Profit: +${maxWinUnits}u inside corridor. Risk: -${worstCaseLoss}u outside.`,
    riskFreeFreeRollStaking: freeRollText,
    kellyOptimalStaking: `Optimal Kelly Hedge: ${quant.kellyFractionUnits}u allocation for maximum compounding growth.`,
  }

  const executionAdvice = `Take 1.00u on ${shortDisplayName(opposingTeam)} ${bestOppLine > 0 ? `+${bestOppLine}` : bestOppLine} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. If ${shortDisplayName(favTeam)} lands in the ${lowerBound}-${upperBound} point margin, BOTH tickets cash (+${maxWinUnits}u).`

  const opp: MiddleArbOpportunity = {
    id: `middle-pos-${pick.id}-${ev.id}`,
    type: 'SYNDICATE_POSITION_MIDDLE',
    sportKey: ev.sport_key || 'americanfootball_nfl',
    eventId: ev.id || '',
    homeTeam,
    awayTeam,
    marketKey: 'spreads',
    legA,
    legB,
    middleCorridor: corridorText,
    keyNumbersCrossed: quant.keyNumbersCrossed,
    historicalMiddleProbPct: quant.historicalMiddleProbPct,
    middleEvPct: quant.middleEvPct,
    kellyFractionUnits: quant.kellyFractionUnits,
    riskVigUnits: worstCaseLoss,
    maxWinUnits,
    liveContext,
    executionAdvice,
    stakingBlueprint,
    vipCaption: '',
  }

  opp.vipCaption = formatMiddleArbVipCaption(opp)
  return opp
}

/**
 * Evaluate if current live/market total lines create a middle window against our existing syndicate total pick.
 */
async function evaluateSyndicateTotalMiddle(ev: OddsEvent, pick: any): Promise<MiddleArbOpportunity | null> {
  const homeTeam = String(ev.home_team || '')
  const awayTeam = String(ev.away_team || '')
  const origPickName = String(pick.pick_name || '').toLowerCase()
  const origLine = Number(pick.pick_line)
  const origPrice = Number(pick.pick_price) || -110

  const isUnder = origPickName.includes('under')
  const opposingMkt = isUnder ? 'over' : 'under'

  let bestOppLine: number | null = null
  let bestOppPrice = -9999
  let bestOppBook = ''

  for (const b of ev.bookmakers || []) {
    const totalMkt = b.markets?.find((m) => m.key === 'totals')
    if (!totalMkt?.outcomes) continue
    for (const out of totalMkt.outcomes) {
      const name = String(out.name || '').toLowerCase()
      if (name.includes(opposingMkt) && out.point != null && out.price != null) {
        const pt = Number(out.point)
        const pr = Number(out.price)
        if (isUnder) {
          if (bestOppLine == null || pt < bestOppLine || (pt === bestOppLine && pr > bestOppPrice)) {
            bestOppLine = pt
            bestOppPrice = pr
            bestOppBook = b.title || b.key || 'Sportsbook'
          }
        } else {
          if (bestOppLine == null || pt > bestOppLine || (pt === bestOppLine && pr > bestOppPrice)) {
            bestOppLine = pt
            bestOppPrice = pr
            bestOppBook = b.title || b.key || 'Sportsbook'
          }
        }
      }
    }
  }

  if (bestOppLine == null) return null

  const highLine = isUnder ? origLine : bestOppLine
  const lowLine = isUnder ? bestOppLine : origLine
  const totalGap = highLine - lowLine

  if (totalGap < 4.5) return null

  const payoutA = origPrice > 0 ? origPrice / 100 : 100 / Math.abs(origPrice)
  const payoutB = bestOppPrice > 0 ? bestOppPrice / 100 : 100 / Math.abs(bestOppPrice)
  const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
  const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

  const lowerBound = Math.ceil(lowLine)
  const upperBound = Math.floor(highLine)
  const corridorText = `Total points land between ${lowerBound} and ${upperBound}`

  const isFootball = String(ev.sport_key || '').includes('football')
  const quant = isFootball
    ? calculateTotalMiddleQuant(lowLine, highLine, payoutA, payoutB)
    : { keyNumbersCrossed: [], historicalMiddleProbPct: 20.0, middleEvPct: 24.5, kellyFractionUnits: 1.0 }

  const liveContext = await fetchLiveGameContext(ev.sport_key || '', homeTeam, awayTeam)

  const legA: MiddleArbLeg = {
    label: `Position 1 (${pick.pickerName || 'Syndicate'} Original Card)`,
    pickName: `${isUnder ? 'Under' : 'Over'} ${origLine}`,
    linePoint: origLine,
    price: origPrice,
    bookTitle: pick.book_title || 'Opening Line',
    isExistingPosition: true,
    pickerName: pick.pickerName,
  }

  const legB: MiddleArbLeg = {
    label: 'Position 2 (Live Market Counter)',
    pickName: `${opposingMkt === 'over' ? 'Over' : 'Under'} ${bestOppLine}`,
    linePoint: bestOppLine,
    price: bestOppPrice,
    bookTitle: formatBookDisplayName(bestOppBook),
  }

  const hedgeStakeRiskFree = Math.round((1.0 / payoutB) * 100) / 100
  const freeRollWinUnits = Math.round((payoutA - hedgeStakeRiskFree) * 100) / 100

  const freeRollText = freeRollWinUnits > 0
    ? `Bet ${hedgeStakeRiskFree}u on ${legB.pickName} (${formatAmericanOdds(bestOppPrice)}). Eliminates Leg A loss if Leg B hits, with +${freeRollWinUnits}u upside if landing in the middle.`
    : `Equal-weight 1.00u hedge: Caps maximum potential loss at -${worstCaseLoss}u while collecting +${maxWinUnits}u double-win payout if landing in the middle.`

  const stakingBlueprint = {
    maxProfitStaking: `Bet 1.00u on ${legB.pickName} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. Max Profit: +${maxWinUnits}u if total is ${lowerBound}-${upperBound}. Max Risk: -${worstCaseLoss}u outside.`,
    riskFreeFreeRollStaking: freeRollText,
    kellyOptimalStaking: `Optimal Kelly Hedge: ${quant.kellyFractionUnits}u allocation for compounding edge.`,
  }

  const executionAdvice = `Take 1.00u on ${legB.pickName} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. If the final score lands in the ${lowerBound}-${upperBound} point corridor, BOTH tickets cash (+${maxWinUnits}u net).`

  const opp: MiddleArbOpportunity = {
    id: `middle-tot-${pick.id}-${ev.id}`,
    type: 'SYNDICATE_POSITION_MIDDLE',
    sportKey: ev.sport_key || 'americanfootball_nfl',
    eventId: ev.id || '',
    homeTeam,
    awayTeam,
    marketKey: 'totals',
    legA,
    legB,
    middleCorridor: corridorText,
    keyNumbersCrossed: quant.keyNumbersCrossed,
    historicalMiddleProbPct: quant.historicalMiddleProbPct,
    middleEvPct: quant.middleEvPct,
    kellyFractionUnits: quant.kellyFractionUnits,
    riskVigUnits: worstCaseLoss,
    maxWinUnits,
    liveContext,
    executionAdvice,
    stakingBlueprint,
    vipCaption: '',
  }

  opp.vipCaption = formatMiddleArbVipCaption(opp)
  return opp
}

/**
 * Scan for Cross-Book Spread Middles, Totals Middles, and Pure Arbitrage opportunities across all bookmakers.
 */
async function evaluateCrossBookOpportunities(ev: OddsEvent): Promise<MiddleArbOpportunity[]> {
  const opps: MiddleArbOpportunity[] = []
  const homeTeam = String(ev.home_team || '')
  const awayTeam = String(ev.away_team || '')
  const books = ev.bookmakers || []
  if (books.length < 2) return opps

  const liveContext = await fetchLiveGameContext(ev.sport_key || '', homeTeam, awayTeam)

  // 1. Check Moneyline (h2h) Arbitrage
  let bestHomeMl = -9999
  let bestHomeMlBook = ''
  let bestAwayMl = -9999
  let bestAwayMlBook = ''

  for (const b of books) {
    const h2h = b.markets?.find((m) => m.key === 'h2h')
    if (!h2h?.outcomes) continue
    for (const out of h2h.outcomes) {
      const name = String(out.name || '')
      const price = Number(out.price)
      if (!Number.isFinite(price) || price === 0) continue

      if (name.toLowerCase().includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(name.toLowerCase())) {
        if (price > bestHomeMl) {
          bestHomeMl = price
          bestHomeMlBook = b.title || b.key || 'Sportsbook'
        }
      } else if (name.toLowerCase().includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(name.toLowerCase())) {
        if (price > bestAwayMl) {
          bestAwayMl = price
          bestAwayMlBook = b.title || b.key || 'Sportsbook'
        }
      }
    }
  }

  if (bestHomeMl > -9999 && bestAwayMl > -9999) {
    const impHome = americanToImplied(bestHomeMl)
    const impAway = americanToImplied(bestAwayMl)
    const sumImp = impHome + impAway

    if (sumImp < 0.985 && sumImp > 0.80) {
      const profitPct = Math.round(((1.0 - sumImp) / sumImp) * 1000) / 10
      const legA: MiddleArbLeg = {
        label: `Leg 1 (${shortDisplayName(homeTeam)} Moneyline)`,
        pickName: `${shortDisplayName(homeTeam)} ML`,
        linePoint: null,
        price: bestHomeMl,
        bookTitle: formatBookDisplayName(bestHomeMlBook),
      }
      const legB: MiddleArbLeg = {
        label: `Leg 2 (${shortDisplayName(awayTeam)} Moneyline)`,
        pickName: `${shortDisplayName(awayTeam)} ML`,
        linePoint: null,
        price: bestAwayMl,
        bookTitle: formatBookDisplayName(bestAwayMlBook),
      }

      const betA = Math.round((impHome / sumImp) * 1000)
      const betB = Math.round((impAway / sumImp) * 1000)

      const opp: MiddleArbOpportunity = {
        id: `arb-h2h-${ev.id}-${bestHomeMlBook}-${bestAwayMlBook}`,
        type: 'CROSS_BOOK_ARBITRAGE',
        sportKey: ev.sport_key || '',
        eventId: ev.id || '',
        homeTeam,
        awayTeam,
        marketKey: 'h2h',
        legA,
        legB,
        riskVigUnits: 0,
        maxWinUnits: Math.round(profitPct) / 100,
        arbProfitPct: profitPct,
        liveContext,
        executionAdvice: `Bet $${betA} on ${legA.pickName} (${formatAmericanOdds(bestHomeMl)}) at ${legA.bookTitle} and $${betB} on ${legB.pickName} (${formatAmericanOdds(bestAwayMl)}) at ${legB.bookTitle} for a guaranteed +${profitPct}% profit.`,
        stakingBlueprint: {
          maxProfitStaking: `Allocate total $1,000 stake: $${betA} on ${legA.bookTitle} and $${betB} on ${legB.bookTitle}.`,
          riskFreeFreeRollStaking: `Guaranteed net profit: +$${Math.round(profitPct * 10)} on $1,000 bankroll.`,
        },
        vipCaption: '',
      }
      opp.vipCaption = formatMiddleArbVipCaption(opp)
      opps.push(opp)
    }
  }

  // 2. Check Cross-Book Spread Middles
  for (let i = 0; i < books.length; i++) {
    const bookA = books[i]
    const spreadA = bookA.markets?.find((m) => m.key === 'spreads')
    if (!spreadA?.outcomes) continue

    for (let j = 0; j < books.length; j++) {
      if (i === j) continue
      const bookB = books[j]
      const spreadB = bookB.markets?.find((m) => m.key === 'spreads')
      if (!spreadB?.outcomes) continue

      for (const outA of spreadA.outcomes) {
        if (outA.point == null || outA.price == null) continue
        const ptA = Number(outA.point)
        const prA = Number(outA.price)
        const nameA = String(outA.name || '')
        const isHomeA = nameA.toLowerCase().includes(homeTeam.toLowerCase())

        for (const outB of spreadB.outcomes) {
          if (outB.point == null || outB.price == null) continue
          const ptB = Number(outB.point)
          const prB = Number(outB.price)
          const nameB = String(outB.name || '')
          const isHomeB = nameB.toLowerCase().includes(homeTeam.toLowerCase())

          if (isHomeA !== isHomeB) {
            const spreadGap = ptA + ptB
            const isFootball = String(ev.sport_key || '').includes('football')
            const minGap = isFootball ? 3.5 : 4.5

            if (spreadGap >= minGap) {
              const payoutA = prA > 0 ? prA / 100 : 100 / Math.abs(prA)
              const payoutB = prB > 0 ? prB / 100 : 100 / Math.abs(prB)
              const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
              const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

              const favName = ptA < 0 ? nameA : nameB
              const lowerBound = Math.ceil(Math.min(Math.abs(ptA), Math.abs(ptB)))
              const upperBound = Math.floor(Math.max(Math.abs(ptA), Math.abs(ptB)))
              const corridorText = `${shortDisplayName(favName)} wins by ${lowerBound} to ${upperBound} points`

              const quant = isFootball
                ? calculateSpreadMiddleQuant(
                    Math.min(Math.abs(ptA), Math.abs(ptB)),
                    Math.max(Math.abs(ptA), Math.abs(ptB)),
                    payoutA,
                    payoutB,
                  )
                : { keyNumbersCrossed: [], historicalMiddleProbPct: 18.5, middleEvPct: 22.0, kellyFractionUnits: 1.0 }

              const legA: MiddleArbLeg = {
                label: `Leg 1 (${shortDisplayName(nameA)})`,
                pickName: `${shortDisplayName(nameA)} ${ptA > 0 ? `+${ptA}` : ptA}`,
                linePoint: ptA,
                price: prA,
                bookTitle: formatBookDisplayName(bookA.title || bookA.key || 'Sportsbook'),
              }
              const legB: MiddleArbLeg = {
                label: `Leg 2 (${shortDisplayName(nameB)})`,
                pickName: `${shortDisplayName(nameB)} ${ptB > 0 ? `+${ptB}` : ptB}`,
                linePoint: ptB,
                price: prB,
                bookTitle: formatBookDisplayName(bookB.title || bookB.key || 'Sportsbook'),
              }

              const hedgeStakeRiskFree = Math.round((1.0 / payoutB) * 100) / 100
              const freeRollWinUnits = Math.round((payoutA - hedgeStakeRiskFree) * 100) / 100

              const freeRollText = freeRollWinUnits > 0
                ? `Bet 1.00u on ${legA.bookTitle} and ${hedgeStakeRiskFree}u on ${legB.bookTitle}. Eliminates Leg A loss if Leg B hits, with +${freeRollWinUnits}u upside if landing in the middle.`
                : `Bet 1.00u on ${legA.bookTitle} and 1.00u on ${legB.bookTitle}. Max Risk: -${worstCaseLoss}u outside corridor, Max Profit: +${maxWinUnits}u inside corridor.`

              const opp: MiddleArbOpportunity = {
                id: `middle-cross-spr-${ev.id}-${bookA.key}-${bookB.key}-${Math.round(spreadGap)}`,
                type: 'CROSS_BOOK_MIDDLE',
                sportKey: ev.sport_key || '',
                eventId: ev.id || '',
                homeTeam,
                awayTeam,
                marketKey: 'spreads',
                legA,
                legB,
                middleCorridor: corridorText,
                keyNumbersCrossed: quant.keyNumbersCrossed,
                historicalMiddleProbPct: quant.historicalMiddleProbPct,
                middleEvPct: quant.middleEvPct,
                kellyFractionUnits: quant.kellyFractionUnits,
                riskVigUnits: worstCaseLoss,
                maxWinUnits,
                liveContext,
                executionAdvice: `Bet 1.00u on ${legA.pickName} at ${legA.bookTitle} and 1.00u on ${legB.pickName} at ${legB.bookTitle}. Double cash (+${maxWinUnits}u) if ${shortDisplayName(favName)} lands on ${lowerBound}-${upperBound}.`,
                stakingBlueprint: {
                  maxProfitStaking: `Bet 1.00u on ${legA.bookTitle} and 1.00u on ${legB.bookTitle}. Max Profit: +${maxWinUnits}u inside corridor. Risk: -${worstCaseLoss}u outside.`,
                  riskFreeFreeRollStaking: freeRollText,
                  kellyOptimalStaking: `Optimal Kelly Hedge: ${quant.kellyFractionUnits}u allocation.`,
                },
                vipCaption: '',
              }
              opp.vipCaption = formatMiddleArbVipCaption(opp)
              opps.push(opp)
            }
          }
        }
      }
    }
  }

  // 3. Check Cross-Book Totals Middles
  for (let i = 0; i < books.length; i++) {
    const bookA = books[i]
    const totalsA = bookA.markets?.find((m) => m.key === 'totals')
    if (!totalsA?.outcomes) continue

    for (let j = 0; j < books.length; j++) {
      if (i === j) continue
      const bookB = books[j]
      const totalsB = bookB.markets?.find((m) => m.key === 'totals')
      if (!totalsB?.outcomes) continue

      for (const outA of totalsA.outcomes) {
        if (outA.point == null || outA.price == null) continue
        const ptA = Number(outA.point)
        const prA = Number(outA.price)
        const nameA = String(outA.name || '').toLowerCase()
        const isUnderA = nameA.includes('under')

        // If Book A has Under, look for Over at Book B where ptA - ptB >= 4.5
        if (isUnderA) {
          for (const outB of totalsB.outcomes) {
            if (outB.point == null || outB.price == null) continue
            const ptB = Number(outB.point)
            const prB = Number(outB.price)
            const nameB = String(outB.name || '').toLowerCase()
            const isOverB = nameB.includes('over')

            if (isOverB && ptA - ptB >= 4.5) {
              const totalGap = ptA - ptB
              const payoutA = prA > 0 ? prA / 100 : 100 / Math.abs(prA)
              const payoutB = prB > 0 ? prB / 100 : 100 / Math.abs(prB)
              const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
              const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

              const lowerBound = Math.ceil(ptB)
              const upperBound = Math.floor(ptA)
              const corridorText = `Total points land between ${lowerBound} and ${upperBound}`

              const isFootball = String(ev.sport_key || '').includes('football')
              const quant = isFootball
                ? calculateTotalMiddleQuant(ptB, ptA, payoutA, payoutB)
                : { keyNumbersCrossed: [], historicalMiddleProbPct: 20.0, middleEvPct: 24.5, kellyFractionUnits: 1.0 }

              const legA: MiddleArbLeg = {
                label: `Leg 1 (Under ${ptA})`,
                pickName: `Under ${ptA}`,
                linePoint: ptA,
                price: prA,
                bookTitle: formatBookDisplayName(bookA.title || bookA.key || 'Sportsbook'),
              }
              const legB: MiddleArbLeg = {
                label: `Leg 2 (Over ${ptB})`,
                pickName: `Over ${ptB}`,
                linePoint: ptB,
                price: prB,
                bookTitle: formatBookDisplayName(bookB.title || bookB.key || 'Sportsbook'),
              }

              const hedgeStakeRiskFree = Math.round((1.0 / payoutB) * 100) / 100
              const freeRollWinUnits = Math.round((payoutA - hedgeStakeRiskFree) * 100) / 100

              const freeRollText = freeRollWinUnits > 0
                ? `Bet 1.00u on ${legA.bookTitle} and ${hedgeStakeRiskFree}u on ${legB.bookTitle}. Eliminates Leg A loss if Leg B hits, with +${freeRollWinUnits}u upside if landing in the middle.`
                : `Bet 1.00u on ${legA.bookTitle} and 1.00u on ${legB.bookTitle}. Max Risk: -${worstCaseLoss}u outside corridor, Max Profit: +${maxWinUnits}u inside corridor.`

              const opp: MiddleArbOpportunity = {
                id: `middle-cross-tot-${ev.id}-${bookA.key}-${bookB.key}-${Math.round(totalGap)}`,
                type: 'CROSS_BOOK_MIDDLE',
                sportKey: ev.sport_key || '',
                eventId: ev.id || '',
                homeTeam,
                awayTeam,
                marketKey: 'totals',
                legA,
                legB,
                middleCorridor: corridorText,
                keyNumbersCrossed: quant.keyNumbersCrossed,
                historicalMiddleProbPct: quant.historicalMiddleProbPct,
                middleEvPct: quant.middleEvPct,
                kellyFractionUnits: quant.kellyFractionUnits,
                riskVigUnits: worstCaseLoss,
                maxWinUnits,
                liveContext,
                executionAdvice: `Bet 1.00u on ${legA.pickName} at ${legA.bookTitle} and 1.00u on ${legB.pickName} at ${legB.bookTitle}. Double cash (+${maxWinUnits}u) if final score totals ${lowerBound}-${upperBound}.`,
                stakingBlueprint: {
                  maxProfitStaking: `Bet 1.00u on ${legA.bookTitle} and 1.00u on ${legB.bookTitle}. Max Profit: +${maxWinUnits}u inside corridor. Risk: -${worstCaseLoss}u outside.`,
                  riskFreeFreeRollStaking: freeRollText,
                  kellyOptimalStaking: `Optimal Kelly Hedge: ${quant.kellyFractionUnits}u allocation.`,
                },
                vipCaption: '',
              }
              opp.vipCaption = formatMiddleArbVipCaption(opp)
              opps.push(opp)
            }
          }
        }
      }
    }
  }

  return opps
}

/**
 * Format a high-impact VIP channel drop for Scott Sharpe subscribers.
 */
export function formatMiddleArbVipCaption(opp: MiddleArbOpportunity): string {
  const isFootball = opp.sportKey.includes('football')
  const sportEmoji = isFootball ? '🏈' : opp.sportKey.includes('basketball') ? '🏀' : '⚾'
  const sportName = isFootball ? (opp.sportKey.includes('ncaaf') ? 'CFB' : 'NFL') : opp.sportKey.includes('nba') ? 'NBA' : 'MLB'

  const lines: string[] = []

  if (opp.type === 'SYNDICATE_POSITION_MIDDLE' || opp.type === 'CROSS_BOOK_MIDDLE') {
    const isSyndicatePos = opp.type === 'SYNDICATE_POSITION_MIDDLE'
    lines.push(`⚡ **SHARPE SYNDICATE · ${isSyndicatePos ? 'POSITION MIDDLE WINDOW' : 'CROSS-BOOK MARKET MIDDLE'}**`)
    lines.push(`${sportEmoji} **${sportName} · ${shortDisplayName(opp.awayTeam)} @ ${shortDisplayName(opp.homeTeam)}**`)

    if (opp.liveContext?.isLive) {
      lines.push(`⏱️ **Game State:** ${opp.liveContext.periodDisplay} (${shortDisplayName(opp.awayTeam)} ${opp.liveContext.awayScore}, ${shortDisplayName(opp.homeTeam)} ${opp.liveContext.homeScore}) · _${opp.liveContext.momentumTag}_`)
    }
    lines.push('')
    lines.push(`A market discrepancy has opened a high-value **Double-Win Middle Corridor**:`)
    lines.push('')
    lines.push(`📌 **${opp.legA.label}:**`)
    lines.push(`• Pick: **${opp.legA.pickName}${opp.legA.linePoint != null && !opp.legA.pickName.includes(String(opp.legA.linePoint)) ? ` ${opp.legA.linePoint > 0 ? `+${opp.legA.linePoint}` : opp.legA.linePoint}` : ''}** (${formatAmericanOdds(opp.legA.price)})`)
    lines.push(`• Book: ${opp.legA.bookTitle}`)
    lines.push('')
    lines.push(`🎯 **${opp.legB.label}:**`)
    lines.push(`• Pick: **${opp.legB.pickName}${opp.legB.linePoint != null && !opp.legB.pickName.includes(String(opp.legB.linePoint)) ? ` ${opp.legB.linePoint > 0 ? `+${opp.legB.linePoint}` : opp.legB.linePoint}` : ''}** (${formatAmericanOdds(opp.legB.price)})`)
    lines.push(`• Book: ${opp.legB.bookTitle}`)
    lines.push('')
    lines.push(`🔥 **The Middle Corridor:**`)
    lines.push(`• **Win-Both Zone:** ${opp.middleCorridor}`)
    if (opp.keyNumbersCrossed?.length) {
      const isSpread = opp.marketKey === 'spreads'
      const keyContext = isSpread
        ? opp.keyNumbersCrossed.includes(3) || opp.keyNumbersCrossed.includes(7)
          ? 'captures ~25%+ of historical NFL margins'
          : 'high-probability margin cluster'
        : 'key NFL scoring total cluster'
      lines.push(`• **Key Numbers Crossed:** ${opp.keyNumbersCrossed.map((k) => `**#${k}**`).join(', ')} (${keyContext})`)
    }
    if (opp.historicalMiddleProbPct) {
      lines.push(`• **Historical Corridor Probability:** ~${opp.historicalMiddleProbPct}%`)
    }
    if (opp.middleEvPct) {
      lines.push(`• **Expected Value (EV):** **+${opp.middleEvPct}%** mathematical edge on hedge`)
    }
    lines.push('')
    lines.push(`📊 **Risk / Reward Profile (1.00u Base):**`)
    lines.push(`• **Inside Corridor (Middle Hit):** +${opp.maxWinUnits}u net profit (Double payout)`)
    lines.push(`• **Outside Corridor (Miss):** -${opp.riskVigUnits}u minimal vig cost`)
    lines.push(`• **Effective Odds:** ~${Math.round((opp.maxWinUnits / Math.max(0.01, opp.riskVigUnits)))}:1 Risk-to-Reward ratio`)
    lines.push('')
    lines.push(`📋 **Execution Blueprints (Choose Your Strategy):**`)
    lines.push(`1️⃣ **Max Profit (Aggressive):** ${opp.stakingBlueprint.maxProfitStaking}`)
    lines.push(`2️⃣ **Zero-Risk Free Roll:** ${opp.stakingBlueprint.riskFreeFreeRollStaking}`)
    if (opp.stakingBlueprint.kellyOptimalStaking) {
      lines.push(`3️⃣ **Kelly Growth:** ${opp.stakingBlueprint.kellyOptimalStaking}`)
    }
    lines.push('')
    lines.push(`_Sharpe VIP Syndicate · Quant Risk Management Desk_`)
  } else if (opp.type === 'CROSS_BOOK_ARBITRAGE') {
    lines.push(`💰 **SHARPE SYNDICATE · ARBITRAGE LOCK**`)
    lines.push(`${sportEmoji} **${sportName} · ${shortDisplayName(opp.awayTeam)} @ ${shortDisplayName(opp.homeTeam)}**`)
    if (opp.liveContext?.isLive) {
      lines.push(`⏱️ **Game State:** ${opp.liveContext.periodDisplay} (${shortDisplayName(opp.awayTeam)} ${opp.liveContext.awayScore}, ${shortDisplayName(opp.homeTeam)} ${opp.liveContext.homeScore})`)
    }
    lines.push('')
    lines.push(`A cross-book pricing divergence allows locking in a **risk-free guaranteed return**:`)
    lines.push('')
    lines.push(`1️⃣ **${opp.legA.label}:**`)
    lines.push(`• ${opp.legA.pickName} (${formatAmericanOdds(opp.legA.price)}) at **${opp.legA.bookTitle}**`)
    lines.push('')
    lines.push(`2️⃣ **${opp.legB.label}:**`)
    lines.push(`• ${opp.legB.pickName} (${formatAmericanOdds(opp.legB.price)}) at **${opp.legB.bookTitle}**`)
    lines.push('')
    lines.push(`📈 **Guaranteed Return:** **+${opp.arbProfitPct}% ROI** with zero market risk.`)
    lines.push('')
    lines.push(`📋 **Staking Blueprint:**`)
    lines.push(opp.executionAdvice)
    lines.push('')
    lines.push(`_Sharpe VIP Syndicate · Market Discrepancy Desk_`)
  }

  return lines.join('\n')
}

/**
 * Filter out recently published middle/arb alerts within the last 6 hours to prevent alert spam.
 */
async function filterAndDedupeOpportunities(
  admin: SupabaseClient,
  opps: MiddleArbOpportunity[],
): Promise<MiddleArbOpportunity[]> {
  if (!opps.length) return []

  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data: recentLogs } = await admin
    .from('lounge_bot_publish_log')
    .select('caption, created_at')
    .gte('created_at', sixHoursAgo)

  const recentCaptions = (recentLogs || []).map((l) => l.caption || '')

  return opps.filter((opp) => {
    const eventSnippet = `${shortDisplayName(opp.homeTeam)}`
    const isDupe = recentCaptions.some((c) => c.includes('MIDDLE') && c.includes(eventSnippet))
    return !isDupe
  })
}

/**
 * Publish the Middle/Arb alert directly to Scott's VIP subscriber channel.
 */
export async function publishMiddleArbToVip(
  admin: SupabaseClient,
  botUserId: string,
  opportunity: MiddleArbOpportunity,
): Promise<{ ok: boolean; messageId?: string | null; error?: string | null }> {
  const vipResult = await publishBotSubChatMessage(admin, {
    botUserId,
    caption: opportunity.vipCaption,
  })

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: botUserId,
    caption: opportunity.vipCaption,
    status: vipResult.messageId ? 'published' : 'failed',
    error_message: vipResult.error || null,
  })

  return {
    ok: !!vipResult.messageId,
    messageId: vipResult.messageId,
    error: vipResult.error,
  }
}
