/** @typedef {'all' | 'following'} LoungeFeedScope */

import { LOUNGE_FEED_SORT } from './loungeFeedSortPref.js'
import { loungeFeedPopularScore } from './loungeFeedPopularScore.js'

export const LOUNGE_FEED_SCOPE_ALL = 'all'
export const LOUNGE_FEED_SCOPE_FOLLOWING = 'following'

/** Feed/profile timeline: only standalone + thread roots (never continuation post rows). */
export function loungeFeedRowIsTimelineVisible(row) {
  if (!row?.id) return false
  const rootId = row.thread_root_id
  return rootId == null || rootId === ''
}

/** @param {object[] | null | undefined} rows */
export function filterLoungeFeedTimelinePosts(rows) {
  return (rows || []).filter(loungeFeedRowIsTimelineVisible)
}

const COMMUNITY_FEED_SELECT =
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url,link_preview,market_embeds,thread_root_id,thread_part_index,thread_part_count'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 * @returns {Promise<string[]>}
 */
export async function fetchLoungeFollowingAuthorIds(supabaseClient, viewerUserId) {
  if (!viewerUserId) return []
  const { data, error } = await supabaseClient
    .from('profile_follows')
    .select('following_id')
    .eq('follower_id', viewerUserId)
  if (error) throw error
  return [...new Set((data || []).map((r) => r.following_id).filter(Boolean))]
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {LoungeFeedScope} scope
 * @param {string[] | null} followingAuthorIds - set when `scope === 'following'`
 * @param {string[] | null | undefined} [excludedCategorySlugs] - unchecked pills; hide post only when every pill is excluded
 */
export function loungeFeedPinnedQuery(supabaseClient, scope, followingAuthorIds, excludedCategorySlugs) {
  let q = supabaseClient
    .from('community_feed_posts')
    .select(COMMUNITY_FEED_SELECT)
    .eq('pinned', true)
    .is('thread_root_id', null)
    .order('created_at', { ascending: false })
    .limit(2)
  if (scope === LOUNGE_FEED_SCOPE_FOLLOWING && followingAuthorIds) {
    q = q.in('user_id', followingAuthorIds)
  }
  if (excludedCategorySlugs?.length) {
    const arr = `{${excludedCategorySlugs.join(',')}}`
    // Show when untagged, or at least one pill is not in the excluded set (cd = contained in).
    q = q.or(`category_pills.is.null,category_pills.eq.{},not.category_pills.cd.${arr}`)
  }
  return q
}

/**
 * @param {{
 *   sort?: import('./loungeFeedSortPref.js').LoungeFeedSortMode,
 *   scope?: LoungeFeedScope,
 *   followingAuthorIds?: string[] | null,
 *   excludedCategorySlugs?: string[] | null,
 *   limit?: number,
 *   asOf?: string,
 *   cursor?: { created_at?: string, id?: string, popular_score?: number | null } | null,
 * }} opts
 */
export function loungeFeedPageRpcQuery(supabaseClient, opts = {}) {
  const sort = opts.sort === LOUNGE_FEED_SORT.POPULAR ? 'popular' : 'latest'
  const followingAuthorIds =
    opts.scope === LOUNGE_FEED_SCOPE_FOLLOWING && opts.followingAuthorIds?.length
      ? opts.followingAuthorIds
      : null
  const cursor = opts.cursor || null
  const excludedCategorySlugs = opts.excludedCategorySlugs?.length ? opts.excludedCategorySlugs : null
  return supabaseClient.rpc('lounge_feed_posts_page', {
    p_sort: sort,
    p_following_user_ids: followingAuthorIds,
    p_limit: opts.limit ?? 29,
    p_as_of: opts.asOf || new Date().toISOString(),
    p_cursor_created_at: cursor?.created_at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_popular_score: cursor?.popular_score ?? null,
    p_excluded_category_slugs: excludedCategorySlugs,
  })
}

/** @deprecated Use loungeFeedPageRpcQuery - kept for callers migrating incrementally. */
export function loungeFeedPageQuery(supabaseClient, scope, followingAuthorIds, limit) {
  return loungeFeedPageRpcQuery(supabaseClient, {
    sort: LOUNGE_FEED_SORT.LATEST,
    scope,
    followingAuthorIds,
    limit,
    cursor: null,
  })
}

/** @deprecated Use loungeFeedPageRpcQuery - kept for callers migrating incrementally. */
export function loungeFeedPageQueryAfterCursor(supabaseClient, scope, followingAuthorIds, cursor, limit) {
  return loungeFeedPageRpcQuery(supabaseClient, {
    sort: LOUNGE_FEED_SORT.LATEST,
    scope,
    followingAuthorIds,
    limit,
    cursor,
  })
}

/**
 * Build pagination cursor from the last row of a feed page.
 * @param {object | null | undefined} pageLast
 * @param {import('./loungeFeedSortPref.js').LoungeFeedSortMode} sort
 * @param {string} asOf
 */
export function loungeFeedCursorFromPageLast(pageLast, sort, asOf) {
  if (!pageLast?.id) return null
  return {
    created_at: pageLast.created_at,
    id: pageLast.id,
    popular_score:
      sort === LOUNGE_FEED_SORT.POPULAR ? loungeFeedPopularScore(pageLast, asOf) : null,
  }
}

export { COMMUNITY_FEED_SELECT }
