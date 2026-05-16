/** @typedef {'ranked' | 'popular' | 'chronological' | 'likes'} LoungeDetailCommentSortMode */

export const LOUNGE_DETAIL_COMMENT_SORT_STORAGE_KEY = 'loungeDetailCommentSort:v1'

export const LOUNGE_DETAIL_COMMENT_SORT = {
  RANKED: 'ranked',
  POPULAR: 'popular',
  CHRONOLOGICAL: 'chronological',
  LIKES: 'likes',
}

const SORT_VALUES = new Set(Object.values(LOUNGE_DETAIL_COMMENT_SORT))

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
 * First-level (root) comments on post detail — ranked buckets or flat sort mode.
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
  const list = (roots || []).filter((c) => c && !c.parent_id)
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
  const assigned = new Set()
  const out = []
  const opId = String(postAuthorUserId || '').trim()
  const viewerId = String(viewerUserId || '').trim()

  const isOpRoot = (c) => opId && String(c.user_id || '') === opId
  const isViewerRoot = (c) => viewerId && String(c.user_id || '') === viewerId

  for (const c of [...list].filter(isOpRoot).sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, []))) {
    if (assigned.has(c.id)) continue
    assigned.add(c.id)
    out.push(c)
  }

  for (const c of [...list]
    .filter((c) => !assigned.has(c.id) && isViewerRoot(c))
    .sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))) {
    assigned.add(c.id)
    out.push(c)
  }

  for (const c of [...list]
    .filter((c) => !assigned.has(c.id) && following.has(c.user_id))
    .sort((a, b) => {
      const d = feedCommentInteractionScore(b) - feedCommentInteractionScore(a)
      if (d !== 0) return d
      return compareFeedCommentsChronologicalAsc(a, b, [])
    })) {
    assigned.add(c.id)
    out.push(c)
  }

  const remainingForTop = list.filter((c) => !assigned.has(c.id))
  const top3 = [...remainingForTop].sort(compareFeedCommentsByInteractionDesc).slice(0, 3)
  for (const c of top3) {
    assigned.add(c.id)
    out.push(c)
  }

  const tail = list
    .filter((c) => !assigned.has(c.id))
    .sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, []))
  out.push(...tail)

  return out
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
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.CHRONOLOGICAL) {
    return [...list].sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.POPULAR) {
    return [...list].sort(compareFeedCommentsByInteractionDesc)
  }
  if (mode === LOUNGE_DETAIL_COMMENT_SORT.LIKES) {
    return [...list].sort(compareFeedCommentsByLikesDesc)
  }
  const pins = viewerPinnedCommentIds || []
  const pinIndex = new Map(pins.map((id, i) => [id, i]))
  return [...list].sort((a, b) => {
    const aPin = pinIndex.has(a.id)
    const bPin = pinIndex.has(b.id)
    if (aPin !== bPin) return aPin ? -1 : 1
    if (aPin && bPin) return pinIndex.get(a.id) - pinIndex.get(b.id)
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
}
