/** Game Hub live chat (`lounge_game_chat_messages`) … separate from Lounge posts. */

const TABLE = 'lounge_game_chat_messages'
const SELECT = 'id, event_id, user_id, body, created_at, profile:profiles(handle, display_name, avatar_url)'

export const GAME_CHAT_MAX_CHARS = 280
export const GAME_CHAT_PAGE = 80

/**
 * Newest page for a game, returned oldest → newest for chat rendering.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} eventId
 */
export async function fetchGameChatMessages(supabaseClient, eventId) {
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select(SELECT)
    .eq('event_id', String(eventId))
    .order('created_at', { ascending: false })
    .limit(GAME_CHAT_PAGE)
  if (error) throw error
  return (data || []).slice().reverse()
}

/** Single row with profile (realtime INSERT payloads have no join). */
export async function fetchGameChatMessage(supabaseClient, id) {
  const { data, error } = await supabaseClient.from(TABLE).select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data || null
}

export async function sendGameChatMessage(supabaseClient, eventId, body) {
  const text = String(body || '').trim().slice(0, GAME_CHAT_MAX_CHARS)
  if (!text) return null
  const { data, error } = await supabaseClient
    .from(TABLE)
    .insert({ event_id: String(eventId), body: text })
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

export async function deleteGameChatMessage(supabaseClient, id) {
  const { error } = await supabaseClient.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

/**
 * Live INSERT / DELETE for one game room.
 * @returns {() => void} unsubscribe
 */
export function subscribeGameChat(supabaseClient, eventId, { onInsert, onDelete }) {
  const channel = supabaseClient
    .channel(`lounge-game-chat:${eventId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE, filter: `event_id=eq.${eventId}` },
      (payload) => onInsert?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: TABLE },
      (payload) => onDelete?.(payload.old),
    )
    .subscribe()
  return () => {
    void supabaseClient.removeChannel(channel)
  }
}
