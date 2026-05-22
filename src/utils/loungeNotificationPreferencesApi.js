/** Lounge per-category push preferences (Phase H3). */

export const LOUNGE_NOTIFICATION_PREF_DEFAULTS = {
  push_replies: true,
  push_mentions: true,
  push_follows: true,
  push_reposts: true,
  push_likes: true,
  push_bookmarks: true,
  push_messages: true,
}

export const LOUNGE_NOTIFICATION_PREF_ROWS = [
  { key: 'push_replies', label: 'Replies & comments' },
  { key: 'push_mentions', label: 'Mentions' },
  { key: 'push_follows', label: 'New followers' },
  { key: 'push_reposts', label: 'Reposts' },
  { key: 'push_likes', label: 'Likes' },
  { key: 'push_bookmarks', label: 'Bookmarks' },
  { key: 'push_messages', label: 'Direct messages', disabled: true },
]

function mergePrefs(row) {
  return {
    ...LOUNGE_NOTIFICATION_PREF_DEFAULTS,
    ...(row || {}),
  }
}

export function isLoungeNotificationPrefsSchemaMissingError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '').toLowerCase()
  if (code === 'PGRST205' || code === '42P01') return true
  if (msg.includes('notification_preferences') && msg.includes('does not exist')) return true
  return false
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchLoungeNotificationPreferences(supabaseClient, viewerUserId) {
  if (!viewerUserId) return { ...LOUNGE_NOTIFICATION_PREF_DEFAULTS }
  const { data, error } = await supabaseClient
    .from('notification_preferences')
    .select('push_replies, push_mentions, push_follows, push_reposts, push_likes, push_bookmarks, push_messages')
    .eq('user_id', viewerUserId)
    .maybeSingle()
  if (error) throw error
  return mergePrefs(data)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @param {Partial<typeof LOUNGE_NOTIFICATION_PREF_DEFAULTS>} patch
 */
export async function upsertLoungeNotificationPreference(supabaseClient, viewerUserId, patch) {
  if (!viewerUserId) return mergePrefs(null)
  const payload = {
    user_id: viewerUserId,
    ...LOUNGE_NOTIFICATION_PREF_DEFAULTS,
    ...patch,
  }
  const { data, error } = await supabaseClient
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('push_replies, push_mentions, push_follows, push_reposts, push_likes, push_bookmarks, push_messages')
    .single()
  if (error) throw error
  return mergePrefs(data)
}
