/** Must match `lounge_feed_popular_score()` in Supabase (Phase J). */
export const LOUNGE_FEED_POPULAR_DECAY_GRAVITY = 1.5
export const LOUNGE_FEED_POPULAR_DECAY_OFFSET_HOURS = 2

/** @param {object} post */
export function loungeFeedEngagementWeight(post) {
  return (
    (Number(post?.like_count) || 0) +
    (Number(post?.repost_count) || 0) * 2 +
    (Number(post?.comment_count) || 0) * 2
  )
}

/**
 * @param {object} post
 * @param {number | string | Date} [asOfMs] - freeze decay for pagination (matches RPC `p_as_of`).
 */
export function loungeFeedPopularScore(post, asOfMs = Date.now()) {
  const engagement = loungeFeedEngagementWeight(post)
  const asOf =
    asOfMs instanceof Date
      ? asOfMs.getTime()
      : typeof asOfMs === 'string'
        ? Date.parse(asOfMs)
        : Number(asOfMs)
  const t = Date.parse(String(post?.created_at || ''))
  const ageHours =
    Number.isFinite(asOf) && Number.isFinite(t) ? Math.max(0, (asOf - t) / (60 * 60 * 1000)) : 0
  return engagement / (ageHours + LOUNGE_FEED_POPULAR_DECAY_OFFSET_HOURS) ** LOUNGE_FEED_POPULAR_DECAY_GRAVITY
}
