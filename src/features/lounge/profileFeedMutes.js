/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @returns {Promise<Set<string>>}
 */
export async function fetchProfileFeedMutedUserIds(supabaseClient, viewerUserId) {
  const viewerId = String(viewerUserId || '').trim()
  if (!viewerId) return new Set()
  const { data, error } = await supabaseClient
    .from('profile_feed_mutes')
    .select('muted_user_id')
    .eq('muter_id', viewerId)
  if (error) throw error
  return new Set((data || []).map((row) => String(row.muted_user_id)))
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
