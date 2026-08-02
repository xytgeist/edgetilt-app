/** Copy helpers for Poker Stable activity notifications. */

/** @param {'periodic' | 'close' | string | null | undefined} settleKind */
export function pokerStableSettlementKindLabel(settleKind) {
  if (settleKind === 'close') return 'Close settlement'
  if (settleKind === 'periodic') return 'Periodic settlement'
  return 'Settlement'
}

/** @param {object | null | undefined} request */
export function pokerStableSettlementRequestStatusLabel(request) {
  const status = request?.status
  if (status === 'accepted') return 'Confirmed'
  if (status === 'rejected') return 'Denied'
  if (status === 'pending') return 'Pending confirmation'
  return status || '—'
}

/** True when viewer must confirm or deny this settlement proposal. */
export function pokerStableViewerCanRespondToSettlement(request, viewerUserId) {
  if (!request || !viewerUserId || request.status !== 'pending') return false
  const votes = Array.isArray(request.votes) ? request.votes : []
  return votes.some(
    (vote) => vote.user_id === viewerUserId && vote.status === 'pending',
  )
}
