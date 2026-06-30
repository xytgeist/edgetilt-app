import { COMMUNITY_FEED_SELECT } from '../../utils/loungeFeedScope.js'
import { loungeSearchErrorMessage } from '../../utils/loungeSearchSortPref.js'

/** Minimum query length enforced by `lounge_search` RPC (server + client). */
export const LOUNGE_SEARCH_MIN_CHARS = 2

/** Max query length enforced by `lounge_normalize_search_term` (server + client). */
export const LOUNGE_SEARCH_MAX_CHARS = 128

export const LOUNGE_SEARCH_SORT = {
  ENGAGEMENT: 'engagement',
  RECENT: 'recent',
}

/** Default page sizes - must stay aligned with `lounge_search` RPC defaults. */
export const LOUNGE_SEARCH_PAGE = {
  POSTS: 20,
  PROFILES: 20,
  COMMENTS: 15,
}

const SEARCH_DEBOUNCE_MS = 300

const PROFILE_SEARCH_SELECT = 'user_id,handle,display_name,avatar_url,role,is_og'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} query
 * @param {{
 *   sort?: string,
 *   postsLimit?: number,
 *   postsOffset?: number,
 *   profilesLimit?: number,
 *   profilesOffset?: number,
 *   commentsLimit?: number,
 *   commentsOffset?: number,
 *   categorySlugs?: string[] | null,
 * }} [opts]
 */
export async function loungeSearch(supabaseClient, query, opts = {}) {
  const {
    sort = LOUNGE_SEARCH_SORT.ENGAGEMENT,
    postsLimit = LOUNGE_SEARCH_PAGE.POSTS,
    postsOffset = 0,
    profilesLimit = LOUNGE_SEARCH_PAGE.PROFILES,
    profilesOffset = 0,
    commentsLimit = LOUNGE_SEARCH_PAGE.COMMENTS,
    commentsOffset = 0,
    categorySlugs = null,
  } = opts

  const slugs = Array.isArray(categorySlugs) && categorySlugs.length ? categorySlugs : null

  const { data, error } = await supabaseClient.rpc('lounge_search', {
    p_query: query,
    p_sort: sort,
    p_posts_limit: postsLimit,
    p_posts_offset: postsOffset,
    p_profiles_limit: profilesLimit,
    p_profiles_offset: profilesOffset,
    p_comments_limit: commentsLimit,
    p_comments_offset: commentsOffset,
    p_category_slugs: slugs,
  })
  if (error) throw error

  const payload = data && typeof data === 'object' ? data : {}
  const pagination = payload.pagination && typeof payload.pagination === 'object' ? payload.pagination : {}

  return {
    posts: Array.isArray(payload.posts) ? payload.posts : [],
    profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
    comments: Array.isArray(payload.comments) ? payload.comments : [],
    pagination: {
      postsHasMore: pagination.posts_has_more === true,
      profilesHasMore: pagination.profiles_has_more === true,
      commentsHasMore: pagination.comments_has_more === true,
    },
  }
}

/** @param {unknown} err */
export function formatLoungeSearchError(err) {
  const raw =
    (err && typeof err === 'object' && 'message' in err && String(err.message)) ||
    (typeof err === 'string' ? err : '') ||
    'Search failed.'
  return loungeSearchErrorMessage(raw)
}

/**
 * Attach hydrated parent posts + comment author / reply-to profiles for search RPC rows.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {(rows: object[]) => Promise<object[]>} hydratePosts - same as `hydrateCommunityPosts`
 * @param {object[]} commentRows
 */
export async function hydrateLoungeSearchCommentResults(supabaseClient, hydratePosts, commentRows) {
  const comments = commentRows || []
  if (!comments.length) return []

  const postIds = [...new Set(comments.map((c) => c.post_id).filter(Boolean))]
  const { data: postRows, error: postErr } = await supabaseClient
    .from('community_feed_posts')
    .select(COMMUNITY_FEED_SELECT)
    .in('id', postIds)
    .is('hidden_at', null)
  if (postErr) throw postErr

  const hydratedPosts =
    postRows?.length && typeof hydratePosts === 'function' ? await hydratePosts(postRows) : postRows || []
  const postById = new Map(hydratedPosts.map((p) => [String(p.id), p]))

  const parentCommentIds = [
    ...new Set(comments.filter((c) => c.parent_id).map((c) => c.parent_id).filter(Boolean)),
  ]
  let parentCommentById = {}
  if (parentCommentIds.length) {
    const { data, error } = await supabaseClient
      .from('feed_comments')
      .select('id,user_id')
      .in('id', parentCommentIds)
      .is('hidden_at', null)
    if (error) throw error
    parentCommentById = Object.fromEntries((data || []).map((r) => [String(r.id), r]))
  }

  const profileUserIds = new Set(comments.map((c) => c.user_id).filter(Boolean))
  for (const c of comments) {
    const parentId = c.parent_id ? String(c.parent_id) : ''
    if (parentId && parentCommentById[parentId]?.user_id) {
      profileUserIds.add(parentCommentById[parentId].user_id)
    }
  }

  let profileBy = {}
  if (profileUserIds.size) {
    const pr = await supabaseClient.from('profiles').select(PROFILE_SEARCH_SELECT).in('user_id', [...profileUserIds])
    if (!pr.error && pr.data) profileBy = Object.fromEntries(pr.data.map((p) => [p.user_id, p]))
  }

  return comments
    .map((comment) => {
      const post = postById.get(String(comment.post_id))
      if (!post?.id) return null
      const parentId = comment.parent_id ? String(comment.parent_id) : ''
      let replyToProfile = null
      if (parentId && parentCommentById[parentId]) {
        replyToProfile = profileBy[parentCommentById[parentId].user_id] || null
      } else if (!parentId) {
        replyToProfile = post.author_profile || profileBy[post.user_id] || null
      }
      return {
        comment: {
          ...comment,
          author_profile: profileBy[comment.user_id] || null,
          reply_to_profile: replyToProfile,
        },
        post,
      }
    })
    .filter(Boolean)
}

/**
 * Strict literal $TICKER post search for market chart modal (no fuzzy pg_trgm).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} cashtag Ticker without `$`, e.g. `AMD`
 * @param {{ sort?: string, limit?: number, offset?: number }} [opts]
 */
export async function loungeSearchCashtagPosts(supabaseClient, cashtag, opts = {}) {
  const tag = String(cashtag || '').trim()
  if (!tag) {
    return { posts: [], pagination: { postsHasMore: false } }
  }
  const { sort = LOUNGE_SEARCH_SORT.ENGAGEMENT, limit = LOUNGE_SEARCH_PAGE.POSTS, offset = 0 } = opts

  const { data, error } = await supabaseClient.rpc('lounge_search_cashtag_posts', {
    p_cashtag: tag,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error

  const payload = data && typeof data === 'object' ? data : {}
  const pagination = payload.pagination && typeof payload.pagination === 'object' ? payload.pagination : {}

  return {
    posts: Array.isArray(payload.posts) ? payload.posts : [],
    pagination: {
      postsHasMore: pagination.posts_has_more === true,
    },
  }
}

export { SEARCH_DEBOUNCE_MS }
