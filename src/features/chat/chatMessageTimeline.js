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

/** Local calendar day key (`YYYY-MM-DD`) for grouping date pills. */
export function chatMessageLocalDayKey(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfLocalDayMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Compact day/date label for the chat timeline pill.
 * Today / Yesterday / weekday this week / `Aug 17` / `Aug 17, 2025`.
 */
export function formatChatDayPillLabel(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || Number.isNaN(now.getTime())) return ''
  const today = startOfLocalDayMs(now)
  const then = startOfLocalDayMs(d)
  const diffDays = Math.round((today - then) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays >= 2 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
