/**
 * Ephemeral call signaling via Supabase Realtime broadcast.
 * Channel: `chat-call-${roomId}`
 * Events: invite | accept | decline | end
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} viewerUserId
 * @param {(event: string, payload: Record<string, unknown>) => void} onEvent
 */
export function subscribeToChatCallBroadcast(supabase, roomId, viewerUserId, onEvent) {
  const channel = supabase.channel(`chat-call-${roomId}`, {
    config: { broadcast: { self: false } },
  })

  for (const event of ['invite', 'accept', 'decline', 'end']) {
    channel.on('broadcast', { event }, ({ payload }) => {
      const p = payload && typeof payload === 'object' ? payload : {}
      if (p.fromUserId && p.fromUserId === viewerUserId) return
      onEvent(event, /** @type {Record<string, unknown>} */ (p))
    })
  }

  channel.subscribe()

  const emit = (event, payload = {}) => {
    channel.send({
      type: 'broadcast',
      event,
      payload: { ...payload, fromUserId: viewerUserId },
    })
  }

  const cleanup = () => {
    supabase.removeChannel(channel)
  }

  return { emit, cleanup }
}
