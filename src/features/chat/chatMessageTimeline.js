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

function startOfLocalDayMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Weekday + date for the pill under the room-name bubble.
 * Empty when `iso` is today (or missing) ... today is implied.
 */
export function formatChatHeaderDatePillLabel(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || Number.isNaN(now.getTime())) return ''
  if (startOfLocalDayMs(d) >= startOfLocalDayMs(now)) return ''
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
