/**
 * UFC Fighter Metrics Registry & Octagon Matchup Engine.
 *
 * Grounded in real UFC Stats official metrics:
 * 1. Significant Strikes Landed per Min (SLpM) & Absorbed per Min (SApM)
 * 2. Striking Accuracy & Defense %
 * 3. Takedowns Landed per 15 Min & Takedown Defense %
 * 4. Submission Attempts per 15 Min & Finish Rate % (KO / Sub / Dec)
 * 5. Reach Disparity & Stance Matchup (Southpaw vs Orthodox angles)
 * 6. Cage Dimensions (25-ft Apex Small Cage vs 30-ft Standard Arena Octagon)
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { impliedToAmerican, americanToImplied } from './loungeBotOddsCaption.ts'

export type UfcDivision =
  | 'Flyweight'
  | 'Bantamweight'
  | 'Featherweight'
  | 'Lightweight'
  | 'Welterweight'
  | 'Middleweight'
  | 'Light Heavyweight'
  | 'Heavyweight'
  | "Women's Strawweight"
  | "Women's Flyweight"
  | "Women's Bantamweight"

export type UfcFighterMetric = {
  fighter_name: string
  division: UfcDivision
  reach_inches: number
  stance: 'Orthodox' | 'Southpaw' | 'Switch'
  slpm: number       // Significant strikes landed per minute
  sapm: number       // Significant strikes absorbed per minute
  str_acc: number    // Striking accuracy %
  str_def: number    // Striking defense %
  td_avg: number     // Takedowns landed per 15 min
  td_acc: number     // Takedown accuracy %
  td_def: number     // Takedown defense %
  sub_avg: number    // Submission attempts per 15 min
  finish_rate: number // % of career wins via KO/TKO or Sub
  ko_finish_rate: number
  sub_finish_rate: number
  is_custom_override?: boolean
}

export type DivisionFinishBaseline = {
  division: UfcDivision
  avgFinishRate: number // empirical finish % (KO + Sub)
  avgKoRate: number
  avgSubRate: number
  avgDecisionRate: number
}

/**
 * Empirical UFC finishing baselines by weight class (UFC Stats historical averages).
 * Heavyweights finish ~75% of fights, whereas Flyweights go to decision ~65% of the time.
 */
export const DIVISION_FINISH_BASELINES: Record<string, DivisionFinishBaseline> = {
  'Flyweight': { division: 'Flyweight', avgFinishRate: 0.35, avgKoRate: 0.16, avgSubRate: 0.19, avgDecisionRate: 0.65 },
  'Bantamweight': { division: 'Bantamweight', avgFinishRate: 0.44, avgKoRate: 0.24, avgSubRate: 0.20, avgDecisionRate: 0.56 },
  'Featherweight': { division: 'Featherweight', avgFinishRate: 0.49, avgKoRate: 0.29, avgSubRate: 0.20, avgDecisionRate: 0.51 },
  'Lightweight': { division: 'Lightweight', avgFinishRate: 0.55, avgKoRate: 0.32, avgSubRate: 0.23, avgDecisionRate: 0.45 },
  'Welterweight': { division: 'Welterweight', avgFinishRate: 0.53, avgKoRate: 0.33, avgSubRate: 0.20, avgDecisionRate: 0.47 },
  'Middleweight': { division: 'Middleweight', avgFinishRate: 0.61, avgKoRate: 0.43, avgSubRate: 0.18, avgDecisionRate: 0.39 },
  'Light Heavyweight': { division: 'Light Heavyweight', avgFinishRate: 0.68, avgKoRate: 0.53, avgSubRate: 0.15, avgDecisionRate: 0.32 },
  'Heavyweight': { division: 'Heavyweight', avgFinishRate: 0.77, avgKoRate: 0.64, avgSubRate: 0.13, avgDecisionRate: 0.23 },
  "Women's Strawweight": { division: "Women's Strawweight", avgFinishRate: 0.31, avgKoRate: 0.12, avgSubRate: 0.19, avgDecisionRate: 0.69 },
  "Women's Flyweight": { division: "Women's Flyweight", avgFinishRate: 0.34, avgKoRate: 0.15, avgSubRate: 0.19, avgDecisionRate: 0.66 },
  "Women's Bantamweight": { division: "Women's Bantamweight", avgFinishRate: 0.42, avgKoRate: 0.21, avgSubRate: 0.21, avgDecisionRate: 0.58 },
}

