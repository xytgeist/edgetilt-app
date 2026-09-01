/**
 * Port of supabase/functions/_shared/loungeBotUfcMetrics.ts analyzeUfcMatchup
 * for Node backtests (keep in sync when tuning coefficients).
 */
import { americanToImplied, impliedToAmerican, devigAmericanTwoWay } from './ufcOddsMath.mjs'
import { computeSkillScore, computeMatchupSkillGap } from './ufcSkillRanker.mjs'

export const DIVISION_FINISH_BASELINES = {
  Flyweight: { avgFinishRate: 0.35, avgKoRate: 0.16, avgSubRate: 0.19, avgDecisionRate: 0.65 },
  Bantamweight: { avgFinishRate: 0.44, avgKoRate: 0.24, avgSubRate: 0.20, avgDecisionRate: 0.56 },
  Featherweight: { avgFinishRate: 0.49, avgKoRate: 0.29, avgSubRate: 0.20, avgDecisionRate: 0.51 },
  Lightweight: { avgFinishRate: 0.55, avgKoRate: 0.32, avgSubRate: 0.23, avgDecisionRate: 0.45 },
  Welterweight: { avgFinishRate: 0.53, avgKoRate: 0.33, avgSubRate: 0.20, avgDecisionRate: 0.47 },
  Middleweight: { avgFinishRate: 0.61, avgKoRate: 0.43, avgSubRate: 0.18, avgDecisionRate: 0.39 },
  'Light Heavyweight': { avgFinishRate: 0.68, avgKoRate: 0.53, avgSubRate: 0.15, avgDecisionRate: 0.32 },
  Heavyweight: { avgFinishRate: 0.77, avgKoRate: 0.64, avgSubRate: 0.13, avgDecisionRate: 0.23 },
  "Women's Strawweight": { avgFinishRate: 0.31, avgKoRate: 0.12, avgSubRate: 0.19, avgDecisionRate: 0.69 },
  "Women's Flyweight": { avgFinishRate: 0.34, avgKoRate: 0.15, avgSubRate: 0.19, avgDecisionRate: 0.66 },
  "Women's Bantamweight": { avgFinishRate: 0.42, avgKoRate: 0.21, avgSubRate: 0.21, avgDecisionRate: 0.58 },
}

/** @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fA @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fB */
export function analyzeUfcMatchupFromSnapshots(fA, fB, opts = {}) {
  const isApexCage = Boolean(opts.isApexCage)
  const isFiveRounds = Boolean(opts.isFiveRounds)

  const divisionKey = fA.division || fB.division || 'Lightweight'
  const baseline = DIVISION_FINISH_BASELINES[divisionKey] || DIVISION_FINISH_BASELINES.Lightweight

  const netStrikingA = fA.slpm - fA.sapm
  const netStrikingB = fB.slpm - fB.sapm
  const strikingDiffA = Math.round((netStrikingA - netStrikingB) * 100) / 100

  const tdControlA = Math.round(fA.td_avg * (1 - fB.td_def / 100) * (fA.td_acc / 50) * 10) / 10
  const tdControlB = Math.round(fB.td_avg * (1 - fA.td_def / 100) * (fB.td_acc / 50) * 10) / 10

  const reachDeltaA = Math.round((fA.reach_inches - fB.reach_inches) * 10) / 10

  let probA = 0.5
  probA += strikingDiffA * 0.05
  probA += (tdControlA - tdControlB) * 0.07
  probA += reachDeltaA * 0.008
  probA += (fA.sub_avg - fB.sub_avg) * 0.03

  if (isFiveRounds) {
    probA += (fA.slpm - fB.slpm) * 0.02
  }

  if (isApexCage) {
    if (tdControlA > tdControlB) probA += 0.03
    else if (tdControlB > tdControlA) probA -= 0.03
    if (fA.finish_rate > fB.finish_rate) probA += 0.02
  }

  probA = Math.max(0.12, Math.min(0.88, probA))
  const probB = Math.round((1 - probA) * 1000) / 1000
  probA = Math.round(probA * 1000) / 1000

  const fighterFinishAvg = ((fA.finish_rate + fB.finish_rate) / 2) / 100
  let finishProb = baseline.avgFinishRate * 0.6 + fighterFinishAvg * 0.4
  if (isApexCage) finishProb = Math.min(0.92, finishProb + 0.1)
  if (isFiveRounds) finishProb = Math.min(0.94, finishProb + 0.12)

  return {
    fighterA: fA.fighter_name,
    fighterB: fB.fighter_name,
    division: divisionKey,
    projectedWinProbA: probA,
    projectedWinProbB: probB,
    modelFairOddsA: impliedToAmerican(probA),
    modelFairOddsB: impliedToAmerican(probB),
    projectedFinishProb: Math.round(finishProb * 100) / 100,
    strikingDiffA,
    takedownControlA: tdControlA,
    takedownControlB: tdControlB,
  }
}

