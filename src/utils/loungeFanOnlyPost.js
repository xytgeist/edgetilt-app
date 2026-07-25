/** @typedef {Record<string, { active?: boolean }>} CreatorFanEntitlementsMap */

import { isQuoteRepostPost } from './communityFeedPost.js'

export const LOUNGE_COMPOSER_AUDIENCE_ALL = 'all'
export const LOUNGE_COMPOSER_AUDIENCE_SUBS = 'subs'

/**
 * @param {CreatorFanEntitlementsMap | null | undefined} entitlements
 * @param {string | null | undefined} creatorUserId
 */
export function viewerHasCreatorFanSub(entitlements, creatorUserId) {
  const id = String(creatorUserId || '').trim()
  if (!id) return false
  const key = `creator-fan:${id}`
  return Boolean(entitlements?.[key]?.active)
}

/**
 * True when UI should show locked teaser + subscribe CTA (server may already have trimmed caption).
 *
 * @param {object | null | undefined} post
 * @param {{ viewerUserId?: string | null, viewerIsStaff?: boolean, fanEntitlements?: CreatorFanEntitlementsMap | null }} ctx
 */
export function isLoungeFanOnlyPost(post) {
  return Boolean(post?.creator_fan_only)
}

export function loungeFanOnlyPostContentEntity(post) {
  if (!post) return null
  if (post.is_plain_repost === true && post.reposted_post) return post.reposted_post
  return post
}

/**
 * Left-edge row tint when the viewer sees the full subs-only post (creator or active fan sub).
 *
 * @param {object | null | undefined} post Feed/profile row (plain repost resolves to `reposted_post`).
 * @param {{ viewerUserId?: string | null, viewerIsStaff?: boolean, fanEntitlements?: CreatorFanEntitlementsMap | null }} ctx
 */
export function showLoungeFanOnlyPostUnlockedTint(post, ctx = {}) {
  const entity = loungeFanOnlyPostContentEntity(post)
  return Boolean(entity?.creator_fan_only && !isLoungeFanOnlyPostLocked(entity, ctx))
}

/** Fan-only source on a repost/quote target (for locked inset UI). */
export function loungeFanOnlyPostRepostSource(post) {
  if (!post) return null
  if (post.reposted_post && (post.is_plain_repost === true || post.repost_of_post_id)) {
    return post.reposted_post
  }
  return loungeFanOnlyPostContentEntity(post)
}

/**
 * Feed row: block opening post detail only for standalone locked subs-only posts (not quote/plain repost wrappers).
 *
 * @param {object | null | undefined} post
 * @param {{ viewerUserId?: string | null, viewerIsStaff?: boolean, fanEntitlements?: CreatorFanEntitlementsMap | null }} ctx
 */
export function isLoungeFanOnlyDirectFeedRowLocked(post, ctx = {}) {
  if (!post) return false
  if (post.is_plain_repost === true) return false
  if (isQuoteRepostPost(post)) return false
  return isLoungeFanOnlyPostLocked(post, ctx)
}

/**
 * Block post-detail navigation for standalone locked subs-only rows (not repost/quote wrappers).
 */
export function loungeFanOnlyPostDetailOpenBlocked(post, ctx = {}) {
  if (!post) return true
  if (post.is_plain_repost === true) return false
  if (isQuoteRepostPost(post)) return false
  const entity = loungeFanOnlyPostContentEntity(post)
  return isLoungeFanOnlyPostLocked(entity, ctx)
}

/**
 * Profile Replies tab: hide replies on fan-only posts from viewers who cannot read the parent,
 * except the profile owner always sees their own replies list.
 *
 * @param {{ post?: object, comment?: object } | null | undefined} item
 * @param {string | null | undefined} profileUserId
 * @param {{ viewerUserId?: string | null, viewerIsStaff?: boolean, fanEntitlements?: CreatorFanEntitlementsMap | null }} ctx
 */
export function loungeProfileReplyItemVisible(item, profileUserId, ctx = {}) {
  const post = item?.post
  if (!post?.id) return false
  if (!post.creator_fan_only) return true
  const pid = String(profileUserId || '').trim()
  const vid = String(ctx.viewerUserId || '').trim()
  if (pid && vid && pid === vid) return true
  return !isLoungeFanOnlyPostLocked(post, ctx)
}

export function isLoungeFanOnlyPostLocked(post, ctx = {}) {
  if (!post?.creator_fan_only) return false
  if (ctx.viewerIsStaff) return false
  const authorId = String(post.user_id || '').trim()
  const viewerId = String(ctx.viewerUserId || '').trim()
  if (viewerId && authorId && viewerId === authorId) return false
  return !viewerHasCreatorFanSub(ctx.fanEntitlements, authorId)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} postIds
 */
export async function fetchLoungeCommunityFeedPostsForViewer(supabaseClient, postIds) {
  const ids = [...new Set(postIds.map((id) => String(id || '').trim()).filter(Boolean))].filter(
    (id) => !id.startsWith('pending-'),
  )
  if (!ids.length) return []
  const { data, error } = await supabaseClient.rpc('lounge_community_feed_posts_for_viewer', {
    p_post_ids: ids,
  })
  if (error) throw error
  return data || []
}