export type MethodOfVictoryProjections = {
  koProbA: number
  subProbA: number
  decProbA: number
  koProbB: number
  subProbB: number
  decProbB: number
  fdgtdProb: number // Fight Doesn't Go The Distance %
  fgtdProb: number  // Fight Goes The Distance %
  topMethodLabel: string
}

export type UfcMatchupAnalysis = {
  fighterA: string
  fighterB: string
  division: string
  isFiveRounds: boolean
  strikingDiffA: number   // (A.slpm - A.sapm) - (B.slpm - B.sapm)
  takedownControlA: number // Projected takedown success rate A vs B defense
  takedownControlB: number // Projected takedown success rate B vs A defense
  reachDeltaA: number      // in inches
  stanceMatchup: string    // e.g. 'Orthodox vs Southpaw Angle'
  isApexSmallCage: boolean // 25 ft cage vs 30 ft arena
  projectedWinProbA: number // 0.0 - 1.0 based on quantitative model
  projectedWinProbB: number
  modelFairOddsA: number   // American odds e.g. -165
  modelFairOddsB: number   // American odds e.g. +145
  expectedRounds: number   // Expected round total (e.g. 2.1 rounds)
  projectedFinishProb: number // 0.0 - 1.0 likelihood fight ends inside distance
  methodProjections: MethodOfVictoryProjections
  summaryLine: string
}

/**
 * Baseline quantitative metrics for active top-tier UFC fighters across divisions.
 */
