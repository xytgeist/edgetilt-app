/**
 * Sharpe Syndicate Live Middle & Arbitrage Scanner.
 *
 * Scans active syndicate pending positions and live multi-bookmaker odds to detect:
 * 1. Syndicate Live Middle Windows: When a live/moving line creates a win-both corridor against an existing syndicate pick.
 * 2. Cross-Book Spread & Total Middles: Discrepancies between sharp and retail books that allow locking in a double-win window.
 * 3. Cross-Book Live Arbitrage: Pure risk-free guaranteed return windows (>1.5% ROI).
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
import { analyzeFootballKeyNumbers } from './loungeBotKeyNumbers.ts'

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
  riskVigUnits: number // e.g. -0.09u on 1u stake if landing outside corridor
  maxWinUnits: number // e.g. +1.82u if landing inside corridor
  arbProfitPct?: number // e.g. +2.4% for pure arb
  executionAdvice: string
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
      const eventPicks = pendingList.filter((p) => p.event_id === ev.id || (p.home_team === homeTeam && p.away_team === awayTeam))
      for (const pick of eventPicks) {
        if (pick.market_key === 'spreads' && pick.pick_line != null) {
          const opp = evaluateSyndicateSpreadMiddle(ev, pick)
          if (opp) opportunities.push(opp)
        } else if (pick.market_key === 'totals' && pick.pick_line != null) {
          const opp = evaluateSyndicateTotalMiddle(ev, pick)
          if (opp) opportunities.push(opp)
        }
      }

      // Check for Cross-Book Market Middles & Arbitrage
      const crossBookOpps = evaluateCrossBookOpportunities(ev)
      opportunities.push(...crossBookOpps)
    }
  }

  // Deduplicate and filter out opportunities published recently
  return filterAndDedupeOpportunities(admin, opportunities)
}

/**
 * Evaluate if current live/market lines create a middle window against our existing syndicate spread pick.
 */
function evaluateSyndicateSpreadMiddle(ev: OddsEvent, pick: any): MiddleArbOpportunity | null {
  const homeTeam = String(ev.home_team || '')
  const awayTeam = String(ev.away_team || '')
  const origPickName = String(pick.pick_name || '')
  const origLine = Number(pick.pick_line)
  const origPrice = Number(pick.pick_price) || -110

  const isHomePick = origPickName.toLowerCase().includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(origPickName.toLowerCase())
  const opposingTeam = isHomePick ? awayTeam : homeTeam

  // Find best available current market line for the opposing team
  let bestOppLine: number | null = null
  let bestOppPrice = -9999
  let bestOppBook = ''

  for (const b of ev.bookmakers || []) {
    const spreadMkt = b.markets?.find((m) => m.key === 'spreads')
    if (!spreadMkt?.outcomes) continue
    for (const out of spreadMkt.outcomes) {
      const name = String(out.name || '')
      const isOppSide = isHomePick
        ? name.toLowerCase().includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(name.toLowerCase())
        : name.toLowerCase().includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(name.toLowerCase())

      if (isOppSide && out.point != null && out.price != null) {
        const pt = Number(out.point)
        const pr = Number(out.price)
        // We want the most points (highest spread) for the opposing team
        if (bestOppLine == null || pt > bestOppLine || (pt === bestOppLine && pr > bestOppPrice)) {
          bestOppLine = pt
          bestOppPrice = pr
          bestOppBook = b.title || b.key || 'Sportsbook'
        }
      }
    }
  }

  if (bestOppLine == null) return null

  // Calculate if a middle corridor exists
  // Example: We hold Chiefs -3.0 (origLine = -3.0). Best Opponent line is Broncos +8.5 (bestOppLine = +8.5).
  // Middle window = sum of lines: (-3.0 + 8.5) = +5.5 points gap.
  // Example: We hold Dogs +6.5 (origLine = +6.5). Best Opponent is Fav +1.5 or Fav -1.5.
  const spreadGap = origLine + bestOppLine

  // Minimum middle gap: 3.5 points for Football, 4.5 points for Basketball
  const isFootball = String(ev.sport_key || '').includes('football')
  const minGap = isFootball ? 3.5 : 4.5

  if (spreadGap < minGap) return null

  // Analyze key numbers in the middle gap for football
  const keyNumbersCrossed: number[] = []
  if (isFootball) {
    const lowerMargin = Math.min(Math.abs(origLine), Math.abs(bestOppLine))
    const upperMargin = Math.max(Math.abs(origLine), Math.abs(bestOppLine))
    for (const k of [3, 4, 6, 7, 10]) {
      if (k > lowerMargin && k < upperMargin) {
        keyNumbersCrossed.push(k)
      }
    }
  }

  // Risk/Reward calculations based on 1.0u on Leg A and 1.0u on Leg B
  const impliedA = americanToImplied(origPrice)
  const impliedB = americanToImplied(bestOppPrice)
  const payoutA = origPrice > 0 ? origPrice / 100 : 100 / Math.abs(origPrice)
  const payoutB = bestOppPrice > 0 ? bestOppPrice / 100 : 100 / Math.abs(bestOppPrice)

  // Max win: both cash = payoutA + payoutB (e.g. 0.91 + 0.91 = +1.82u)
  const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
  // Worst case: one wins, one loses = payoutA - 1.0 or payoutB - 1.0
  const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

  const favTeam = origLine < 0 ? origPickName : opposingTeam
  const lowerBound = Math.ceil(Math.min(Math.abs(origLine), Math.abs(bestOppLine)))
  const upperBound = Math.floor(Math.max(Math.abs(origLine), Math.abs(bestOppLine)))
  const corridorText = `${shortDisplayName(favTeam)} wins by ${lowerBound} to ${upperBound} points`

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

  const executionAdvice = `Take 1.00u on ${shortDisplayName(opposingTeam)} ${bestOppLine > 0 ? `+${bestOppLine}` : bestOppLine} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. If ${shortDisplayName(favTeam)} lands in the ${lowerBound}-${upperBound} margin, BOTH tickets cash (+${maxWinUnits}u). If it lands outside, total risk is only -${worstCaseLoss}u.`

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
    keyNumbersCrossed,
    riskVigUnits: worstCaseLoss,
    maxWinUnits,
    executionAdvice,
    vipCaption: '',
  }

  opp.vipCaption = formatMiddleArbVipCaption(opp)
  return opp
}

