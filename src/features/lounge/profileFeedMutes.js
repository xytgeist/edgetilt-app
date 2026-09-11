/**
 * Authors the viewer should not see in Lounge: muted + blocked (either direction).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @returns {Promise<Set<string>>}
 */
export async function fetchHiddenAuthorUserIds(supabaseClient, viewerUserId) {
  const viewerId = String(viewerUserId || '').trim()
  if (!viewerId) return new Set()
  const [muteRes, blockRes] = await Promise.all([
    supabaseClient.from('profile_feed_mutes').select('muted_user_id').eq('muter_id', viewerId),
    supabaseClient
      .from('blocks')
      .select('blocker_id,blocked_id')
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
  ])
  if (muteRes.error) throw muteRes.error
  if (blockRes.error) throw blockRes.error
  const hidden = new Set((muteRes.data || []).map((row) => String(row.muted_user_id)))
  for (const row of blockRes.data || []) {
    const blocker = String(row.blocker_id || '')
    const blocked = String(row.blocked_id || '')
    if (blocker === viewerId && blocked) hidden.add(blocked)
    if (blocked === viewerId && blocker) hidden.add(blocker)
  }
  hidden.delete(viewerId)
  return hidden
}

/** @deprecated use fetchHiddenAuthorUserIds */
export async function fetchProfileFeedMutedUserIds(supabaseClient, viewerUserId) {
  return fetchHiddenAuthorUserIds(supabaseClient, viewerUserId)
}

/**
 * @param {unknown[]} posts
 * @param {Set<string>} mutedUserIds
 */
export function filterCommunityPostsByMutedAuthors(posts, mutedUserIds) {
  const list = posts || []
  if (!mutedUserIds?.size) return list
  return list.filter((row) => !mutedUserIds.has(String(row?.user_id || '')))
}

/**
 * @param {unknown[]} rows
 * @param {Set<string>} hiddenUserIds
 * @param {string} [userIdKey]
 */
export function filterRowsByHiddenAuthors(rows, hiddenUserIds, userIdKey = 'user_id') {
  const list = rows || []
  if (!hiddenUserIds?.size) return list
  return list.filter((row) => !hiddenUserIds.has(String(row?.[userIdKey] || '')))
}