export const UFC_BASELINE_FIGHTER_METRICS: UfcFighterMetric[] = [
  // BANTAMWEIGHT
  { fighter_name: 'Sean O\'Malley', division: 'Bantamweight', reach_inches: 72.0, stance: 'Switch', slpm: 7.29, sapm: 3.52, str_acc: 61, str_def: 62, td_avg: 0.45, td_acc: 42, td_def: 62, sub_avg: 0.5, finish_rate: 71, ko_finish_rate: 65, sub_finish_rate: 6 },
  { fighter_name: 'Merab Dvalishvili', division: 'Bantamweight', reach_inches: 68.0, stance: 'Orthodox', slpm: 4.48, sapm: 2.39, str_acc: 41, str_def: 62, td_avg: 6.43, td_acc: 36, td_def: 80, sub_avg: 0.3, finish_rate: 24, ko_finish_rate: 18, sub_finish_rate: 6 },
  { fighter_name: 'Umar Nurmagomedov', division: 'Bantamweight', reach_inches: 69.0, stance: 'Southpaw', slpm: 4.75, sapm: 0.76, str_acc: 69, str_def: 78, td_avg: 4.51, td_acc: 50, td_def: 100, sub_avg: 0.6, finish_rate: 53, ko_finish_rate: 12, sub_finish_rate: 41 },
  { fighter_name: 'Song Yadong', division: 'Bantamweight', reach_inches: 67.0, stance: 'Orthodox', slpm: 4.38, sapm: 3.74, str_acc: 42, str_def: 59, td_avg: 0.65, td_acc: 42, td_def: 74, sub_avg: 0.3, finish_rate: 57, ko_finish_rate: 43, sub_finish_rate: 14 },
  { fighter_name: 'Cory Sandhagen', division: 'Bantamweight', reach_inches: 70.0, stance: 'Switch', slpm: 5.33, sapm: 3.84, str_acc: 44, str_def: 57, td_avg: 1.36, td_acc: 33, td_def: 65, sub_avg: 0.4, finish_rate: 53, ko_finish_rate: 41, sub_finish_rate: 12 },
  { fighter_name: 'Petr Yan', division: 'Bantamweight', reach_inches: 67.0, stance: 'Switch', slpm: 5.11, sapm: 4.02, str_acc: 53, str_def: 60, td_avg: 1.71, td_acc: 52, td_def: 85, sub_avg: 0.2, finish_rate: 47, ko_finish_rate: 41, sub_finish_rate: 6 },

  // FEATHERWEIGHT
  { fighter_name: 'Ilia Topuria', division: 'Featherweight', reach_inches: 69.0, stance: 'Orthodox', slpm: 4.40, sapm: 3.35, str_acc: 46, str_def: 65, td_avg: 1.92, td_acc: 56, td_def: 92, sub_avg: 1.3, finish_rate: 87, ko_finish_rate: 33, sub_finish_rate: 54 },
  { fighter_name: 'Max Holloway', division: 'Featherweight', reach_inches: 69.0, stance: 'Orthodox', slpm: 7.17, sapm: 4.73, str_acc: 48, str_def: 59, td_avg: 0.27, td_acc: 53, td_def: 84, sub_avg: 0.3, finish_rate: 50, ko_finish_rate: 42, sub_finish_rate: 8 },
  { fighter_name: 'Alexander Volkanovski', division: 'Featherweight', reach_inches: 71.5, stance: 'Orthodox', slpm: 6.19, sapm: 3.42, str_acc: 57, str_def: 59, td_avg: 1.78, td_acc: 38, td_def: 70, sub_avg: 0.2, finish_rate: 62, ko_finish_rate: 50, sub_finish_rate: 12 },
  { fighter_name: 'Diego Lopes', division: 'Featherweight', reach_inches: 72.5, stance: 'Orthodox', slpm: 3.24, sapm: 4.12, str_acc: 55, str_def: 42, td_avg: 0.88, td_acc: 50, td_def: 45, sub_avg: 4.5, finish_rate: 88, ko_finish_rate: 40, sub_finish_rate: 48 },
  { fighter_name: 'Movsar Evloev', division: 'Featherweight', reach_inches: 72.5, stance: 'Orthodox', slpm: 4.71, sapm: 2.74, str_acc: 49, str_def: 61, td_avg: 4.41, td_acc: 49, td_def: 71, sub_avg: 0.3, finish_rate: 39, ko_finish_rate: 17, sub_finish_rate: 22 },

  // LIGHTWEIGHT
  { fighter_name: 'Islam Makhachev', division: 'Lightweight', reach_inches: 70.5, stance: 'Southpaw', slpm: 2.46, sapm: 1.24, str_acc: 60, str_def: 61, td_avg: 3.17, td_acc: 61, td_def: 90, sub_avg: 1.1, finish_rate: 65, ko_finish_rate: 19, sub_finish_rate: 46 },
  { fighter_name: 'Arman Tsarukyan', division: 'Lightweight', reach_inches: 72.5, stance: 'Orthodox', slpm: 3.89, sapm: 1.94, str_acc: 48, str_def: 54, td_avg: 3.27, td_acc: 36, td_def: 75, sub_avg: 0.8, finish_rate: 64, ko_finish_rate: 41, sub_finish_rate: 23 },
  { fighter_name: 'Justin Gaethje', division: 'Lightweight', reach_inches: 70.0, stance: 'Orthodox', slpm: 7.03, sapm: 7.50, str_acc: 60, str_def: 53, td_avg: 0.13, td_acc: 25, td_def: 75, sub_avg: 0.0, finish_rate: 84, ko_finish_rate: 80, sub_finish_rate: 4 },
  { fighter_name: 'Dustin Poirier', division: 'Lightweight', reach_inches: 72.0, stance: 'Southpaw', slpm: 5.45, sapm: 4.29, str_acc: 51, str_def: 53, td_avg: 1.36, td_acc: 36, td_def: 63, sub_avg: 1.2, finish_rate: 77, ko_finish_rate: 50, sub_finish_rate: 27 },
  { fighter_name: 'Charles Oliveira', division: 'Lightweight', reach_inches: 74.0, stance: 'Orthodox', slpm: 3.54, sapm: 3.19, str_acc: 54, str_def: 51, td_avg: 2.32, td_acc: 41, td_def: 55, sub_avg: 2.7, finish_rate: 91, ko_finish_rate: 29, sub_finish_rate: 62 },

  // WELTERWEIGHT
  { fighter_name: 'Belal Muhammad', division: 'Welterweight', reach_inches: 72.0, stance: 'Orthodox', slpm: 4.55, sapm: 3.64, str_acc: 43, str_def: 60, td_avg: 2.20, td_acc: 35, td_def: 93, sub_avg: 0.2, finish_rate: 25, ko_finish_rate: 21, sub_finish_rate: 4 },
  { fighter_name: 'Shavkat Rakhmonov', division: 'Welterweight', reach_inches: 77.0, stance: 'Orthodox', slpm: 4.38, sapm: 2.61, str_acc: 59, str_def: 53, td_avg: 1.49, td_acc: 50, td_def: 100, sub_avg: 1.5, finish_rate: 100, ko_finish_rate: 44, sub_finish_rate: 56 },
  { fighter_name: 'Leon Edwards', division: 'Welterweight', reach_inches: 74.0, stance: 'Southpaw', slpm: 2.75, sapm: 2.34, str_acc: 53, str_def: 54, td_avg: 1.23, td_acc: 34, td_def: 70, sub_avg: 0.4, finish_rate: 41, ko_finish_rate: 32, sub_finish_rate: 9 },
  { fighter_name: 'Kamaru Usman', division: 'Welterweight', reach_inches: 76.0, stance: 'Switch', slpm: 4.57, sapm: 3.14, str_acc: 52, str_def: 58, td_avg: 2.82, td_acc: 45, td_def: 97, sub_avg: 0.1, finish_rate: 50, ko_finish_rate: 45, sub_finish_rate: 5 },
  { fighter_name: 'Ian Garry', division: 'Welterweight', reach_inches: 74.5, stance: 'Orthodox', slpm: 6.27, sapm: 3.65, str_acc: 56, str_def: 53, td_avg: 0.58, td_acc: 75, td_def: 69, sub_avg: 0.0, finish_rate: 53, ko_finish_rate: 47, sub_finish_rate: 6 },
  { fighter_name: 'Jack Della Maddalena', division: 'Welterweight', reach_inches: 73.0, stance: 'Switch', slpm: 7.20, sapm: 4.83, str_acc: 53, str_def: 67, td_avg: 0.27, td_acc: 20, td_def: 71, sub_avg: 0.5, finish_rate: 82, ko_finish_rate: 71, sub_finish_rate: 11 },

  // MIDDLEWEIGHT
  { fighter_name: 'Dricus Du Plessis', division: 'Middleweight', reach_inches: 76.0, stance: 'Switch', slpm: 6.49, sapm: 4.77, str_acc: 55, str_def: 55, td_avg: 3.00, td_acc: 50, td_def: 40, sub_avg: 1.3, finish_rate: 90, ko_finish_rate: 43, sub_finish_rate: 47 },
  { fighter_name: 'Israel Adesanya', division: 'Middleweight', reach_inches: 80.0, stance: 'Switch', slpm: 3.93, sapm: 3.11, str_acc: 48, str_def: 56, td_avg: 0.06, td_acc: 14, td_def: 77, sub_avg: 0.2, finish_rate: 67, ko_finish_rate: 67, sub_finish_rate: 0 },
  { fighter_name: 'Sean Strickland', division: 'Middleweight', reach_inches: 76.0, stance: 'Orthodox', slpm: 5.92, sapm: 4.17, str_acc: 41, str_def: 62, td_avg: 0.85, td_acc: 64, td_def: 77, sub_avg: 0.2, finish_rate: 52, ko_finish_rate: 38, sub_finish_rate: 14 },
  { fighter_name: 'Robert Whittaker', division: 'Middleweight', reach_inches: 73.5, stance: 'Orthodox', slpm: 4.58, sapm: 3.42, str_acc: 42, str_def: 60, td_avg: 0.81, td_acc: 38, td_def: 82, sub_avg: 0.0, finish_rate: 58, ko_finish_rate: 38, sub_finish_rate: 20 },
  { fighter_name: 'Khamzat Chimaev', division: 'Middleweight', reach_inches: 75.0, stance: 'Orthodox', slpm: 4.09, sapm: 3.25, str_acc: 58, str_def: 55, td_avg: 3.99, td_acc: 46, td_def: 100, sub_avg: 2.7, finish_rate: 85, ko_finish_rate: 46, sub_finish_rate: 39 },

  // LIGHT HEAVYWEIGHT
  { fighter_name: 'Alex Pereira', division: 'Light Heavyweight', reach_inches: 79.0, stance: 'Orthodox', slpm: 5.10, sapm: 3.65, str_acc: 63, str_def: 51, td_avg: 0.18, td_acc: 100, td_def: 70, sub_avg: 0.0, finish_rate: 83, ko_finish_rate: 83, sub_finish_rate: 0 },
  { fighter_name: 'Magomed Ankalaev', division: 'Light Heavyweight', reach_inches: 75.0, stance: 'Southpaw', slpm: 3.64, sapm: 2.25, str_acc: 53, str_def: 59, td_avg: 1.02, td_acc: 31, td_def: 86, sub_avg: 0.1, finish_rate: 58, ko_finish_rate: 53, sub_finish_rate: 5 },
  { fighter_name: 'Jiri Prochazka', division: 'Light Heavyweight', reach_inches: 80.5, stance: 'Orthodox', slpm: 5.75, sapm: 5.43, str_acc: 55, str_def: 40, td_avg: 0.68, td_acc: 100, td_def: 68, sub_avg: 0.3, finish_rate: 97, ko_finish_rate: 87, sub_finish_rate: 10 },
  { fighter_name: 'Jan Blachowicz', division: 'Light Heavyweight', reach_inches: 78.0, stance: 'Orthodox', slpm: 3.41, sapm: 2.87, str_acc: 49, str_def: 54, td_avg: 1.06, td_acc: 53, td_def: 68, sub_avg: 0.2, finish_rate: 62, ko_finish_rate: 31, sub_finish_rate: 31 },

  // HEAVYWEIGHT
  { fighter_name: 'Jon Jones', division: 'Heavyweight', reach_inches: 84.5, stance: 'Orthodox', slpm: 4.30, sapm: 2.22, str_acc: 58, str_def: 64, td_avg: 1.85, td_acc: 45, td_def: 95, sub_avg: 0.5, finish_rate: 63, ko_finish_rate: 37, sub_finish_rate: 26 },
  { fighter_name: 'Tom Aspinall', division: 'Heavyweight', reach_inches: 78.0, stance: 'Orthodox', slpm: 7.72, sapm: 2.77, str_acc: 66, str_def: 67, td_avg: 3.32, td_acc: 100, td_def: 100, sub_avg: 1.7, finish_rate: 100, ko_finish_rate: 73, sub_finish_rate: 27 },
  { fighter_name: 'Ciryl Gane', division: 'Heavyweight', reach_inches: 81.0, stance: 'Orthodox', slpm: 5.08, sapm: 2.20, str_acc: 59, str_def: 62, td_avg: 0.61, td_acc: 21, td_def: 55, sub_avg: 0.2, finish_rate: 67, ko_finish_rate: 50, sub_finish_rate: 17 },
  { fighter_name: 'Alexander Volkov', division: 'Heavyweight', reach_inches: 80.0, stance: 'Orthodox', slpm: 4.86, sapm: 3.00, str_acc: 57, str_def: 54, td_avg: 0.49, td_acc: 62, td_def: 73, sub_avg: 0.1, finish_rate: 73, ko_finish_rate: 63, sub_finish_rate: 10 },

  // FLYWEIGHT
  { fighter_name: 'Alexandre Pantoja', division: 'Flyweight', reach_inches: 67.0, stance: 'Orthodox', slpm: 4.32, sapm: 3.90, str_acc: 49, str_def: 51, td_avg: 2.20, td_acc: 44, td_def: 67, sub_avg: 1.1, finish_rate: 68, ko_finish_rate: 29, sub_finish_rate: 39 },
  { fighter_name: 'Brandon Royval', division: 'Flyweight', reach_inches: 68.0, stance: 'Southpaw', slpm: 4.36, sapm: 3.73, str_acc: 44, str_def: 49, td_avg: 0.70, td_acc: 50, td_def: 60, sub_avg: 1.8, finish_rate: 81, ko_finish_rate: 25, sub_finish_rate: 56 },
  { fighter_name: 'Brandon Moreno', division: 'Flyweight', reach_inches: 70.0, stance: 'Orthodox', slpm: 3.80, sapm: 3.40, str_acc: 43, str_def: 56, td_avg: 1.73, td_acc: 45, td_def: 65, sub_avg: 0.5, finish_rate: 67, ko_finish_rate: 24, sub_finish_rate: 43 },
]

