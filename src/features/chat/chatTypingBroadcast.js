/**
 * Typing indicator via Supabase Realtime broadcast.
 * No DB writes - ephemeral.
 *
 * Channel name: `chat-typing-${roomId}`
 * Event: 'typing'
 * Payload: { userId: string, displayName: string }
 */

/** How long a typing indicator stays visible after the last event (ms). */
const TYPING_TIMEOUT_MS = 3500

/** Debounce for emitting typing events (ms). */
const TYPING_EMIT_DEBOUNCE_MS = 2000

/**
 * Subscribe to typing indicators for a room.
 * Returns a cleanup function.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} viewerUserId - own user id, excluded from displayed indicators
 * @param {(typingUsers: { userId: string, displayName: string }[]) => void} onTypingChanged
 * @returns {{ emit: () => void, cleanup: () => void }}
 */
export function subscribeToTyping(supabase, roomId, viewerUserId, onTypingChanged) {
  /** @type {Map<string, { displayName: string, timerId: ReturnType<typeof setTimeout> }>} */
  const typingMap = new Map()

  const notifyChanged = () => {
    onTypingChanged(
      Array.from(typingMap.entries()).map(([userId, { displayName }]) => ({ userId, displayName }))
    )
  }

  const channel = supabase.channel(`chat-typing-${roomId}`, {
    config: { broadcast: { self: false } },
  })

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { userId, displayName } = payload || {}
      if (!userId || userId === viewerUserId) return

      // Clear existing timeout for this user
      const existing = typingMap.get(userId)
      if (existing?.timerId) clearTimeout(existing.timerId)

      const timerId = setTimeout(() => {
        typingMap.delete(userId)
        notifyChanged()
      }, TYPING_TIMEOUT_MS)

      typingMap.set(userId, { displayName: displayName || 'Someone', timerId })
      notifyChanged()
    })
    .subscribe()

  // Debounced emit helper
  let emitTimer = null
  const emit = (displayName = '') => {
    if (emitTimer) return
    emitTimer = setTimeout(() => {
      emitTimer = null
    }, TYPING_EMIT_DEBOUNCE_MS)
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: viewerUserId, displayName },
    })
  }

  const cleanup = () => {
    if (emitTimer) clearTimeout(emitTimer)
    for (const { timerId } of typingMap.values()) clearTimeout(timerId)
    typingMap.clear()
    supabase.removeChannel(channel)
  }

  return { emit, cleanup }
}
