/** First paint: fewer posts to hydrate before the tab feels ready. */
export const LOUNGE_PROFILE_POST_INITIAL_LIMIT = 10

/** Page size for profile Posts tab infinite scroll (server RPC caps at 60). */
export const LOUNGE_PROFILE_POST_PAGE_SIZE = 20

/** Max rows per `lounge_profile_feed_posts_for_viewer` call (Postgres RPC). */
export const LOUNGE_PROFILE_POST_RPC_MAX = 60

/** Page size for profile Replies / Likes / Bookmarks tabs. */
export const LOUNGE_PROFILE_TAB_PAGE_SIZE = 20

const PROFILE_SELECT_FULL =
  'user_id,handle,display_name,avatar_url,bio,about_me,banner_url,location,category_pills,created_at,role,handle_changed_at,is_og'

const PROFILE_SELECT_CORE =
  'user_id,handle,display_name,avatar_url,bio,created_at,role,handle_changed_at,is_og'

const PROFILE_POST_SELECT =
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,profile_pinned_at,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url'

const PROFILE_POST_SELECT_LEGACY =
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url'

/** Profile Posts tab: profile pin first, then newest. */
export function sortLoungeProfilePosts(posts) {
  return [...(Array.isArray(posts) ? posts : [])].sort((a, b) => {
    const ap = a?.profile_pinned_at ? Date.parse(a.profile_pinned_at) : 0
    const bp = b?.profile_pinned_at ? Date.parse(b.profile_pinned_at) : 0
    const aPin = Number.isFinite(ap) && ap > 0 ? ap : 0
    const bPin = Number.isFinite(bp) && bp > 0 ? bp : 0
    if (aPin !== bPin) return bPin - aPin
    const ac = a?.created_at ? Date.parse(a.created_at) : 0
    const bc = b?.created_at ? Date.parse(b.created_at) : 0
    if (ac !== bc) return bc - ac
    return String(b?.id || '').localeCompare(String(a?.id || ''))
  })
}

/**
 * Apply a profile-pin toggle locally (clears other pins for the author when pinning).
 * @param {object[]} posts
 * @param {string} postId
 * @param {string | null} profilePinnedAt
 */
export function applyLoungeProfilePinToPosts(posts, postId, profilePinnedAt) {
  const id = String(postId || '').trim()
  if (!id) return sortLoungeProfilePosts(posts)
  const pinnedAt = profilePinnedAt ? String(profilePinnedAt) : null
  const next = (Array.isArray(posts) ? posts : []).map((p) => {
    if (!p?.id) return p
    if (String(p.id) === id) return { ...p, profile_pinned_at: pinnedAt }
    if (pinnedAt && p.profile_pinned_at) return { ...p, profile_pinned_at: null }
    return p
  })
  return sortLoungeProfilePosts(next)
}

/** Drop a post from a profile timeline list (delete / discard). */
export function removeLoungeProfilePostFromPosts(posts, postId) {
  const id = String(postId || '').trim()
  if (!id) return Array.isArray(posts) ? posts : []
  return (Array.isArray(posts) ? posts : []).filter((p) => String(p?.id || '') !== id)
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
  { limit = LOUNGE_PROFILE_POST_PAGE_SIZE, offset = 0 } = {},
) {
  const uid = String(userId || '').trim()
  if (!uid) {
    return { posts: [], postsErr: 'Missing profile id.', hasMore: false }
  }

  const safeLimit = Math.max(1, Math.min(limit, LOUNGE_PROFILE_POST_RPC_MAX))
  const from = Math.max(0, offset)

  const { data: postRows, error: postsErr } = await supabaseClient.rpc(
    'lounge_profile_feed_posts_for_viewer',
    {
      p_profile_user_id: uid,
      p_limit: safeLimit,
      p_offset: from,
    },
  )

  const rows = postRows || []
  const hydrated =
    typeof hydratePosts === 'function' ? await hydratePosts(rows) : rows

  return {
    posts: sortLoungeProfilePosts(hydrated),
    postsErr: postsErr?.message || '',
    hasMore: rows.length >= safeLimit,
  }
}

/** Merge extra profile posts without losing pin-first order. */
export function mergeLoungeProfilePosts(existing, more) {
  const seen = new Set()
  const merged = []
  for (const row of [...(existing || []), ...(more || [])]) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return sortLoungeProfilePosts(merged)
}

/**
 * Profile row + first post page (for nested / overlay loaders that update once).
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
  const { posts, postsErr, hasMore } = await fetchLoungeProfilePosts(supabaseClient, userId, hydratePosts, {
    limit: initialPostLimit,
    offset: 0,
  })

  return {
    profile,
    posts,
    postsHasMore: hasMore,
    postsErr: postsErr || profileErr || '',
  }
}
