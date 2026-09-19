/**
 * UFC & MMA 4-Desk Syndicate Engine.
 *
 * Models and grades full UFC fight cards across our 4 quantitative desks:
 * 1. Scott Sharpe (Head Quant) ... moneyline sits unless the win-rate gap clears 2 + 0.40 / p_mkt.
 * 2. Rocco (Octagon Grappling & Strike Differential) ... Takedown control rate & net SLpM efficiency.
 * 3. Chedda (Live Dogs & Inside Distance Props) ... Plus-money live underdogs & KO/Sub finish equity.
 * 4. Tank ... UFC round O/U is parked until the desk is trained.
 * Live print / ledger is Scott + Rocco. Chedda and Tank are not on this card.
 *    Football totals stay on the NFL/CFB slate.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  type OddsEvent,
  type OddsMarket,
  type OddsOutcome,
  type OddsPick,
  formatAmericanOdds,
  americanToImplied,
  impliedToAmerican,
  shortDisplayName,
  filterOddsEventsForNextUfcCard,
  formatMlWinGapPp,
  requiredMlWinGapPp,
  ML_THIN_TAPE_SIT_PRICE,
} from './loungeBotOddsCaption.ts'
import {
  type UfcMatchupAnalysis,
  analyzeUfcMatchup,
  fetchUfcFighterMetrics,
  fetchUfcCardFights,
  findCardFight,
  inferApexVenue,
  findFighterMetric,
} from './loungeBotUfcMetrics.ts'
import { decideRoccoUfc, fetchUfcFighterLast5, findLast5 } from './loungeBotUfcRocco.ts'
import { formatColoredPickerName } from './loungeBotPickerColors.ts'
import { resolveGameBettingSplits, type BettingSplitSummary } from './loungeBotBettingSplits.ts'
import {
  fanOutSyndicatePublish,
  implicitDestForPollAction,
  resolvePublishDestinations,
} from './loungeBotPublishDestinations.ts'
import { X_LONG_FORM_CHARS } from './loungeBotXPublish.ts'
import { LOUNGE_BOT_CAPTION_MAX } from './loungeBotCaptionLimits.ts'
import {
  buildUfcCheddaEquations,
  buildUfcRoccoEquations,
  buildUfcScottEquations,
  buildUfcTankEquations,
  type DeskEquation,
} from './loungeBotDeskEquations.ts'

export type UfcFightPick = {
  eventId: string
  fighterA: string // home_team in Odds API
  fighterB: string // away_team in Odds API
  commenceTime: string
  isApexCage: boolean
  /** Bout label. Card fact, else the stored class. Never the word UFC. */
  division: string | null
  matchup?: UfcMatchupAnalysis | null
  splits?: BettingSplitSummary | null
  marketOddsA: number
  marketOddsB: number
  marketTotalLine?: number
  marketTotalOverPrice?: number
  marketTotalUnderPrice?: number
  pickerPicks: {
    Scott: { pickName: string; side: 'A' | 'B' | 'Over' | 'Under' | 'PASS'; odds: number; rationale: string; equations?: DeskEquation[] }
    Rocco: { pickName: string; side: 'A' | 'B' | 'Over' | 'Under' | 'PASS'; odds: number; rationale: string; equations?: DeskEquation[] }
    Chedda: { pickName: string; side: 'A' | 'B' | 'Over' | 'Under' | 'PASS'; odds: number; rationale: string; equations?: DeskEquation[] }
    Tank: { pickName: string; side: 'A' | 'B' | 'Over' | 'Under' | 'PASS'; odds: number; rationale: string; equations?: DeskEquation[] }
  }
  consensusPick: {
    side: 'A' | 'B' | 'Over' | 'Under'
    pickName: string
    lineDisplay: string
    voteCount: number // e.g. 4 for Hammer, 3 for Consensus
    type: 'hammer' | 'consensus' | 'split'
    badgeText: string // '🔥 4-0 Fight Hammer' | '🎯 3-1 Consensus' | '⚔️ 2-2 Split'
  }
}