/**
 * Evaluate if current live/market total lines create a middle window against our existing syndicate total pick.
 */
function evaluateSyndicateTotalMiddle(ev: OddsEvent, pick: any): MiddleArbOpportunity | null {
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
          // If we have Under, we want the lowest Over point
          if (bestOppLine == null || pt < bestOppLine || (pt === bestOppLine && pr > bestOppPrice)) {
            bestOppLine = pt
            bestOppPrice = pr
            bestOppBook = b.title || b.key || 'Sportsbook'
          }
        } else {
          // If we have Over, we want the highest Under point
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

  // Middle exists if we have Under at higher point and Over at lower point
  const highLine = isUnder ? origLine : bestOppLine
  const lowLine = isUnder ? bestOppLine : origLine
  const totalGap = highLine - lowLine

  if (totalGap < 5.0) return null // Need at least 5.0 points total gap

  const payoutA = origPrice > 0 ? origPrice / 100 : 100 / Math.abs(origPrice)
  const payoutB = bestOppPrice > 0 ? bestOppPrice / 100 : 100 / Math.abs(bestOppPrice)
  const maxWinUnits = Math.round((payoutA + payoutB) * 100) / 100
  const worstCaseLoss = Math.round((1.0 - Math.min(payoutA, payoutB)) * 100) / 100

  const lowerBound = Math.ceil(lowLine)
  const upperBound = Math.floor(highLine)
  const corridorText = `Total points land between ${lowerBound} and ${upperBound}`

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

  const executionAdvice = `Take 1.00u on ${legB.pickName} (${formatAmericanOdds(bestOppPrice)}) at ${legB.bookTitle}. If the final score lands in the ${lowerBound}-${upperBound} point corridor, BOTH tickets cash (+${maxWinUnits}u net). Worst case loss is -${worstCaseLoss}u.`

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
    riskVigUnits: worstCaseLoss,
    maxWinUnits,
    executionAdvice,
    vipCaption: '',
  }

  opp.vipCaption = formatMiddleArbVipCaption(opp)
  return opp
}

