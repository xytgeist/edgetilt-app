import { extractFirstUrlFromText } from './linkifyText.jsx'

/**
 * Invoke `lounge-link-unfurl` Edge function with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function loungeLinkPreviewInvoke(supabase, payload) {
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const { data, error } = await supabase.functions.invoke('lounge-link-unfurl', {
    body: payload,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error || (data && typeof data === 'object' && data.error)) {
    return null
  }
  return data
}

/**
 * Unfurl and attach preview to a chat message, feed post, or feed comment.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ entityType: 'chat_message'|'feed_post'|'feed_comment', entityId: string, text: string }} opts
 * @returns {Promise<object|null>}
 */
export async function attachLinkPreview(supabase, { entityType, entityId, text }) {
  if (!entityId || !text || !extractFirstUrlFromText(text)) return null
  const data = await loungeLinkPreviewInvoke(supabase, {
    action: 'attach',
    entity_type: entityType,
    entity_id: entityId,
    text,
  })
  return data?.preview ?? null
}