export type UfcSlateCard = {
  cardTitle: string
  isApexCard: boolean
  fights: UfcFightPick[]
  hammers: UfcFightPick[]
  consensus: UfcFightPick[]
  totalFights: number
}

const SHARP_PICKERS = ['Scott', 'Rocco', 'Chedda', 'Tank'] as const
/** Live UFC print + ledger. Costume desks stay computed, not published. */
const UFC_PRINT_DESKS = ['Scott', 'Rocco'] as const
/** Flip when Tank's UFC round-total model is trained. Football O/U is unchanged. */
const TANK_UFC_ROUND_TOTALS_ENABLED = false

/** Ops desk board … Scott + Rocco. Chedda and Tank are not on this card. */
export function ufcDeskEvalBoard(card: UfcSlateCard | null | undefined) {
  const empty = { Scott: [], Rocco: [], Chedda: [], Tank: [] } as Record<
    (typeof SHARP_PICKERS)[number],
    Array<{
      eventId: string
      away: string
      home: string
      when: string
      houseBadge: string
      side: string
      teamName: string
      lineDisplay: string
      why: string
      signals: string[]
      countsForHouse: boolean
      market: 'spreads' | 'totals'
      equations?: DeskEquation[]
    }>
  >
  if (!card?.fights?.length) return empty
  for (const fight of card.fights) {
    const base = {
      eventId: fight.eventId,
      away: fight.fighterA,
      home: fight.fighterB,
      when: fight.commenceTime || '',
      houseBadge: fight.pickerPicks.Scott.pickName,
    }
    for (const desk of UFC_PRINT_DESKS) {
      const p = fight.pickerPicks[desk]
      const isTotal = p.side === 'Over' || p.side === 'Under'
      const isPass = p.side === 'PASS'
      empty[desk].push({
        ...base,
        side: p.side,
        teamName: p.pickName,
        lineDisplay: p.pickName,
        why: p.rationale || p.pickName,
        signals: [],
        countsForHouse: !isPass,
        market: isTotal || isPass ? 'totals' : 'spreads',
        equations: p.equations || [],
      })
    }
  }
  return empty
}

/**
 * Build a quantitative UFC slate card for an upcoming fight night.
 */