function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Find fighter metric record by full name or matching tokens.
 */
export function findFighterMetric(
  targetName: string,
  metricsList: UfcFighterMetric[] = UFC_BASELINE_FIGHTER_METRICS,
): UfcFighterMetric | null {
  const norm = normalizeName(targetName)
  if (!norm) return null

  // Direct match
  const direct = metricsList.find((m) => normalizeName(m.fighter_name) === norm)
  if (direct) return direct

  // Token / Substring match (e.g. "O'Malley" or "Nurmagomedov")
  const tokens = targetName.toLowerCase().split(/\s+/).filter((t) => t.length >= 3)
  for (const m of metricsList) {
    const mNorm = normalizeName(m.fighter_name)
    if (tokens.every((t) => mNorm.includes(t))) return m
    if (tokens.some((t) => mNorm.includes(t) && t.length >= 6)) return m
  }

  return null
}

/**
 * Quantitative MMA Matchup Engine:
 * Compares two fighters' striking differentials, grappling control factors, reach, stance, cage size,
 * weight class finish baselines, and championship 5-round cardio degradation.
 */
export function analyzeUfcMatchup(
  fighterAName: string,
  fighterBName: string,
  metricsList: UfcFighterMetric[] = UFC_BASELINE_FIGHTER_METRICS,
  isApexCage = false, // true = 25 ft small cage, false = 30 ft arena
  isFiveRounds = false, // Main event / Title fight
): UfcMatchupAnalysis | null {
  const fA = findFighterMetric(fighterAName, metricsList)
  const fB = findFighterMetric(fighterBName, metricsList)

  if (!fA || !fB) {
    return null
  }

  const divisionKey = fA.division || 'Lightweight'
  const baseline = DIVISION_FINISH_BASELINES[divisionKey] || DIVISION_FINISH_BASELINES['Lightweight']

  // 1. Striking Differential
  // (A's net strikes/min) vs (B's net strikes/min)
  const netStrikingA = fA.slpm - fA.sapm
  const netStrikingB = fB.slpm - fB.sapm
  const strikingDiffA = Math.round((netStrikingA - netStrikingB) * 100) / 100

  // 2. Grappling Control Factor
  // How effectively A takes down B (factoring in B's TD defense)
  const tdControlA = Math.round(fA.td_avg * (1 - fB.td_def / 100) * (fA.td_acc / 50) * 10) / 10
  const tdControlB = Math.round(fB.td_avg * (1 - fA.td_def / 100) * (fB.td_acc / 50) * 10) / 10

  // 3. Reach Advantage
  const reachDeltaA = Math.round((fA.reach_inches - fB.reach_inches) * 10) / 10

  // 4. Stance Dynamics
  let stanceMatchup = 'Orthodox vs Orthodox'
  if (fA.stance === 'Southpaw' && fB.stance === 'Orthodox') stanceMatchup = 'Southpaw Advantage (Open Stance)'
  else if (fA.stance === 'Orthodox' && fB.stance === 'Southpaw') stanceMatchup = 'Southpaw Opponent (Open Stance)'
  else if (fA.stance === 'Switch' || fB.stance === 'Switch') stanceMatchup = 'Switch Stance Angles'

  // 5. Projected Win Probability (Quantitative Composite Model)
  // Baseline = 50%
  let probA = 0.50

  // Striking differential impact (+/- up to 15%)
  probA += (strikingDiffA * 0.05)

  // Grappling control disparity (+/- up to 18%)
  probA += ((tdControlA - tdControlB) * 0.07)

  // Reach advantage impact (0.8% per inch)
  probA += (reachDeltaA * 0.008)

  // Submission threat disparity
  probA += ((fA.sub_avg - fB.sub_avg) * 0.03)

  // 5-Round Championship Cardio & Pace Modeling
  // High-volume cardio machines get boosted in 25-minute fights
  if (isFiveRounds) {
    const cardioDisparity = (fA.slpm - fB.slpm) * 0.02
    probA += cardioDisparity
  }

  // Small cage adjustment: boosts aggressive grapplers and heavy hitters
  if (isApexCage) {
    if (tdControlA > tdControlB) probA += 0.03
    else if (tdControlB > tdControlA) probA -= 0.03
    if (fA.finish_rate > fB.finish_rate) probA += 0.02
  }

  // Clamp probability between 10% and 90%
  probA = Math.max(0.12, Math.min(0.88, probA))
  const probB = Math.round((1 - probA) * 1000) / 1000
  probA = Math.round(probA * 1000) / 1000

  const fairOddsA = impliedToAmerican(probA)
  const fairOddsB = impliedToAmerican(probB)

  // 6. Empirical Method-of-Victory & FDGTD Modeling
  const fighterFinishAvg = ((fA.finish_rate + fB.finish_rate) / 2) / 100
  // Blend empirical weight-class finish baseline with individual fighter finish rates (60/40 blend)
  let finishProb = (baseline.avgFinishRate * 0.6) + (fighterFinishAvg * 0.4)
  if (isApexCage) finishProb = Math.min(0.92, finishProb + 0.10)
  if (isFiveRounds) finishProb = Math.min(0.94, finishProb + 0.12) // 10 more minutes = +12% finish equity

  const fdgtdProb = Math.round(finishProb * 100) / 100
  const fgtdProb = Math.round((1 - fdgtdProb) * 100) / 100

  // Detailed Method breakdowns per fighter
  const koProbA = Math.round(probA * ((fA.ko_finish_rate / 100) * 0.7 + baseline.avgKoRate * 0.3) * 100) / 100
  const subProbA = Math.round(probA * ((fA.sub_finish_rate / 100) * 0.7 + baseline.avgSubRate * 0.3) * 100) / 100
  const decProbA = Math.max(0.05, Math.round((probA - koProbA - subProbA) * 100) / 100)

  const koProbB = Math.round(probB * ((fB.ko_finish_rate / 100) * 0.7 + baseline.avgKoRate * 0.3) * 100) / 100
  const subProbB = Math.round(probB * ((fB.sub_finish_rate / 100) * 0.7 + baseline.avgSubRate * 0.3) * 100) / 100
  const decProbB = Math.max(0.05, Math.round((probB - koProbB - subProbB) * 100) / 100)

  let topMethodLabel = `${fA.fighter_name} via Decision`
  if (koProbA > decProbA && koProbA > koProbB) topMethodLabel = `${fA.fighter_name} via KO/TKO (${Math.round(koProbA * 100)}%)`
  else if (subProbA > decProbA && subProbA > subProbB) topMethodLabel = `${fA.fighter_name} via Submission (${Math.round(subProbA * 100)}%)`
  else if (koProbB > decProbB && koProbB > koProbA) topMethodLabel = `${fB.fighter_name} via KO/TKO (${Math.round(koProbB * 100)}%)`
  else if (subProbB > decProbB && subProbB > subProbA) topMethodLabel = `${fB.fighter_name} via Submission (${Math.round(subProbB * 100)}%)`
  else if (decProbB > decProbA) topMethodLabel = `${fB.fighter_name} via Decision (${Math.round(decProbB * 100)}%)`
  else topMethodLabel = `${fA.fighter_name} via Decision (${Math.round(decProbA * 100)}%)`

  // 7. Expected Rounds
  const totalRoundPeriods = isFiveRounds ? 5.0 : 3.0
  let expectedRounds = totalRoundPeriods - (fdgtdProb * (isFiveRounds ? 2.4 : 1.5))
  if (isApexCage) expectedRounds = Math.max(1.1, expectedRounds - 0.3)
  expectedRounds = Math.round(expectedRounds * 10) / 10

  // Concise objective summary line for storytelling
  const advFighter = probA >= 0.50 ? fA.fighter_name : fB.fighter_name
  const advSpread = probA >= 0.50 ? fairOddsA : fairOddsB
  const diffDisplay = Math.abs(strikingDiffA) >= 1.0
    ? `${strikingDiffA > 0 ? '+' : ''}${strikingDiffA} SLpM differential`
    : Math.abs(tdControlA - tdControlB) >= 0.8
    ? `+${Math.abs(Math.round((tdControlA - tdControlB) * 10) / 10)} takedown control edge`
    : `${Math.abs(reachDeltaA)}" reach delta`

  const summaryLine = `UFC Model Delta · ${advFighter} (${advSpread > 0 ? `+${advSpread}` : advSpread}) · ${diffDisplay}${isApexCage ? ' · Apex 25ft Cage' : ''} · FDGTD ${Math.round(fdgtdProb * 100)}%`

  return {
    fighterA: fA.fighter_name,
    fighterB: fB.fighter_name,
    division: fA.division,
    isFiveRounds,
    strikingDiffA,
    takedownControlA,
    takedownControlB,
    reachDeltaA,
    stanceMatchup,
    isApexSmallCage: isApexCage,
    projectedWinProbA: probA,
    projectedWinProbB: probB,
    modelFairOddsA: fairOddsA,
    modelFairOddsB: fairOddsB,
    expectedRounds,
    projectedFinishProb: fdgtdProb,
    methodProjections: {
      koProbA,
      subProbA,
      decProbA,
      koProbB,
      subProbB,
      decProbB,
      fdgtdProb,
      fgtdProb,
      topMethodLabel,
    },
    summaryLine,
  }
}

/**
 * Fetch fighter metrics from Supabase with static baseline fallback.
 */
export async function fetchUfcFighterMetrics(
  supabase?: SupabaseClient,
): Promise<UfcFighterMetric[]> {
  if (!supabase) return UFC_BASELINE_FIGHTER_METRICS

  try {
    const { data, error } = await supabase
      .from('ufc_fighter_metrics')
      .select('*')
      .order('division', { ascending: true })

    if (error || !data || data.length === 0) {
      return UFC_BASELINE_FIGHTER_METRICS
    }

    return data as UfcFighterMetric[]
  } catch (err) {
    console.warn('Failed to fetch ufc_fighter_metrics from DB:', err)
    return UFC_BASELINE_FIGHTER_METRICS
  }
}
