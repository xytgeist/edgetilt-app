/** @typedef {'ranked' | 'popular' | 'chronological' | 'likes'} LoungeDetailCommentSortMode */

export const LOUNGE_DETAIL_COMMENT_SORT_STORAGE_KEY = 'loungeDetailCommentSort:v1'

export const LOUNGE_DETAIL_COMMENT_SORT = {
  RANKED: 'ranked',
  POPULAR: 'popular',
  CHRONOLOGICAL: 'chronological',
  LIKES: 'likes',
}

const SORT_VALUES = new Set(Object.values(LOUNGE_DETAIL_COMMENT_SORT))

/** Gravity exponent for Relevant time decay - higher = faster falloff for older comments. */
const RELEVANCE_DECAY_GRAVITY = 1.5
/** Hours added before decay division - keeps brand-new comments from dividing by ~0. */
const RELEVANCE_DECAY_OFFSET_HOURS = 2

/** @returns {LoungeDetailCommentSortMode} */
export function readLoungeDetailCommentSort() {
  if (typeof window === 'undefined') return LOUNGE_DETAIL_COMMENT_SORT.RANKED
  try {
    const v = window.localStorage.getItem(LOUNGE_DETAIL_COMMENT_SORT_STORAGE_KEY)
    if (SORT_VALUES.has(v)) return /** @type {LoungeDetailCommentSortMode} */ (v)
  } catch {
    // ignore
  }
  return LOUNGE_DETAIL_COMMENT_SORT.RANKED
}