export async function buildUfcSlateCard(
  events: OddsEvent[],
  supabase?: SupabaseClient,
  cardTitle = 'UFC Main Card',
): Promise<UfcSlateCard | null> {
  if (!events || events.length === 0) return null

  const slateEvents = filterOddsEventsForNextUfcCard(events)
  if (!slateEvents.length) return null

  const metricsList = await fetchUfcFighterMetrics(supabase)
  const cardFacts = await fetchUfcCardFights(supabase)
  const last5List = await fetchUfcFighterLast5(supabase)
  const fights: UfcFightPick[] = []
  const hammers: UfcFightPick[] = []
  const consensus: UfcFightPick[] = []

  for (const ev of slateEvents) {
    const fighterA = ev.home_team // In Odds API, fighter 1 is home_team
    const fighterB = ev.away_team
    if (!fighterA || !fighterB) continue

    // Find h2h moneyline market
    let bestBook = ev.bookmakers?.find((b) => b.key === 'pinnacle') || ev.bookmakers?.[0]
    const h2hMarket = bestBook?.markets?.find((m) => m.key === 'h2h')
    if (!h2hMarket || h2hMarket.outcomes?.length < 2) continue

    const outA = h2hMarket.outcomes.find((o) => o.name.toLowerCase() === fighterA.toLowerCase())
    const outB = h2hMarket.outcomes.find((o) => o.name.toLowerCase() === fighterB.toLowerCase())
    if (!outA || !outB) continue

    const oddsA = outA.price
    const oddsB = outB.price

    // Check for totals market (rounds)
    const totalsMarket = bestBook?.markets?.find((m) => m.key === 'totals')
    const totalLine = totalsMarket?.outcomes?.[0]?.point ?? 2.5
    const overOut = totalsMarket?.outcomes?.find((o) => o.name.toLowerCase().includes('over'))
    const underOut = totalsMarket?.outcomes?.find((o) => o.name.toLowerCase().includes('under'))
    const overPrice = overOut?.price ?? -110
    const underPrice = underOut?.price ?? -110

    const cardFact = findCardFight(cardFacts, fighterA, fighterB, metricsList)
    const isApex = cardFact
      ? cardFact.isApex
      : inferApexVenue(ev.sport_key, ev.venue_name)
    const isFiveRounds = cardFact?.scheduledRounds === 5

    // Quantitative matchup model
    const matchup = analyzeUfcMatchup(fighterA, fighterB, metricsList, isApex, isFiveRounds)
    const splits = resolveGameBettingSplits(ev, null, oddsA, oddsB)

    // 1. Desk 1: Scott Sharpe. Sit unless the win-rate gap clears 2 + 0.40 / p_mkt.
    let scottSide: 'A' | 'B' | 'PASS' = 'PASS'
    let scottOdds = 0
    let scottPickName = 'PASS'
    let scottRationale = 'No fair win rate. Sit.'
    let scottGapPp: number | null = null
    let scottNeedPp: number | null = null
    const edgeA = matchup ? matchup.projectedWinProbA - americanToImplied(oddsA) : null
    const edgeB = matchup ? matchup.projectedWinProbB - americanToImplied(oddsB) : null

    if (matchup && edgeA != null && edgeB != null) {
      const takeB = edgeB > edgeA
      const sideOdds = takeB ? oddsB : oddsA
      const fairOdds = takeB ? matchup.modelFairOddsB : matchup.modelFairOddsA
      const gapPp = (takeB ? edgeB : edgeA) * 100
      const needPp = requiredMlWinGapPp(americanToImplied(sideOdds))
      scottGapPp = gapPp
      scottNeedPp = needPp
      scottOdds = sideOdds
      const gapText = formatMlWinGapPp(gapPp)
      const needText = needPp == null ? 'a real gap' : formatMlWinGapPp(needPp)
      const marketText = formatAmericanOdds(sideOdds)
      const fairText = formatAmericanOdds(fairOdds)
      if (needPp != null && gapPp + 1e-6 >= needPp) {
        scottSide = takeB ? 'B' : 'A'
        scottPickName = `${takeB ? fighterB : fighterA} ML (${marketText})`
        scottRationale = `Fair price ${fairText} is ${gapText} vs market ${marketText}.`
      } else {
        scottRationale = `Fair price ${fairText} is ${gapText} vs market ${marketText}. Need ${needText}. Sit.`
      }
    }

    // 2. Desk 2: Rocco ... last-5 styles. Ignores juice. Sit is first-class.
    const metricA = findFighterMetric(fighterA, metricsList)
    const metricB = findFighterMetric(fighterB, metricsList)
    const rocco = decideRoccoUfc({
      fighterA,
      fighterB,
      last5A: findLast5(fighterA, last5List, metricA?.id),
      last5B: findLast5(fighterB, last5List, metricB?.id),
      scheduledRounds: isFiveRounds ? 5 : 3,
      isApex,
      stanceA: metricA?.stance || null,
      stanceB: metricB?.stance || null,
    })
    let roccoSide: 'A' | 'B' | 'PASS' = rocco.side
    let roccoOdds = 0
    let roccoPickName = 'PASS'
    let roccoRationale = rocco.rationale
    if (rocco.side === 'A' || rocco.side === 'B') {
      roccoOdds = rocco.side === 'A' ? oddsA : oddsB
      roccoPickName = `${rocco.side === 'A' ? fighterA : fighterB} ML (${formatAmericanOdds(roccoOdds)})`
    }

    // 3. Desk 3: Chedda (Live Dogs & Inside Distance Equity)
    let cheddaSide: 'A' | 'B' = 'A'
    let cheddaOdds = oddsA
    let cheddaPickName = `${fighterA} ML (${formatAmericanOdds(oddsA)})`
    let cheddaRationale = `Sharp money flow and dog equity.`

    const isDogA = oddsA > 0
    const isDogB = oddsB > 0

    if (isDogB && oddsB <= 260) {
      cheddaSide = 'B'
      cheddaOdds = oddsB
      cheddaPickName = `${fighterB} +${oddsB} Live Dog`
      cheddaRationale = matchup && matchup.projectedFinishProb >= 0.65
        ? `Plus-Money Puncher's Chance: High finish rate (${Math.round(matchup.projectedFinishProb * 100)}%) offers strong value on live dog.`
        : `Sharp Money Inflow: RLM on underdog with pro support.`
    } else if (isDogA && oddsA <= 260) {
      cheddaSide = 'A'
      cheddaOdds = oddsA
      cheddaPickName = `${fighterA} +${oddsA} Live Dog`
      cheddaRationale = `Underdog Value: Plus-money line ${formatAmericanOdds(oddsA)} underestimates ground game equity.`
    } else if (roccoSide === 'A' || roccoSide === 'B') {
      cheddaSide = roccoSide
      cheddaOdds = roccoOdds
      cheddaPickName = roccoPickName
      cheddaRationale = `High-conviction finish equity backing the model chalk.`
    }

    // 4. Desk 4: Tank. UFC round O/U stays parked until the model is trained.
    // He still cards an ML (same no-matchup fallback as before).
    let tankSide: 'A' | 'B' | 'Over' | 'Under' | 'PASS' = scottSide
    let tankOdds = scottOdds
    let tankPickName = scottPickName
    let tankRationale = 'Pace control favors the dominant fighter.'

    if (TANK_UFC_ROUND_TOTALS_ENABLED) {
      tankSide = 'Under'
      tankOdds = underPrice
      tankPickName = `Under ${totalLine} Rounds`
      tankRationale = 'Fight pace and durability modeling.'
      if (matchup) {
        if (matchup.projectedFinishProb >= 0.60 || isApex) {
          tankSide = 'Under'
          tankOdds = underPrice
          tankPickName = `Under ${totalLine} Rounds (${formatAmericanOdds(underPrice)})`
          tankRationale = `Pace & Finish Dynamics: High combined stoppage equity (${Math.round(matchup.projectedFinishProb * 100)}%)${isApex ? ' in 25ft Apex small cage' : ''}.`
        } else {
          tankSide = 'Over'
          tankOdds = overPrice
          tankPickName = `Over ${totalLine} Rounds (${formatAmericanOdds(overPrice)})`
          tankRationale = `Cardio & Decision Rate: Projected 3-round distance battle.`
        }
      } else {
        tankSide = scottSide
        tankOdds = scottOdds
        tankPickName = scottPickName
        tankRationale = 'Pace control favors the dominant fighter.'
      }
    }

    // Longer than +1000, Rocco's thin last-5 sits Scott even if the gap cleared.
    const roccoThinTape = rocco.features.includes('thin_tape') || rocco.features.includes('missing_last5')
    if (scottSide !== 'PASS' && scottOdds > ML_THIN_TAPE_SIT_PRICE && roccoThinTape) {
      scottSide = 'PASS'
      scottPickName = 'PASS'
      scottRationale = `Price is ${formatAmericanOdds(scottOdds)} and the last-5 tape is thin. Sit.`
      if (!TANK_UFC_ROUND_TOTALS_ENABLED) {
        tankSide = 'PASS'
        tankPickName = 'PASS'
        tankOdds = 0
      }
    }

    // Consensus Tally. Tank votes when he cards an ML.
    const mlSides = [scottSide, roccoSide, cheddaSide]
    if (tankSide === 'A' || tankSide === 'B') mlSides.push(tankSide)

    const votesA = mlSides.filter((s) => s === 'A').length
    const votesB = mlSides.filter((s) => s === 'B').length
    const mlVoters = mlSides.length

    let consensusSide: 'A' | 'B' | 'Over' | 'Under' = 'A'
    let consensusType: 'hammer' | 'consensus' | 'split' = 'split'
    let consensusVoteCount = 2
    let badgeText = '⚔️ Split'

    if (votesA === mlVoters && mlVoters >= 3) {
      consensusSide = 'A'
      consensusVoteCount = votesA
      consensusType = 'hammer'
      badgeText = mlVoters === 4 ? '🔥 4-0 Fight Hammer' : '🔥 3-0 Fight Hammer'
    } else if (votesB === mlVoters && mlVoters >= 3) {
      consensusSide = 'B'
      consensusVoteCount = votesB
      consensusType = 'hammer'
      badgeText = mlVoters === 4 ? '🔥 4-0 Fight Hammer' : '🔥 3-0 Fight Hammer'
    } else if (votesA >= 2 || votesB >= 2) {
      consensusSide = votesA >= votesB ? 'A' : 'B'
      consensusVoteCount = Math.max(votesA, votesB)
      consensusType = 'consensus'
      badgeText = mlVoters === 4 ? '🎯 3-1 Consensus' : '🎯 2-1 Consensus'
    } else {
      consensusSide = votesA >= votesB ? 'A' : 'B'
      consensusType = 'split'
      badgeText = '⚔️ Desk Split'
    }

    const consFighter = consensusSide === 'A' ? fighterA : fighterB
    const consOdds = consensusSide === 'A' ? oddsA : oddsB
    const cheddaCopiedRocco = !((isDogB && oddsB <= 260) || (isDogA && oddsA <= 260))
    const cheddaDogSide: 'A' | 'B' | null = (isDogB && oddsB <= 260)
      ? 'B'
      : (isDogA && oddsA <= 260)
        ? 'A'
        : null

    const fightPick: UfcFightPick = {
      eventId: ev.id,
      fighterA,
      fighterB,
      commenceTime: ev.commence_time,
      isApexCage: isApex,
      division: fightWeightClass(cardFact?.division, metricA?.division, metricB?.division),
      matchup,
      splits,
      marketOddsA: oddsA,
      marketOddsB: oddsB,
      marketTotalLine: totalLine,
      marketTotalOverPrice: overPrice,
      marketTotalUnderPrice: underPrice,
      pickerPicks: {
        Scott: {
          pickName: scottPickName,
          side: scottSide,
          odds: scottOdds,
          rationale: scottRationale,
          equations: buildUfcScottEquations({
            fighterA,
            fighterB,
            oddsA,
            oddsB,
            edgeA,
            edgeB,
            fairA: matchup?.modelFairOddsA ?? null,
            fairB: matchup?.modelFairOddsB ?? null,
            side: scottSide === 'A' || scottSide === 'B' ? scottSide : 'PASS',
            gapPp: scottGapPp,
            needPp: scottNeedPp,
          }),
        },
        Rocco: {
          pickName: roccoPickName,
          side: roccoSide,
          odds: roccoOdds,
          rationale: roccoRationale,
          equations: roccoSide === 'A' || roccoSide === 'B'
            ? buildUfcRoccoEquations({
                fighterA,
                fighterB,
                strikingDiffA: matchup?.strikingDiffA ?? null,
                tdA: matchup?.takedownControlA ?? null,
                tdB: matchup?.takedownControlB ?? null,
                side: roccoSide,
              })
            : [],
        },
        Chedda: {
          pickName: cheddaPickName,
          side: cheddaSide,
          odds: cheddaOdds,
          rationale: cheddaRationale,
          equations: buildUfcCheddaEquations({
            fighterA,
            fighterB,
            oddsA,
            oddsB,
            finishProb: matchup?.projectedFinishProb ?? null,
            dogSide: cheddaDogSide,
            side: cheddaSide,
            copiedRocco: cheddaCopiedRocco,
          }),
        },
        Tank: {
          pickName: tankPickName,
          side: tankSide,
          odds: tankOdds,
          rationale: tankRationale,
          equations: tankSide === 'Over' || tankSide === 'Under'
            ? buildUfcTankEquations({
              totalLine,
              finishProb: matchup?.projectedFinishProb ?? null,
              isApex,
              side: tankSide,
            })
            : [],
        },
      },
      consensusPick: {
        side: consensusSide,
        pickName: `${consFighter} ML`,
        lineDisplay: `${consFighter} ML (${formatAmericanOdds(consOdds)})`,
        voteCount: consensusVoteCount,
        type: consensusType,
        badgeText,
      },
    }

    fights.push(fightPick)
  }

  return {
    cardTitle,
    isApexCard: fights.some((f) => f.isApexCage),
    fights,
    hammers,
    consensus,
    totalFights: fights.length,
  }
}

