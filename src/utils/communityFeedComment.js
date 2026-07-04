import {
  feedPostAuthorEditMediaSeed,
  feedPostImageUrls,
  feedPostStreamVideoUid,
} from './communityFeedPost.js'
import { LOUNGE_CAPTION_MAX } from './loungeCommentLimits.js'

export { feedPostAuthorEditMediaSeed as feedCommentAuthorEditMediaSeed }
export { feedPostImageUrls as feedCommentImageUrls }
export { feedPostStreamVideoUid as feedCommentStreamVideoUid }

/** Trimmed reply body. */
export function normalizeFeedCommentBody(body, max = LOUNGE_CAPTION_MAX) {
  const cap = Number.isFinite(max) && max > 0 ? max : LOUNGE_CAPTION_MAX
  return String(body ?? '')
    .trim()
    .slice(0, cap)
}

/** True when the row has any attachment (images, GIF, or Stream). */
export function feedCommentRowHasMedia(row) {
  if (feedPostStreamVideoUid(row)) return true
  if (feedPostImageUrls(row).length > 0) return true
  const gu = String(row?.gif_url ?? '').trim()
  const mu = String(row?.media_url ?? '').trim()
  return Boolean(gu || mu)
}

/** Visible reply count for a comment row (DB `comment_count` = all depths below). */
export function feedCommentSubtreeReplyCount(comment, fallbackCount = 0) {
  if (typeof comment?.comment_count === 'number') return Math.max(0, comment.comment_count)
  return Math.max(0, fallbackCount)
}

/**
 * Client fallback when `feed_comments.comment_count` is not migrated yet: count all visible descendants.
 * @param {Array<{ id?: string, parent_id?: string | null }>} comments
 * @returns {Map<string, number>}
 */
export function feedCommentDescendantCountById(comments) {
  const list = Array.isArray(comments) ? comments : []
  const childrenByParent = new Map()
  for (const c of list) {
    const pid = c?.parent_id
    if (!pid || !c?.id) continue
    const arr = childrenByParent.get(pid) || []
    arr.push(c.id)
    childrenByParent.set(pid, arr)
  }
  const memo = new Map()
  const countDescendants = (id) => {
    if (memo.has(id)) return memo.get(id)
    const kids = childrenByParent.get(id) || []
    let total = kids.length
    for (const kid of kids) {
      total += countDescendants(kid)
    }
    memo.set(id, total)
    return total
  }
  const out = new Map()
  for (const c of list) {
    if (c?.id) out.set(c.id, countDescendants(c.id))
  }
  return out
}

/**
 * Optimistic +/- on ancestor `comment_count` after insert/delete (matches DB trigger walk).
 * @param {Array<object>} rows
 * @param {string | null | undefined} parentId
 * @param {number} delta
 */
export function bumpFeedCommentAncestorCountsInList(rows, parentId, delta) {
  if (!parentId || !delta || !Array.isArray(rows)) return rows
  const byId = new Map(rows.map((r) => [r.id, r]))
  const touched = new Set()
  let cur = parentId
  while (cur) {
    touched.add(cur)
    const row = byId.get(cur)
    if (!row) break
    cur = row.parent_id
  }
  if (!touched.size) return rows
  return rows.map((r) => {
    if (!touched.has(r.id)) return r
    const base = typeof r.comment_count === 'number' ? r.comment_count : 0
    return { ...r, comment_count: Math.max(0, base + delta) }
  })
}

/** Parent ids still in the tree after a delete (ancestors of removed nodes, not removed). */
export function feedCommentAncestorIdsAfterRemoval(comments, removeIds) {
  const removed = removeIds instanceof Set ? removeIds : new Set(removeIds || [])
  const byId = new Map((comments || []).map((c) => [c.id, c]))
  const out = new Set()
  for (const id of removed) {
    let row = byId.get(id)
    let pid = row?.parent_id
    while (pid && !removed.has(pid)) {
      out.add(pid)
      row = byId.get(pid)
      pid = row?.parent_id
    }
  }
  return [...out]
}

/**
 * Insert/update payload for `feed_comments` media columns (mirrors `communityFeedPostInsertPayload`).
 */
export function feedCommentMediaInsertPayload({
  streamVideoUid,
  streamPosterUrl,
  streamVideoWidth,
  streamVideoHeight,
  mediaUrl,
  gifUrl,
  imageUrls,
}) {
  const out = {}
  const sv = streamVideoUid != null ? String(streamVideoUid).trim() : ''
  if (sv) {
    out.stream_video_uid = sv
    out.media_url = null
    out.gif_url = null
    out.image_urls = []
    const pu = streamPosterUrl != null ? String(streamPosterUrl).trim() : ''
    if (pu) out.stream_poster_url = pu
    const w = Number(streamVideoWidth)
    const h = Number(streamVideoHeight)
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 2 && h >= 2) {
      out.stream_video_width = Math.round(w)
      out.stream_video_height = Math.round(h)
    }
    return out
  }
  const imgs = Array.isArray(imageUrls)
    ? imageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  if (imgs.length > 0) {
    out.image_urls = imgs
    out.media_url = imgs[0]
  } else {
    const mu = mediaUrl != null ? String(mediaUrl).trim() : ''
    if (mu) out.media_url = mu
    else {
      out.media_url = null
    }
    out.image_urls = []
  }
  const gu = gifUrl != null ? String(gifUrl).trim() : ''
  out.gif_url = gu || null
  if (!sv && imgs.length === 0 && !out.media_url && !out.gif_url) {
    out.stream_video_uid = null
    out.stream_poster_url = null
    out.stream_video_width = null
    out.stream_video_height = null
  }
  return out
}

/**
 * Full insert row fragment for `feed_comments` (caller sets post_id, user_id, parent_id).
 */
export function feedCommentInsertPayload({
  body,
  streamVideoUid,
  streamPosterUrl,
  streamVideoWidth,
  streamVideoHeight,
  mediaUrl,
  gifUrl,
  imageUrls,
  isThreadPart = false,
  threadPartIndex = null,
}) {
  const out = {
    body: normalizeFeedCommentBody(body),
    ...feedCommentMediaInsertPayload({
      streamVideoUid,
      streamPosterUrl,
      streamVideoWidth,
      streamVideoHeight,
      mediaUrl,
      gifUrl,
      imageUrls,
    }),
  }
  if (isThreadPart) {
    out.is_thread_part = true
    out.thread_part_index = Math.max(1, Number(threadPartIndex) || 1)
  }
  return out
}

/** Root-level thread continuation row (part 2+). */
export function feedCommentThreadPartInsertPayload({
  body,
  threadPartIndex,
  streamVideoUid,
  streamPosterUrl,
  streamVideoWidth,
  streamVideoHeight,
  mediaUrl,
  gifUrl,
  imageUrls,
}) {
  return feedCommentInsertPayload({
    body,
    streamVideoUid,
    streamPosterUrl,
    streamVideoWidth,
    streamVideoHeight,
    mediaUrl,
    gifUrl,
    imageUrls,
    isThreadPart: true,
    threadPartIndex,
  })
}
