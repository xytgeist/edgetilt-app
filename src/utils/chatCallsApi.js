/**
 * Invoke `chat-calls` Edge with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function chatCallsInvoke(supabase, payload) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sign in to use calling.')
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) {
      session = refreshed.session
    }
  }

  const { data, error, response } = await supabase.functions.invoke('chat-calls', {
    body: payload,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    let msg = error.message || 'Call request failed.'
    try {
      const text = await response?.clone()?.text()
      const j = text ? JSON.parse(text) : null
      if (j?.error) msg = String(j.error)
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatStartCall(supabase, roomId, mediaMode = 'audio') {
  return chatCallsInvoke(supabase, {
    action: 'start_call',
    room_id: roomId,
    media_mode: mediaMode,
  })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatAcceptCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'accept_call', call_id: callId })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatJoinCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'join_call', call_id: callId })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatDeclineCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'decline_call', call_id: callId })
}

/**
 * Leave the call. Group: only this participant if 2+ remain after leave.
 * DM or when ≤1 would remain: ends the call for everyone.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function chatLeaveCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'leave_call', call_id: callId })
}

/**
 * Force-end the call for everyone (prefer `chatLeaveCall` for hangup).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function chatEndCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'end_call', call_id: callId })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatGetCall(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'get_call', call_id: callId })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatStartRecording(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'start_recording', call_id: callId })
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatStopRecording(supabase, callId) {
  return chatCallsInvoke(supabase, { action: 'stop_recording', call_id: callId })
}

/** Manual RoomComposite hard cap (must match Edge MAX_RECORDING_SECONDS). */
export const CHAT_CALL_RECORDING_MAX_SECONDS = 600

/**
 * Open ringing/active call for a room (member RLS on `chat_calls`).
 * Includes active participant ids/count (rows with `left_at` null).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roomId
 */
export async function chatFetchActiveRoomCall(supabase, roomId) {
  const id = String(roomId || '').trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('chat_calls')
    .select(
      'id, chat_room_id, kind, status, started_by, started_at, answered_at, media_mode, chat_call_participants(user_id, left_at, joined_at)',
    )
    .eq('chat_room_id', id)
    .in('status', ['ringing', 'active'])
    .maybeSingle()
  if (error) throw new Error(error.message || 'Could not load active call.')
  if (!data) return null
  const parts = Array.isArray(data.chat_call_participants) ? data.chat_call_participants : []
  const activeParts = parts
    .filter((p) => !p?.left_at && p?.user_id)
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(String(a.joined_at || '')) || 0
      const tb = Date.parse(String(b.joined_at || '')) || 0
      return ta - tb
    })
  const { chat_call_participants: _parts, ...row } = data
  return {
    ...row,
    active_participant_count: activeParts.length,
    active_participant_ids: activeParts.map((p) => String(p.user_id)),
  }
}