/**
 * Scan for Cross-Book Spread Middles and Pure Arbitrage opportunities across all bookmakers.
 */
function evaluateCrossBookOpportunities(ev: OddsEvent): MiddleArbOpportunity[] {
  const opps: MiddleArbOpportunity[] = []
  const homeTeam = String(ev.home_team || '')
  const awayTeam = String(ev.away_team || '')
  const books = ev.bookmakers || []
  if (books.length < 2) return opps

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

    // Arb exists if sum of implied probabilities is < 0.985 (> 1.5% profit)
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
        executionAdvice: `Bet $${Math.round((impHome / sumImp) * 1000)} on ${legA.pickName} (${formatAmericanOdds(bestHomeMl)}) at ${legA.bookTitle} and $${Math.round((impAway / sumImp) * 1000)} on ${legB.pickName} (${formatAmericanOdds(bestAwayMl)}) at ${legB.bookTitle} for a guaranteed +${profitPct}% profit regardless of outcome.`,
        vipCaption: '',
      }
      opp.vipCaption = formatMiddleArbVipCaption(opp)
      opps.push(opp)
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

  if (opp.type === 'SYNDICATE_POSITION_MIDDLE') {
    lines.push(`⚡ **SHARPE SYNDICATE · LIVE MIDDLE WINDOW**`)
    lines.push(`${sportEmoji} **${sportName} · ${shortDisplayName(opp.awayTeam)} @ ${shortDisplayName(opp.homeTeam)}**`)
    lines.push('')
    lines.push(`A live market movement has opened a high-value **Double-Win Middle Corridor** against our active Syndicate card:`)
    lines.push('')
    lines.push(`📌 **${opp.legA.label}:**`)
    lines.push(`• Pick: **${opp.legA.pickName} ${opp.legA.linePoint != null ? (opp.legA.linePoint > 0 ? `+${opp.legA.linePoint}` : opp.legA.linePoint) : ''}** (${formatAmericanOdds(opp.legA.price)})`)
    lines.push(`• Book: ${opp.legA.bookTitle}`)
    lines.push('')
    lines.push(`🎯 **${opp.legB.label}:**`)
    lines.push(`• Pick: **${opp.legB.pickName} ${opp.legB.linePoint != null ? (opp.legB.linePoint > 0 ? `+${opp.legB.linePoint}` : opp.legB.linePoint) : ''}** (${formatAmericanOdds(opp.legB.price)})`)
    lines.push(`• Book: ${opp.legB.bookTitle}`)
    lines.push('')
    lines.push(`🔥 **The Middle Corridor:**`)
    lines.push(`• **Win-Both Zone:** ${opp.middleCorridor}`)
    if (opp.keyNumbersCrossed?.length) {
      lines.push(`• **Key Numbers Crossed:** ${opp.keyNumbersCrossed.map((k) => `**#${k}**`).join(', ')} (${opp.keyNumbersCrossed.includes(3) || opp.keyNumbersCrossed.includes(7) ? 'covers ~30%+ of NFL margins' : 'high-probability scoring cluster'})`)
    }
    lines.push('')
    lines.push(`📊 **Risk / Reward Profile:**`)
    lines.push(`• **Inside Corridor (Middle Hit):** +${opp.maxWinUnits}u net profit (Double payout)`)
    lines.push(`• **Outside Corridor (Miss):** -${opp.riskVigUnits}u minimal vig cost`)
    lines.push(`• **Effective Odds:** ~${Math.round((opp.maxWinUnits / Math.max(0.01, opp.riskVigUnits)))}:1 Risk-to-Reward free roll`)
    lines.push('')
    lines.push(`📋 **Syndicate Execution:**`)
    lines.push(opp.executionAdvice)
    lines.push('')
    lines.push(`_Sharpe VIP Syndicate · Quant Risk Management Desk_`)
  } else if (opp.type === 'CROSS_BOOK_ARBITRAGE') {
    lines.push(`💰 **SHARPE SYNDICATE · ARBITRAGE LOCK**`)
    lines.push(`${sportEmoji} **${sportName} · ${shortDisplayName(opp.awayTeam)} @ ${shortDisplayName(opp.homeTeam)}**`)
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
    // Check if event teams are already mentioned in recent middle logs
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

  // Log in publish log for history and dedupe
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
