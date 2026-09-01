/**
 * Walk-forward skill ranker for UFC matchups (v0.6).
 * Scalar score from point-in-time snapshots ... used for calibration buckets, not raw ML probs.
 */

/** @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} f */
export function computeSkillScore(f) {
  const netStrike = f.slpm - f.sapm
  const tdScore = f.td_avg * (f.td_acc / 100) * (1 + f.td_def / 200)
  const finish = f.finish_rate / 100
  const accBonus = (f.str_acc - 45) * 0.02
  return netStrike * 1.0 + tdScore * 0.4 + finish * 0.25 + accBonus
}

/** @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fA @param {import('./ufcCsvParser.mjs').UfcFighterSnapshot} fB */
export function computeMatchupSkillGap(fA, fB) {
  return computeSkillScore(fA) - computeSkillScore(fB)
}