/** @param {LoungeDetailCommentSortMode} mode */
export function writeLoungeDetailCommentSort(mode) {
  if (typeof window === 'undefined' || !SORT_VALUES.has(mode)) return
  try {
    window.localStorage.setItem(LOUNGE_DETAIL_COMMENT_SORT_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

const countField = (v) => {
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 ? x : 0
}

/** Weighted engagement before time decay (Relevant + Popular raw signal). */
export function feedCommentEngagementWeight(comment) {
  return (
    countField(comment?.like_count) +
    countField(comment?.repost_count) * 2 +
    countField(comment?.bookmark_count) * 1.5 +
    countField(comment?.comment_count) * 2
  )
}

/** Likes + reposts + bookmarks + reply subtree count on a `feed_comments` row. */
export function feedCommentInteractionScore(comment) {
  return (
    countField(comment?.like_count) +
    countField(comment?.repost_count) +
    countField(comment?.bookmark_count) +
    countField(comment?.comment_count)
  )
}

/**
 * @param {object} comment
 * @param {number} nowMs
 */
function feedCommentAgeHours(comment, nowMs) {
  const t = Date.parse(String(comment?.created_at || ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (nowMs - t) / (60 * 60 * 1000))
}

/**
 * Relevant ranking score - weighted engagement with gravity/time decay.
 * @param {object} comment
 * @param {{
 *   nowMs?: number,
 *   postAuthorUserId?: string | null,
 *   followingUserIds?: Set<string>,
 * }} [opts]
 */
export function feedCommentRelevanceScore(comment, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now()
  const engagement = feedCommentEngagementWeight(comment)
  const ageHours = feedCommentAgeHours(comment, nowMs)
  let score = engagement / (ageHours + RELEVANCE_DECAY_OFFSET_HOURS) ** RELEVANCE_DECAY_GRAVITY

  const opId = String(opts.postAuthorUserId || '').trim()
  if (opId && !comment?.parent_id && String(comment?.user_id || '') === opId) {
    score *= 1.25
  }

  const following = opts.followingUserIds
  if (following?.has?.(String(comment?.user_id || ''))) {
    score *= 1.15
  }

  return score
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string[]} [viewerPinnedCommentIds]
 */
export function compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds = []) {
  const pins = viewerPinnedCommentIds || []
  const pinIndex = new Map(pins.map((id, i) => [id, i]))
  const ai = pinIndex.has(a?.id) ? pinIndex.get(a.id) : Number.POSITIVE_INFINITY
  const bi = pinIndex.has(b?.id) ? pinIndex.get(b.id) : Number.POSITIVE_INFINITY
  if (ai !== bi) return ai - bi
  return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
}

/** @param {object} a @param {object} b */
export function compareFeedCommentsByInteractionDesc(a, b) {
  const d = feedCommentInteractionScore(b) - feedCommentInteractionScore(a)
  if (d !== 0) return d
  return compareFeedCommentsChronologicalAsc(a, b, [])
}

/** @param {object} a @param {object} b */
export function compareFeedCommentsByLikesDesc(a, b) {
  const d = countField(b?.like_count) - countField(a?.like_count)
  if (d !== 0) return d
  return compareFeedCommentsChronologicalAsc(a, b, [])
}

/**
 * @param {object} a
 * @param {object} b
 * @param {{
 *   nowMs?: number,
 *   postAuthorUserId?: string | null,
 *   followingUserIds?: Set<string>,
 *   viewerPinnedCommentIds?: string[],
 * }} opts
 */
function compareFeedCommentsByRelevanceDesc(a, b, opts) {
  const pinIndex = new Map((opts.viewerPinnedCommentIds || []).map((id, i) => [id, i]))
  const ai = pinIndex.has(a?.id) ? pinIndex.get(a.id) : Number.POSITIVE_INFINITY
  const bi = pinIndex.has(b?.id) ? pinIndex.get(b.id) : Number.POSITIVE_INFINITY
  if (ai !== bi) return ai - bi

  const d = feedCommentRelevanceScore(b, opts) - feedCommentRelevanceScore(a, opts)
  if (d !== 0) return d
  return compareFeedCommentsChronologicalAsc(a, b, [])
}

/**
 * First-level (root) comments on post detail - ranked buckets or flat sort mode.
 * @param {{
 *   roots: object[],
 *   postAuthorUserId?: string | null,
 *   viewerUserId?: string | null,
 *   followingUserIds?: string[],
 *   viewerPinnedCommentIds?: string[],
 *   sortMode?: LoungeDetailCommentSortMode,
 * }} opts
 */
export function orderPostDetailRootComments({
  roots,
  postAuthorUserId = null,
  viewerUserId = null,
  followingUserIds = [],
  viewerPinnedCommentIds = [],
  sortMode = LOUNGE_DETAIL_COMMENT_SORT.RANKED,
}) {
  const list = (roots || []).filter((c) => c && !c.parent_id && !c.is_thread_part)
  const mode = SORT_VALUES.has(sortMode) ? sortMode : LOUNGE_DETAIL_COMMENT_SORT.RANKED

  if (mode === LOUNGE_DETAIL_COMMENT_SORT.CHRONOLOGICAL) {
    return [...list].sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.POPULAR) {
    return [...list].sort(compareFeedCommentsByInteractionDesc)
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.LIKES) {
    return [...list].sort(compareFeedCommentsByLikesDesc)
  }

  const following = new Set((followingUserIds || []).filter(Boolean))
  const relevanceOpts = {
    nowMs: Date.now(),
    postAuthorUserId,
    followingUserIds: following,
    viewerPinnedCommentIds,
  }

  return [...list].sort((a, b) => compareFeedCommentsByRelevanceDesc(a, b, relevanceOpts))
}

/**
 * Direct replies on a comment detail screen (siblings under one parent).
 * @param {{
 *   replies: object[],
 *   viewerPinnedCommentIds?: string[],
 *   sortMode?: LoungeDetailCommentSortMode,
 * }} opts
 */
export function orderCommentDetailDirectReplies({
  replies,
  viewerPinnedCommentIds = [],
  sortMode = LOUNGE_DETAIL_COMMENT_SORT.RANKED,
}) {
  const list = replies || []
  const mode = SORT_VALUES.has(sortMode) ? sortMode : LOUNGE_DETAIL_COMMENT_SORT.RANKED
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.CHRONOLOGICAL || mode === LOUNGE_DETAIL_COMMENT_SORT.RANKED) {
    return [...list].sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.POPULAR) {
    return [...list].sort(compareFeedCommentsByInteractionDesc)
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.LIKES) {
    return [...list].sort(compareFeedCommentsByLikesDesc)
  }
  return [...list].sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
}

/**
 * Keep comment row order stable while counts change on the same screen session.
 * Full reorder when `resort` is true; otherwise drop removed ids, prepend new viewer pins, append other new ids.
 * @param {{
 *   stableIds?: string[],
 *   freshlySorted?: object[],
 *   viewerPinnedCommentIds?: string[],
 *   resort?: boolean,
 * }} opts
 * @returns {string[]}
 */
export function stabilizeCommentListOrder({
  stableIds = [],
  freshlySorted = [],
  viewerPinnedCommentIds = [],
  resort = false,
}) {
  const freshList = freshlySorted || []
  const freshIds = freshList.map((c) => c.id).filter(Boolean)
  const freshSet = new Set(freshIds)

  if (!freshIds.length) return []
  if (resort || !stableIds.length) return freshIds

  const nextSet = new Set()
  const next = (stableIds || []).filter((id) => {
    if (!freshSet.has(id)) return false
    nextSet.add(id)
    return true
  })

  const pins = viewerPinnedCommentIds || []
  for (let i = pins.length - 1; i >= 0; i -= 1) {
    const id = pins[i]
    if (freshSet.has(id) && !nextSet.has(id)) {
      next.unshift(id)
      nextSet.add(id)
    }
  }

  for (const id of freshIds) {
    if (!nextSet.has(id)) {
      next.push(id)
      nextSet.add(id)
    }
  }

  return next
}

/**
 * @param {string[]} orderedIds
 * @param {Map<string, object>} byId
 */
export function commentsFromIdOrder(orderedIds, byId) {
  return (orderedIds || []).map((id) => byId.get(id)).filter(Boolean)
}
