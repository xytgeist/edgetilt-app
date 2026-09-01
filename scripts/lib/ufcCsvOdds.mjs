/**
 * Attach embedded CSV moneyline odds (Kaggle f_1_odds / f_2_odds) to fights.
 */
import { parseMarketOdds } from './ufcOddsMath.mjs'

/** @param {import('./ufcCsvParser.mjs').UfcFightRow[]} fights */
export function attachCsvOdds(fights) {
  let attached = 0
  let missed = 0

  for (const fight of fights) {
    const csv = fight.csvOdds
    if (csv?.oddsA && csv?.oddsB) {
      fight.marketOdds = {
        oddsA: csv.oddsA,
        oddsB: csv.oddsB,
        book: 'csv',
        source: 'kaggle-csv',
      }
      attached += 1
    } else {
      missed += 1
    }
  }

  return { attached, missed, coverage: fights.length ? attached / fights.length : 0 }
}

/** @param {string} rawF1 @param {string} rawF2 */
export function parseCsvOddsPair(rawF1, rawF2) {
  const oddsF1 = parseMarketOdds(rawF1)
  const oddsF2 = parseMarketOdds(rawF2)
  if (!oddsF1 || !oddsF2) return null
  return { oddsF1, oddsF2 }
}
