/**
 * Rocco UFC decide. Own file only: last-5 + 3/5 + cage + stance.
 * No juice. No price-desk number. Sit is first-class.
 */

export const ROCCO_MIN_FIGHTS = 3
/** Absolute margin below this is a sit. */
export const ROCCO_SIT_MARGIN = 0.35

/**
 * @typedef {object} UfcRoccoLast5
 * @property {string} [fighterName]
 * @property {number} fightCount
 * @property {number} wins
 * @property {number} losses
 * @property {number} koWins
 * @property {number} subWins
 * @property {number} decWins
 * @property {number} tdLanded
 * @property {number} sigStrLanded
 * @property {number} roundsFought
 * @property {number} distanceFights
 * @property {string | null} [stance]
 */

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function perFight(total, fights) {
  const n = num(fights)
  if (n <= 0) return 0
  return num(total) / n
}

/**
 * @param {{
 *   fighterA: string
 *   fighterB: string
 *   last5A: UfcRoccoLast5 | null | undefined
 *   last5B: UfcRoccoLast5 | null | undefined
 *   scheduledRounds?: 3 | 5 | null
 *   isApex?: boolean
 *   stanceA?: string | null
 *   stanceB?: string | null
 * }} input
 */
export function decideRoccoUfc(input) {
  const fighterA = String(input?.fighterA || 'A')
  const fighterB = String(input?.fighterB || 'B')
  const last5A = input?.last5A
  const last5B = input?.last5B
  const scheduledRounds = input?.scheduledRounds === 5 ? 5 : 3
  const isApex = Boolean(input?.isApex)
  const stanceA = input?.stanceA || last5A?.stance || 'Orthodox'
  const stanceB = input?.stanceB || last5B?.stance || 'Orthodox'

  if (!last5A || !last5B) {
    const who = !last5A && !last5B ? '' : !last5A ? fighterA : fighterB
    return {
      side: 'PASS',
      margin: 0,
      rationale: who ? `Not enough data on ${who}.` : 'Not enough data.',
      features: ['missing_last5'],
    }
  }
  if (num(last5A.fightCount) < ROCCO_MIN_FIGHTS || num(last5B.fightCount) < ROCCO_MIN_FIGHTS) {
    return {
      side: 'PASS',
      margin: 0,
      rationale: 'Last-5 tape under 3 fights.',
      features: ['thin_tape'],
    }
  }

  const countsOn = last5A.countsMeasured !== false && last5B.countsMeasured !== false
  const winA = perFight(last5A.wins, last5A.fightCount)
  const winB = perFight(last5B.wins, last5B.fightCount)
  const distanceA = perFight(last5A.distanceFights, last5A.fightCount)
  const distanceB = perFight(last5B.distanceFights, last5B.fightCount)

  let scoreA = 0
  const features = []

  if (countsOn) {
    const wrestleA = perFight(last5A.tdLanded, last5A.fightCount)
    const wrestleB = perFight(last5B.tdLanded, last5B.fightCount)
    const strikeA = perFight(last5A.sigStrLanded, last5A.fightCount)
    const strikeB = perFight(last5B.sigStrLanded, last5B.fightCount)
    const wrestleGap = wrestleA - wrestleB
    scoreA += wrestleGap * 2
    if (Math.abs(wrestleGap) >= 0.4) {
      features.push(wrestleGap > 0 ? 'wrestling_a' : 'wrestling_b')
    }
    const strikeGap = (strikeA - strikeB) / 20
    scoreA += strikeGap
    if (Math.abs(strikeA - strikeB) >= 8) {
      features.push(strikeA > strikeB ? 'volume_a' : 'volume_b')
    }
    if (isApex) {
      scoreA += wrestleGap * 0.7
      if (Math.abs(wrestleGap) >= 0.3) features.push('apex_wrestle')
    }
  } else {
    const subA = perFight(last5A.subWins, last5A.fightCount)
    const subB = perFight(last5B.subWins, last5B.fightCount)
    const koA = perFight(last5A.koWins, last5A.fightCount)
    const koB = perFight(last5B.koWins, last5B.fightCount)
    const subGap = subA - subB
    const koGap = koA - koB
    scoreA += subGap * 1.1
    scoreA += koGap * 0.5
    if (Math.abs(subGap) >= 0.35) features.push(subGap > 0 ? 'finish_sub_a' : 'finish_sub_b')
    if (Math.abs(koGap) >= 0.35) features.push(koGap > 0 ? 'finish_ko_a' : 'finish_ko_b')
  }

  scoreA += (winA - winB) * 1.4

  if (scheduledRounds === 5) {
    const cardio = (distanceA - distanceB) * 0.9
    scoreA += cardio
    if (Math.abs(distanceA - distanceB) >= 0.3) features.push('five_round_cardio')
  }

  if (stanceA === 'Southpaw' && stanceB === 'Orthodox') {
    scoreA += 0.2
    features.push('southpaw_open')
  } else if (stanceB === 'Southpaw' && stanceA === 'Orthodox') {
    scoreA -= 0.2
    features.push('southpaw_open')
  }

  const margin = Math.round(Math.abs(scoreA) * 100) / 100
  if (margin < ROCCO_SIT_MARGIN) {
    return {
      side: 'PASS',
      margin,
      rationale: `Styles too close on last-5 (margin ${margin}).`,
      features: features.length ? features : ['coin_flip'],
    }
  }

  const side = scoreA > 0 ? 'A' : 'B'
  const pick = side === 'A' ? fighterA : fighterB
  const why = features.includes('wrestling_a') || features.includes('wrestling_b')
    ? 'wrestling vs liner'
    : features.includes('volume_a') || features.includes('volume_b')
      ? 'last-5 strike volume'
      : features.includes('finish_sub_a') || features.includes('finish_sub_b') || features.includes('finish_ko_a') || features.includes('finish_ko_b')
        ? 'last-5 finish style'
        : 'last-5 form'
  return {
    side,
    margin,
    rationale: `${pick} (${why}, margin ${margin}).`,
    features,
  }
}
