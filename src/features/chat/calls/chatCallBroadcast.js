/**
 * Ephemeral call signaling via Supabase Realtime broadcast.
 * Channel: `chat-call-${roomId}`
 * Events: invite | accept | decline | end | recording_started | recording_stopping | recording_ready | recording_failed
 */

const CALL_BROADCAST_EVENTS = [
  'invite',
  'accept',
  'decline',
  'end',
  'recording_started',
  'recording_stopping',
  'recording_ready',
  'recording_failed',
]

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

  for (const event of CALL_BROADCAST_EVENTS) {
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
