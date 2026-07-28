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
 * Leave the call. Group: only this participant. DM (or last group member): ends the call.
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