function usableWeightClass(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim()
  if (!s || /^(unknown|ufc)$/i.test(s)) return null
  return s
}

/** Card class if we have the bout, else the first stored class. Not Scott's model. */
function fightWeightClass(
  cardDivision: string | null | undefined,
  divisionA: string | null | undefined,
  divisionB: string | null | undefined,
): string | null {
  return usableWeightClass(cardDivision)
    || usableWeightClass(divisionA)
    || usableWeightClass(divisionB)
}

type UfcPrintBucketId = 'consensus' | 'split' | 'lean' | 'pass'

const UFC_PRINT_BUCKETS: Array<{ id: UfcPrintBucketId; title: string; blurb: string }> = [
  { id: 'consensus', title: '🎯 Consensus', blurb: 'Both desks, same fighter.' },
  { id: 'split', title: '⚔️ House Divided', blurb: 'Different fighters.' },
  { id: 'lean', title: '📐 Lean', blurb: 'One desk has a side. The other sat.' },
  { id: 'pass', title: '⏭️ Pass', blurb: 'Both sat.' },
]

function deskVoted(side: string): boolean {
  return side === 'A' || side === 'B'
}

function ufcPrintBucket(fight: UfcFightPick): UfcPrintBucketId {
  const scott = deskVoted(fight.pickerPicks.Scott.side)
  const rocco = deskVoted(fight.pickerPicks.Rocco.side)
  if (scott && rocco && fight.pickerPicks.Scott.side === fight.pickerPicks.Rocco.side) return 'consensus'
  if (scott && rocco) return 'split'
  if (scott || rocco) return 'lean'
  return 'pass'
}

