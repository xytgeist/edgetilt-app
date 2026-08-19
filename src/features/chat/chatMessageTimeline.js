/**
 * Chronological ordering for chat timeline rows (messages + prep-job fakes).
 * Tie-break on id so equal timestamps stay stable.
 */
export function compareChatMessagesChronological(a, b) {
  const ta = new Date(a?.created_at || 0).getTime()
  const tb = new Date(b?.created_at || 0).getTime()
  if (ta !== tb) return ta - tb
  return String(a?.id || '').localeCompare(String(b?.id || ''))
}

/** @template T */
export function sortChatMessagesChronological(messages) {
  return [...messages].sort(compareChatMessagesChronological)
}

/** Compact weekday + date for the pill under the room-name bubble (`Tue, Aug 18`). */
export function formatChatHeaderDatePillLabel(now = new Date()) {
  if (Number.isNaN(now.getTime())) return ''
  return now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
