/** First paint: fewer posts to hydrate before the tab feels ready. */
export const LOUNGE_PROFILE_POST_INITIAL_LIMIT = 10

/** Max posts kept on the profile Posts tab after background fill. */
export const LOUNGE_PROFILE_POST_MAX_LIMIT = 30

const PROFILE_SELECT_FULL =
  'user_id,handle,display_name,avatar_url,bio,about_me,banner_url,created_at,role,handle_changed_at,is_og'

const PROFILE_SELECT_CORE =
  'user_id,handle,display_name,avatar_url,bio,created_at,role,handle_changed_at,is_og'

const PROFILE_POST_SELECT =
  'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'

function profilePostsQuery(supabaseClient, userId) {
  return supabaseClient
    .from('community_feed_posts')
    .select(PROFILE_POST_SELECT)
    .eq('user_id', userId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {object} [profileStub]
 */
export async function fetchLoungeProfileRow(supabaseClient, userId, profileStub = {}) {
  const uid = String(userId || '').trim()
  const stub = profileStub && typeof profileStub === 'object' ? profileStub : {}
  if (!uid) {
    return { profile: { user_id: uid, ...stub }, profileErr: 'Missing profile id.' }
  }

  let res = await supabaseClient.from('profiles').select(PROFILE_SELECT_FULL).eq('user_id', uid).maybeSingle()
  if (res.error) {
    const msg = String(res.error.message || '')
    if (/column/i.test(msg) && /does not exist/i.test(msg)) {
      res = await supabaseClient.from('profiles').select(PROFILE_SELECT_CORE).eq('user_id', uid).maybeSingle()
    }
  }

  return {
    profile: {
      user_id: uid,
      ...stub,
      ...(res.data || {}),
    },
    profileErr: res.error?.message || '',
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {(rows: object[]) => Promise<object[]>} hydratePosts
 * @param {{ limit?: number, offset?: number }} [options]
 */
export async function fetchLoungeProfilePosts(
  supabaseClient,
  userId,
  hydratePosts,
  { limit = LOUNGE_PROFILE_POST_INITIAL_LIMIT, offset = 0 } = {},
) {
  const uid = String(userId || '').trim()
  if (!uid) {
    return { posts: [], postsErr: 'Missing profile id.' }
  }

  const safeLimit = Math.max(0, Math.min(limit, LOUNGE_PROFILE_POST_MAX_LIMIT))
  if (safeLimit === 0) {
    return { posts: [], postsErr: '' }
  }

  const from = Math.max(0, offset)
  const to = from + safeLimit - 1

  const { data: postRows, error: postsErr } = await profilePostsQuery(supabaseClient, uid).range(from, to)

  const hydrated =
    typeof hydratePosts === 'function' ? await hydratePosts(postRows || []) : postRows || []

  return {
    posts: hydrated,
    postsErr: postsErr?.message || '',
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {(rows: object[]) => Promise<object[]>} hydratePosts
 * @param {number} alreadyLoaded
 */
export async function loadLoungeProfileScreenPostsRemainder(
  supabaseClient,
  userId,
  hydratePosts,
  alreadyLoaded,
) {
  const loaded = Math.max(0, alreadyLoaded)
  const remaining = LOUNGE_PROFILE_POST_MAX_LIMIT - loaded
  if (remaining <= 0) {
    return { posts: [], postsErr: '' }
  }
  return fetchLoungeProfilePosts(supabaseClient, userId, hydratePosts, {
    limit: remaining,
    offset: loaded,
  })
}

/**
 * Profile row + first post page (for nested / overlay loaders that update once).
 * Prefer {@link fetchLoungeProfileRow} + {@link fetchLoungeProfilePosts} when the sheet is already visible.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @param {object} [profileStub]
 * @param {(rows: object[]) => Promise<object[]>} hydratePosts
 * @param {{ initialPostLimit?: number }} [options]
 */
export async function loadLoungeProfileScreenData(
  supabaseClient,
  userId,
  profileStub,
  hydratePosts,
  { initialPostLimit = LOUNGE_PROFILE_POST_INITIAL_LIMIT } = {},
) {
  const { profile, profileErr } = await fetchLoungeProfileRow(supabaseClient, userId, profileStub)
  const { posts, postsErr } = await fetchLoungeProfilePosts(supabaseClient, userId, hydratePosts, {
    limit: initialPostLimit,
  })

  return {
    profile,
    posts,
    postsErr: postsErr || profileErr || '',
  }
}
