const PROFILE_CORE_SELECT =
  'user_id,handle,display_name,avatar_url,bio,created_at,role,handle_changed_at,is_og'

const PROFILE_POST_SELECT =
  'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {object} [profileStub]
 * @param {(rows: object[]) => Promise<object[]>} hydratePosts
 */
export async function loadLoungeProfileScreenData(supabaseClient, userId, profileStub, hydratePosts) {
  const uid = String(userId || '').trim()
  if (!uid) {
    return { profile: null, posts: [], postsErr: 'Missing profile id.' }
  }

  const stub = profileStub && typeof profileStub === 'object' ? profileStub : {}

  const [{ data: postRows, error: postsErr }, coreProfile] = await Promise.all([
    supabaseClient
      .from('community_feed_posts')
      .select(PROFILE_POST_SELECT)
      .eq('user_id', uid)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30),
    supabaseClient.from('profiles').select(PROFILE_CORE_SELECT).eq('user_id', uid).maybeSingle(),
  ])

  const mergedProfile = {
    user_id: uid,
    ...stub,
    ...(coreProfile.data || {}),
  }

  if (!coreProfile.error && coreProfile.data) {
    const ext = await supabaseClient
      .from('profiles')
      .select('about_me, banner_url')
      .eq('user_id', uid)
      .maybeSingle()
    if (!ext.error && ext.data) {
      Object.assign(mergedProfile, ext.data)
    }
  }

  const hydrated = typeof hydratePosts === 'function' ? await hydratePosts(postRows || []) : postRows || []

  return {
    profile: mergedProfile,
    posts: hydrated,
    postsErr: postsErr?.message || '',
  }
}
