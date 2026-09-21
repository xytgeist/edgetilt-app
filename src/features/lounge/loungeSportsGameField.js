export function parseLoungeSportsGameField(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { suppress: false, eventId: null }
  }
  if (raw.suppress === true) return { suppress: true, eventId: null }
  const eventId = String(raw.event_id || raw.id || '').trim()
  return { suppress: false, eventId: eventId || null }
}

export function serializeLoungeSportsGameField({ suppress = false, eventId = '' } = {}) {
  if (suppress) return { suppress: true }
  const id = String(eventId || '').trim()
  if (id) return { event_id: id }
  return null
}
