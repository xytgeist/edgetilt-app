/** Copy for whose books a Stable commit updates (player personal vs backer Stable bankroll). */

export const STABLE_BACKER_BANKROLL_PHRASE = 'Stable backing bankroll'

/** @param {boolean} isStakee */
export function stableCommitBooksPhrase(isStakee) {
  return isStakee
    ? 'personal Poker bankroll and ledger'
    : `${STABLE_BACKER_BANKROLL_PHRASE} and ledger`
}

/** @param {boolean} isStakee @param {boolean} [isSettle] @param {boolean} [isClose] */
export function stableCommitSyncHint(isStakee, isSettle = false, isClose = false) {
  if (isClose) {
    return isStakee
      ? 'Commit & Archive applies this update to your personal Poker bankroll and ledger, then archives this stake.'
      : `Commit & Archive applies this update to your ${STABLE_BACKER_BANKROLL_PHRASE} (and Realized P/L) and ledger, then archives this stake.`
  }
  if (isStakee) {
    return 'Commit applies this update to your personal Poker bankroll and ledger.'
  }
  if (isSettle) {
    return `Commit applies this update to your ${STABLE_BACKER_BANKROLL_PHRASE} (and Realized P/L) and ledger.`
  }
  return `Commit applies this update to your ${STABLE_BACKER_BANKROLL_PHRASE} and ledger.`
}