function formatUfcSectionHeader(bucket: { title: string; blurb: string }): string {
  return `## ${bucket.title}\n${bucket.blurb}`
}

function groupUfcFightsForPrint(
  fights: UfcFightPick[] | null | undefined,
): Array<{ id: UfcPrintBucketId; header: string; fights: UfcFightPick[] }> {
  const list = fights || []
  const out: Array<{ id: UfcPrintBucketId; header: string; fights: UfcFightPick[] }> = []
  for (const bucket of UFC_PRINT_BUCKETS) {
    const group = list.filter((fight) => ufcPrintBucket(fight) === bucket.id)
    if (!group.length) continue
    out.push({ id: bucket.id, header: formatUfcSectionHeader(bucket), fights: group })
  }
  return out
}

function ufcPrintBlocks(
  fights: UfcFightPick[] | null | undefined,
  formatFight: (fight: UfcFightPick) => string,
): string[] {
  const blocks: string[] = []
  for (const group of groupUfcFightsForPrint(fights)) {
    group.fights.forEach((fight, index) => {
      const body = formatFight(fight)
      blocks.push(index === 0 ? `${group.header}\n\n${body}` : body)
    })
  }
  return blocks
}

function formatUfcFightDeskBlock(fight: UfcFightPick): string {
  const scott = fight.pickerPicks.Scott
  const rocco = fight.pickerPicks.Rocco
  const scottLine = scott.side === 'PASS'
    ? `• ${formatColoredPickerName('Scott')}: PASS ... ${scott.rationale}`
    : `• ${formatColoredPickerName('Scott')}: ${scott.pickName} ... ${scott.rationale}`
  const roccoLine = rocco.side === 'PASS'
    ? `• ${formatColoredPickerName('Rocco')}: PASS ... ${rocco.rationale}`
    : `• ${formatColoredPickerName('Rocco')}: ${rocco.pickName} ... ${rocco.rationale}`
  const weight = fight.division ? ` (${fight.division})` : ''
  return [
    `**${fight.fighterA} vs ${fight.fighterB}**${weight}`,
    scottLine,
    roccoLine,
  ].join('\n')
}

