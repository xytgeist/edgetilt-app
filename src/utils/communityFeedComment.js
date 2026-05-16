import {
  feedPostAuthorEditMediaSeed,
  feedPostImageUrls,
  feedPostStreamVideoUid,
} from './communityFeedPost.js'
import { LOUNGE_COMMENT_BODY_MAX } from './loungeCommentLimits.js'

export { feedPostAuthorEditMediaSeed as feedCommentAuthorEditMediaSeed }
export { feedPostImageUrls as feedCommentImageUrls }
export { feedPostStreamVideoUid as feedCommentStreamVideoUid }

/** Trimmed reply body (max 280). */
export function normalizeFeedCommentBody(body) {
  return String(body ?? '')
    .trim()
    .slice(0, LOUNGE_COMMENT_BODY_MAX)
}

/** True when the row has any attachment (images, GIF, or Stream). */
export function feedCommentRowHasMedia(row) {
  if (feedPostStreamVideoUid(row)) return true
  if (feedPostImageUrls(row).length > 0) return true
  const gu = String(row?.gif_url ?? '').trim()
  const mu = String(row?.media_url ?? '').trim()
  return Boolean(gu || mu)
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
}) {
  return {
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
}
