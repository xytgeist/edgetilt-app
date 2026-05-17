const PROFILE_FOLLOW_LIST_SELECT =
  'user_id,handle,display_name,avatar_url,bio,about_me,location,role,is_og'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} profileUserId Profile whose list is shown
 * @param {'following' | 'followers'} tab
 */
export async function fetchProfileFollowListProfiles(supabaseClient, profileUserId, tab) {
  const uid = String(profileUserId || '').trim()
  if (!uid) return { profiles: [], error: null }

  const edgeCol = tab === 'following' ? 'following_id' : 'follower_id'
  const filterCol = tab === 'following' ? 'follower_id' : 'following_id'

  const { data: edges, error: edgeErr } = await supabaseClient
    .from('profile_follows')
    .select(`${edgeCol}, created_at`)
    .eq(filterCol, uid)
    .order('created_at', { ascending: false })

  if (edgeErr) return { profiles: [], error: edgeErr }

  const ids = [...new Set((edges || []).map((r) => r[edgeCol]).filter(Boolean))]
  if (ids.length === 0) return { profiles: [], error: null }

  const { data: profiles, error: profErr } = await supabaseClient
    .from('profiles')
    .select(PROFILE_FOLLOW_LIST_SELECT)
    .in('user_id', ids)

  if (profErr) return { profiles: [], error: profErr }

  const byId = new Map((profiles || []).map((p) => [p.user_id, p]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
  return { profiles: ordered, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @param {string[]} targetUserIds
 */
export async function fetchViewerFollowingAmong(supabaseClient, viewerUserId, targetUserIds) {
  const viewer = String(viewerUserId || '').trim()
  const ids = [...new Set((targetUserIds || []).filter(Boolean))]
  if (!viewer || ids.length === 0) return new Set()

  const { data, error } = await supabaseClient
    .from('profile_follows')
    .select('following_id')
    .eq('follower_id', viewer)
    .in('following_id', ids)

  if (error) return new Set()
  return new Set((data || []).map((r) => r.following_id).filter(Boolean))
}

/**
 * Row users who follow the viewer (for "Follows you" on list cards).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @param {string[]} rowUserIds
 */
export async function fetchUsersFollowingViewerAmong(supabaseClient, viewerUserId, rowUserIds) {
  const viewer = String(viewerUserId || '').trim()
  const ids = [...new Set((rowUserIds || []).filter((id) => id && id !== viewer))]
  if (!viewer || ids.length === 0) return new Set()

  const { data, error } = await supabaseClient
    .from('profile_follows')
    .select('follower_id')
    .eq('following_id', viewer)
    .in('follower_id', ids)

  if (error) return new Set()
  return new Set((data || []).map((r) => r.follower_id).filter(Boolean))
}