/**
 * Stat-favored dog: market underdog with skill + striking edge on our side.
 * @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fPick
 * @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fOpp
 * @param {number} oddsPick American ML on picked fighter
 * @param {number} skillGapPick skill score pick minus opp
 */
export function detectStatDog(fPick, fOpp, oddsPick, skillGapPick) {
  const imp = americanToImplied(oddsPick)
  const netStrPick = fPick.slpm - fPick.sapm
  const netStrOpp = fOpp.slpm - fOpp.sapm
  return imp < 0.5 && skillGapPick > 0.25 && netStrPick - netStrOpp > 0.5
}

/**
 * v0.6: ranker skill gap → calibrated win prob (optional market shrink).
 * @param {{ lookupProbA: (gap: number) => number }} calibration
 */
export function analyzeUfcMatchupCalibrated(fA, fB, opts = {}, calibration) {
  const raw = analyzeUfcMatchupFromSnapshots(fA, fB, opts)
  const scoreA = computeSkillScore(fA)
  const scoreB = computeSkillScore(fB)
  const skillGap = computeMatchupSkillGap(fA, fB)

  let probA = calibration?.lookupProbA ? calibration.lookupProbA(skillGap) : 0.5
  const marketBlend = Number(opts.marketBlend ?? 0)
  const oddsA = opts.oddsA
  const oddsB = opts.oddsB

  if (marketBlend > 0 && oddsA && oddsB) {
    const impA = americanToImplied(oddsA)
    probA = (1 - marketBlend) * probA + marketBlend * impA
  }

  probA = Math.max(0.08, Math.min(0.92, probA))
  probA = Math.round(probA * 1000) / 1000
  const probB = Math.round((1 - probA) * 1000) / 1000

  const statDogA =
    oddsA && oddsB
      ? detectStatDog(fA, fB, oddsA, skillGap)
      : skillGap > 0.25 && fA.slpm - fA.sapm > fB.slpm - fB.sapm + 0.5
  const statDogB =
    oddsA && oddsB
      ? detectStatDog(fB, fA, oddsB, -skillGap)
      : skillGap < -0.25 && fB.slpm - fB.sapm > fA.slpm - fA.sapm + 0.5

  return {
    ...raw,
    skillScoreA: Math.round(scoreA * 1000) / 1000,
    skillScoreB: Math.round(scoreB * 1000) / 1000,
    skillGap: Math.round(skillGap * 1000) / 1000,
    rawWinProbA: raw.projectedWinProbA,
    rawWinProbB: raw.projectedWinProbB,
    projectedWinProbA: probA,
    projectedWinProbB: probB,
    modelFairOddsA: impliedToAmerican(probA),
    modelFairOddsB: impliedToAmerican(probB),
    flags: { statDogA, statDogB },
  }
}

/** Scott desk: pick side with higher model edge vs devigged market ML. */
export function pickScottSide(matchup, oddsA, oddsB, opts = {}) {
  if (!matchup) return null
  const devig = opts.devig !== false
  const market = devig ? devigAmericanTwoWay(oddsA, oddsB) : { impA: americanToImplied(oddsA), impB: americanToImplied(oddsB) }
  const edgeA = matchup.projectedWinProbA - market.impA
  const edgeB = matchup.projectedWinProbB - market.impB
  if (edgeB > edgeA) {
    return { side: 'B', edge: edgeB, prob: matchup.projectedWinProbB }
  }
  return { side: 'A', edge: edgeA, prob: matchup.projectedWinProbA }
}
