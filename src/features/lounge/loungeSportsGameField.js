export const LOUNGE_SPORTS_GAME_PIN_MAX = 4

function cleanEventIds(list) {
  const out = []
  const seen = new Set()
  for (const raw of list || []) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= LOUNGE_SPORTS_GAME_PIN_MAX) break
  }
  return out
}

/**
 * Parse `community_feed_posts.sports_game`.
 * Legacy: `{ event_id }` or `{ suppress: true }`.
 * Multi: `{ event_ids: string[] }` (cap {@link LOUNGE_SPORTS_GAME_PIN_MAX}).
 */
export function parseLoungeSportsGameField(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { suppress: false, eventIds: [] }
  }
  if (raw.suppress === true) return { suppress: true, eventIds: [] }
  const fromArray = Array.isArray(raw.event_ids) ? raw.event_ids : null
  if (fromArray) return { suppress: false, eventIds: cleanEventIds(fromArray) }
  const single = String(raw.event_id || raw.id || '').trim()
  return { suppress: false, eventIds: single ? [single] : [] }
}

/**
 * @param {{ suppress?: boolean, eventId?: string, eventIds?: string[] }} input
 */
export function serializeLoungeSportsGameField({ suppress = false, eventId = '', eventIds = null } = {}) {
  if (suppress) return { suppress: true }
  const ids = cleanEventIds(
    Array.isArray(eventIds) && eventIds.length
      ? eventIds
      : eventId
        ? [eventId]
        : [],
  )
  if (!ids.length) return null
  if (ids.length === 1) return { event_id: ids[0], event_ids: ids }
  return { event_ids: ids }
}