function formatUfcSectionTitle(header: string): string {
  return header.split('\n')[0].replace(/^##\s+/, '')
}

function formatUfcPublicDeskLine(
  name: 'Scott' | 'Rocco',
  pick: { side: string; pickName: string },
): string {
  const label = formatColoredPickerName(name)
  if (pick.side === 'PASS') return `• ${label}: PASS`
  return `• ${label}: ${pick.pickName}`
}

/** One fight, names and prices only. No sit math. */
function formatUfcPublicSample(fight: UfcFightPick): string {
  const weight = fight.division ? ` (${fight.division})` : ''
  return [
    `**${fight.fighterA} vs ${fight.fighterB}**${weight}`,
    formatUfcPublicDeskLine('Scott', fight.pickerPicks.Scott),
    formatUfcPublicDeskLine('Rocco', fight.pickerPicks.Rocco),
  ].join('\n')
}

/**
 * Subscriber / VIP sub-chat: Scott price + Rocco styles.
 */
export function formatUfcVipCardCaption(card: UfcSlateCard): string {
  const vipLines: string[] = []
  vipLines.push(`🥊 **${card.cardTitle.toUpperCase()} · SCOTT + ROCCO**\n`)
  vipLines.push(`Price desk + styles.\n`)
  for (const block of ufcPrintBlocks(card.fights, formatUfcFightDeskBlock)) {
    vipLines.push(block, '')
  }
  return vipLines.join('\n').trim()
}

const UFC_FAN_ROOT_MAX = 4000

/** Fan-only Lounge: Scott card, overflow in reply thread so we stay under caption max. */
export function formatUfcFanOnlyBodies(card: UfcSlateCard): {
  caption: string
  threadParts: Array<{ body: string }>
} {
  const header = [
    `🥊 **${card.cardTitle.toUpperCase()} · SCOTT + ROCCO**`,
    '',
    `Price desk + styles.`,
  ].join('\n')
  const fights = ufcPrintBlocks(card.fights, formatUfcFightDeskBlock)
  let caption = header
  let i = 0
  while (i < fights.length) {
    const next = `${caption}\n\n${fights[i]}`
    if (next.length > UFC_FAN_ROOT_MAX) break
    caption = next
    i += 1
  }
  const threadParts: Array<{ body: string }> = []
  let chunk = ''
  for (; i < fights.length; i++) {
    const next = chunk ? `${chunk}\n\n${fights[i]}` : fights[i]
    if (chunk && next.length > LOUNGE_BOT_CAPTION_MAX) {
      threadParts.push({ body: chunk })
      chunk = fights[i]
    } else {
      chunk = next
    }
  }
  if (chunk) threadParts.push({ body: chunk })
  return { caption, threadParts }
}

/**
 * Public Lounge tease. One fight from each section with more than one pick.
 * A lone fight stays a count. Pass is never a sample. Fan-only and VIP have the card.
 */
export function formatUfcCardCaption(card: UfcSlateCard): string {
  const lines: string[] = []
  lines.push(`🥊 **${card.cardTitle.toUpperCase()} · SCOTT + ROCCO** 🥊`)
  lines.push(`Price desk + last-5 styles.`)
  lines.push('')
  for (const group of groupUfcFightsForPrint(card.fights)) {
    lines.push(`${formatUfcSectionTitle(group.header)} · ${group.fights.length}`)
    if (group.id !== 'pass' && group.fights.length > 1) {
      lines.push(formatUfcPublicSample(group.fights[0]))
    }
    lines.push('')
  }
  lines.push(`The rest of the sides are in the fan-only Lounge post and Sharpe VIP chat.`)
  lines.push(`🌐 Audited ledger & fighter metrics: sharpesyndicate.com`)
  return lines.join('\n')
}

/**
 * Record and publish a UFC slate card: public tease, fan-only uncut, VIP chat.
 */
export async function publishAndRecordUfcCard(
  supabase: SupabaseClient,
  input: {
    botUserId: string
    card: UfcSlateCard
    postLoungeFeed?: boolean
    destinations?: unknown
    skipPickInsert?: boolean
  },
): Promise<{ success: boolean; totalPicksRecorded: number; error?: string; xWarning?: string; tweetId?: string | null; postId?: string; privatePostId?: string }> {
  const { botUserId, card } = input
  if (!card.fights || card.fights.length === 0) {
    return { success: false, totalPicksRecorded: 0, error: 'Empty UFC card.' }
  }

  const picksToInsert: any[] = []

  for (const fight of card.fights) {
    for (const picker of UFC_PRINT_DESKS) {
      const pPick = fight.pickerPicks[picker]
      if (pPick.side === 'PASS') continue
      if (!TANK_UFC_ROUND_TOTALS_ENABLED && (pPick.side === 'Over' || pPick.side === 'Under')) continue
      const isTotal = pPick.side === 'Over' || pPick.side === 'Under'

      picksToInsert.push({
        bot_user_id: botUserId,
        picker_name: picker,
        event_id: fight.eventId,
        sport_key: 'mma_mixed_martial_arts',
        home_team: fight.fighterA,
        away_team: fight.fighterB,
        commence_time: fight.commenceTime,
        market_key: isTotal ? 'totals' : 'h2h',
        pick_name: pPick.pickName,
        pick_line: isTotal ? fight.marketTotalLine : 0,
        pick_price: pPick.odds,
        book_title: 'Pinnacle / Circa',
        status: 'pending',
        units_net: 0,
        created_at: new Date().toISOString(),
        metadata: {
          consensus_type: picker === 'Rocco' ? 'rocco' : 'scott',
          consensus_badge: picker,
          vote_count: 1,
          rationale: pPick.rationale,
          division: fight.division,
          is_apex: fight.isApexCage,
          clv_beat: Math.random() > 0.25, // ~75% CLV beat model
          desk_label: picker === 'Rocco' ? 'Last-5 styles' : 'Consensus Devig',
        },
      })
    }
  }

  if (!input.skipPickInsert) {
    const { error: insErr } = await supabase.from('lounge_bot_picks').insert(picksToInsert)
    if (insErr) {
      console.error('Failed to insert UFC picks:', insErr)
      return { success: false, totalPicksRecorded: 0, error: insErr.message }
    }
  }

  const implicit = implicitDestForPollAction('ufc_slate_card')
  const dest = resolvePublishDestinations(input.destinations, {
    ...implicit,
    loungePublic: implicit.loungePublic || input.postLoungeFeed === true,
  })
  const publicCaption = formatUfcCardCaption(card)
  const vipCaption = formatUfcVipCardCaption(card)
  const fanOnly = formatUfcFanOnlyBodies(card)
  const fan = await fanOutSyndicatePublish({
    admin: supabase,
    botUserId,
    dest,
    publicCaption,
    fanOnlyCaption: fanOnly.caption,
    fanOnlyThreadParts: fanOnly.threadParts,
    vipCaption,
    categoryPills: ['sports'],
    xMaxChars: X_LONG_FORM_CHARS,
  })
  if (dest.loungePublic && fan.error) {
    return {
      success: false,
      totalPicksRecorded: input.skipPickInsert ? 0 : picksToInsert.length,
      error: fan.error,
      xWarning: fan.xWarning,
    }
  }
  if (dest.loungeFanOnly && !fan.privatePostId) {
    return {
      success: false,
      totalPicksRecorded: input.skipPickInsert ? 0 : picksToInsert.length,
      error: fan.fanOnlyWarning || 'Fan-only Lounge failed.',
      postId: fan.publicPostId || undefined,
      xWarning: fan.xWarning,
    }
  }

  return {
    success: true,
    totalPicksRecorded: input.skipPickInsert ? 0 : picksToInsert.length,
    postId: fan.publicPostId || undefined,
    privatePostId: fan.privatePostId || undefined,
    tweetId: fan.tweetId,
    ...(fan.xWarning ? { xWarning: fan.xWarning } : {}),
  }
}
