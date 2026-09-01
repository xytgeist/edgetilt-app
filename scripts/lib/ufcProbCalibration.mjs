/**
 * Skill-gap → P(A wins) calibration for UFC backtests (v0.6).
 * Fit on fights strictly before the test window to avoid leakage.
 */
import { normalizeName } from './ufcCsvParser.mjs'
import { computeMatchupSkillGap } from './ufcSkillRanker.mjs'

export const SKILL_GAP_BIN_EDGES = [-Infinity, -2, -1.25, -0.75, -0.35, 0, 0.35, 0.75, 1.25, 2, Infinity]

/** @param {import('./ufcCsvParser.mjs').UfcFightRow} fight */
export function winnerSide(fight) {
  if (normalizeName(fight.winner) === normalizeName(fight.fighterA)) return 'A'
  if (normalizeName(fight.winner) === normalizeName(fight.fighterB)) return 'B'
  return null
}

function binIndex(gap, edges) {
  for (let i = 0; i < edges.length - 1; i += 1) {
    if (gap >= edges[i] && gap < edges[i + 1]) return i
  }
  return Math.max(0, edges.length - 2)
}

/**
 * @param {import('./ufcCsvParser.mjs').UfcFightRow[]} fights chronological, snapshots applied
 * @param {{ binEdges?: number[], smoothing?: number }} [opts]
 */
export function fitProbCalibration(fights, opts = {}) {
  const binEdges = opts.binEdges ?? SKILL_GAP_BIN_EDGES
  const alpha = opts.smoothing ?? 2
  /** @type {{ winsA: number, total: number, lo: number, hi: number }[]} */
  const bins = []

  for (let i = 0; i < binEdges.length - 1; i += 1) {
    bins.push({ winsA: 0, total: 0, lo: binEdges[i], hi: binEdges[i + 1] })
  }

  let graded = 0
  for (const fight of fights) {
    if (fight.skippedForDebut) continue
    const actual = winnerSide(fight)
    if (!actual) continue

    const gap = computeMatchupSkillGap(fight.modelA, fight.modelB)
    const idx = binIndex(gap, binEdges)
    bins[idx].total += 1
    if (actual === 'A') bins[idx].winsA += 1
    graded += 1
  }

  let globalWinsA = 0
  let globalTotal = 0
  for (const b of bins) {
    globalWinsA += b.winsA
    globalTotal += b.total
  }
  const globalRate = globalTotal ? globalWinsA / globalTotal : 0.5

  return {
    bins,
    binEdges,
    globalRate,
    graded,
    lookupProbA(gap) {
      const idx = binIndex(gap, binEdges)
      const b = bins[idx]
      if (!b.total) return globalRate
      return (b.winsA + alpha) / (b.total + 2 * alpha)
    },
  }
}

/**
 * Fights with eventDate strictly before `beforeDate` (YYYY-MM-DD).
 * @param {import('./ufcCsvParser.mjs').UfcFightRow[]} allFights
 */
export function fightsBeforeDate(allFights, beforeDate) {
  return allFights.filter((f) => f.eventDate < beforeDate)
}
