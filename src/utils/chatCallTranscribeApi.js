/**
 * Invoke `chat-call-transcribe` Edge with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function chatCallTranscribeInvoke(supabase, payload) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sign in to view transcripts.')
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) {
      session = refreshed.session
    }
  }

  const { data, error, response } = await supabase.functions.invoke('chat-call-transcribe', {
    body: payload,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    let msg = error.message || 'Transcript request failed.'
    try {
      const text = await response?.clone()?.text()
      const j = text ? JSON.parse(text) : null
      if (j?.error) msg = String(j.error)
      if (j?.link_preview) {
        const err = new Error(msg)
        err.link_preview = j.link_preview
        throw err
      }
    } catch (e) {
      if (e?.link_preview) throw e
    }
    throw new Error(msg)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    const err = new Error(String(data.error))
    if (data.link_preview) err.link_preview = data.link_preview
    throw err
  }
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export function chatTranscribeCallRecording(supabase, messageId, { force = false } = {}) {
  return chatCallTranscribeInvoke(supabase, {
    action: 'transcribe',
    message_id: messageId,
    force: Boolean(force),
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} messageId
 * @param {Record<string, string>} speakerMap speaker index → user_id
 */
export function chatRemapCallTranscriptSpeakers(supabase, messageId, speakerMap) {
  return chatCallTranscribeInvoke(supabase, {
    action: 'remap_speakers',
    message_id: messageId,
    speaker_map: speakerMap,
  })
}
