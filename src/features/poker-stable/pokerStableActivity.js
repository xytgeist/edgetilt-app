/** Copy helpers for Poker Stable activity notifications. */

/** @param {'periodic' | 'close' | string | null | undefined} settleKind */
export function pokerStableSettlementKindLabel(settleKind) {
  if (settleKind === 'close') return 'Close settlement'
  if (settleKind === 'periodic') return 'Periodic settlement'
  return 'Settlement'
}

/** @param {'topup' | 'reduction' | 'periodic_settle' | 'close_settle' | string | null | undefined} eventKind */
export function pokerStableCommitEventLabel(eventKind) {
  if (eventKind === 'topup') return 'Re-up'
  if (eventKind === 'reduction') return 'Reduce stake'
  if (eventKind === 'close_settle') return 'Close settlement'
  if (eventKind === 'periodic_settle') return 'Periodic settlement'
  return 'Stake update'
}

/** @param {object | null | undefined} commit */
export function pokerStableCommitSummaryLine(commit) {
  if (!commit) return ''
  if (commit.summary) return String(commit.summary)
  return pokerStableCommitEventLabel(commit.event_kind)
}
