/**
 * Feed post helpers: `caption` is the main user-authored text on `community_feed_posts`.
 * Quote reposts set `repost_of_post_id` and a non-empty `caption`. Plain reposts use `is_plain_repost` and empty caption.
 */

import {
  deleteCfR2ObjectByPublicUrl,
  isLoungeCfR2MediaUrl,
  isLoungeHostedFeedMediaUrl,
  isLoungeSupabaseFeedMediaUrl,
  uploadLoungeFeedPostImageToCfR2,
} from './loungeCfImageMedia.js'
import { LOUNGE_CAPTION_MAX } from './loungeCommentLimits.js'
import { normalizeCashtagsInCaption } from './loungeMarketCaptionParse.js'
import { normalizeLoungePostCategoryPills } from './loungePostCategoryPills.js'

export { isLoungeCfR2MediaUrl, isLoungeHostedFeedMediaUrl, isLoungeSupabaseFeedMediaUrl } from './loungeCfImageMedia.js'

/** Trimmed caption string (empty if missing). */
export function feedPostDisplayCaption(row) {
  const v = (row || {}).caption
  if (v != null && String(v).trim() !== '') return String(v)
  return ''
}

/** Quote repost feed row (post or comment target; not plain repost). */
export function isQuoteRepostPost(post) {
  if (!post || post.is_plain_repost === true) return false
  if (post.repost_of_comment_id) return true
  return Boolean(post.repost_of_post_id || post.repost_target_unavailable === true)
}

/** Embedded original missing (deleted, hidden, or not hydrated). */
export function quoteRepostOriginalUnavailable(post) {
  if (!isQuoteRepostPost(post)) return false
  if (post.repost_target_unavailable === true) return true
  if (post.repost_of_post_id && !post.reposted_post) return true
  if (post.repost_of_comment_id && !post.reposted_comment) return true
  return false
}

/**
 * Post IDs whose like/repost/bookmark state must be hydrated for feed/profile cards.
 * Plain repost rows show "You reposted" on the repost card but `LoungePostArticle` binds
 * the interaction bar to the embedded original (`displayPost`), so include those IDs too.
 */
export function collectLoungePostInteractionHydrateIds(posts) {
  const ids = new Set()
  if (!Array.isArray(posts)) return ids
  for (const p of posts) {
    if (p?.id) ids.add(String(p.id))
    if (p?.is_plain_repost === true) {
      const origId = p.reposted_post?.id ?? p.repost_of_post_id
      if (origId) ids.add(String(origId))
    }
  }
  return ids
}

/**
 * Total engagement for ordering / discovery: likes + comments + reposts on a hydrated feed row.
 */
export function loungePostInteractionScore(row) {
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) && x >= 0 ? x : 0
  }
  return n(row?.like_count) + n(row?.comment_count) + n(row?.repost_count)
}

/** Ordered uploaded image URLs from `image_urls` (jsonb array); empty for legacy rows. */
export function feedPostImageUrls(row) {
  const raw = row?.image_urls
  if (raw == null) return []
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean)
}

/** Cloudflare Stream uid when the post is video-only (see `supabase/lounge_feed_post_stream_video.sql`). */
export function feedPostStreamVideoUid(row) {
  const u = String(row?.stream_video_uid ?? '').trim()
  return u || ''
}

/** Public `lounge-feed` JPEG URL for Stream tile poster when set (`supabase/lounge_feed_post_stream_video.sql`). */
export function feedPostStreamPosterUrl(row) {
  return String(row?.stream_poster_url ?? '').trim()
}

/** `{ width, height }` from DB when both present and valid; used for tile aspect-ratio. */
export function feedPostStreamVideoDisplayDimensions(row) {
  const w = Number(row?.stream_video_width)
  const h = Number(row?.stream_video_height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) return null
  return { width: Math.round(w), height: Math.round(h) }
}

function isProbablyLoungeStoredImageUrl(u) {
  return isLoungeHostedFeedMediaUrl(u)
}

/**
 * Split a feed row into editable image URLs + external GIF URL for the author edit UI.
 * Handles `image_urls` + `gif_url`, legacy `media_url` + `gif_url`, single stored image in `media_url`, and GIF-only (`media_url` holds the GIF, `gif_url` null).
 */
export function feedPostAuthorEditMediaSeed(row) {
  const imgs = feedPostImageUrls(row)
  const gu = String(row?.gif_url ?? '').trim()
  const mu = String(row?.media_url ?? '').trim()
  if (imgs.length > 0) {
    return { imageUrls: imgs.map((x) => String(x)), gifUrl: gu }
  }
  if (gu && mu) {
    return { imageUrls: [mu], gifUrl: gu }
  }
  if (mu) {
    if (isProbablyLoungeStoredImageUrl(mu)) {
      return { imageUrls: [mu], gifUrl: '' }
    }
    return { imageUrls: [], gifUrl: mu }
  }
  return { imageUrls: [], gifUrl: '' }
}

/**
 * Columns for `community_feed_posts.update` when saving attachment edits (remote URLs only).
 */
export function feedPostMediaUpdatePayload({ imageUrls, gifUrl }) {
  const imgs = Array.isArray(imageUrls)
    ? imageUrls.map((u) => String(u ?? '').trim()).filter(Boolean)
    : []
  const gu = gifUrl != null ? String(gifUrl).trim() : ''
  if (imgs.length > 0) {
    return {
      image_urls: imgs,
      media_url: imgs[0],
      gif_url: gu || null,
    }
  }
  if (gu) {
    return {
      image_urls: [],
      media_url: gu,
      gif_url: null,
    }
  }
  return {
    image_urls: [],
    media_url: null,
    gif_url: null,
  }
}

/** Normalized caption for insert/update (trim, uppercase cashtags, max {@link LOUNGE_CAPTION_MAX}). */
export function normalizeFeedCaption(caption) {
  return normalizeCashtagsInCaption(String(caption ?? '').trim()).slice(0, LOUNGE_CAPTION_MAX)
}

function attachCategoryPills(out, categoryPills) {
  out.category_pills = normalizeLoungePostCategoryPills(categoryPills)
  return out
}

/**
 * Insert payload for `community_feed_posts` (caption + optional game context + optional media).
 * When `streamVideoUid` is set, stores Cloudflare Stream uid (`supabase/lounge_feed_post_stream_video.sql`) and optional poster + display dimensions.
 */
export function communityFeedPostInsertPayload({
  caption,
  gameTitle = '',
  gameSlug = null,
  /** Staff-only: lounge may set true so the post is created already pinned. */
  pinned,
  /** Uploaded image URL (`lounge-feed`) or, when no image, sole GIF URL in `media_url`. */
  mediaUrl,
  /** External GIF URL when `mediaUrl` is an uploaded image (see `supabase/lounge_feed_post_gif_url.sql`). */
  gifUrl,
  /** Ordered uploaded image URLs (1..N); sets `image_urls` jsonb (see `supabase/lounge_feed_post_image_urls.sql`). */
  imageUrls,
  /** Cloudflare Stream asset uid (HLS); exclusive of images/GIF in app logic. */
  streamVideoUid,
  /** Public `lounge-feed` URL for a JPEG tile poster (Stream posts only). */
  streamPosterUrl,
  /** Display width/height from source file at post time (Stream posts only). */
  streamVideoWidth,
  streamVideoHeight,
  /** Up to 3 optional category slugs (`category_pills`). */
  categoryPills,
  /** True when the post originates from "Ask Community" on an AP Guide card. */
  isApGuidePost,
  /** Snapshot of the guide hero URL at post time (null = static fallback). */
  guideThumbnailUrl,
  /** Thread continuation: points at root post id; omit on standalone / root inserts. */
  threadRootId,
  /** 0 = root/standalone; 1+ = continuation index. */
  threadPartIndex = 0,
  /** Total parts including root (set on root row when threading). */
  threadPartCount = 1,
}) {
  const cap = normalizeFeedCaption(caption)
  const gt = String(gameTitle ?? '').trim()
  const out = attachCategoryPills(
    {
      caption: cap,
      game_title: gt,
      game_slug: gameSlug || null,
      thread_part_index: Math.max(0, Number(threadPartIndex) || 0),
      thread_part_count: Math.max(1, Number(threadPartCount) || 1),
    },
    categoryPills,
  )
  const rootId = threadRootId != null ? String(threadRootId).trim() : ''
  if (rootId) out.thread_root_id = rootId
  if (pinned === true) out.pinned = true
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
  }
  const gu = gifUrl != null ? String(gifUrl).trim() : ''
  if (gu) out.gif_url = gu
  if (isApGuidePost === true) {
    out.is_ap_guide_post = true
    const thu = guideThumbnailUrl != null ? String(guideThumbnailUrl).trim() : ''
    if (thu) out.guide_thumbnail_url = thu
  }
  return out
}

/**
 * Insert payload for a quote repost: new visible row with caption + link to the original post.
 * When `streamVideoUid` is set, matches main post Stream columns (`supabase/lounge_feed_post_stream_video.sql`).
 */
export function communityFeedQuoteRepostInsertPayload({
  caption,
  originalPostId,
  mediaUrl,
  gifUrl,
  imageUrls,
  streamVideoUid,
  streamPosterUrl,
  streamVideoWidth,
  streamVideoHeight,
  categoryPills,
}) {
  const cap = normalizeFeedCaption(caption)
  const out = attachCategoryPills(
    {
      caption: cap,
      game_title: '',
      game_slug: null,
      repost_of_post_id: originalPostId,
      is_plain_repost: false,
    },
    categoryPills,
  )
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
  }
  const gu = gifUrl != null ? String(gifUrl).trim() : ''
  if (gu) out.gif_url = gu
  return out
}

/** Plain repost (no quote): empty caption + `is_plain_repost` (see `supabase/lounge_plain_reposts.sql`). */
export function communityFeedPlainRepostInsertPayload({ originalPostId, categoryPills }) {
  return attachCategoryPills(
    {
      caption: '',
      game_title: '',
      game_slug: null,
      repost_of_post_id: originalPostId,
      is_plain_repost: true,
    },
    categoryPills,
  )
}

/**
 * Plain repost of a comment: creates a community_feed_posts row owned by the reposter
 * so the repost appears in the main feed (see `supabase/migrations/20260517000000_feed_comment_repost_on_feed.sql`).
 */
export function communityFeedCommentRepostInsertPayload({ originalCommentId, categoryPills }) {
  return attachCategoryPills(
    {
      caption: '',
      game_title: '',
      game_slug: null,
      repost_of_comment_id: originalCommentId,
      is_plain_repost: true,
    },
    categoryPills,
  )
}

/**
 * Quote repost of a comment: new feed row with caption + media + link to the original comment.
 */
export function communityFeedCommentQuoteRepostInsertPayload({
  caption,
  originalCommentId,
  mediaUrl,
  gifUrl,
  imageUrls,
  streamVideoUid,
  streamPosterUrl,
  streamVideoWidth,
  streamVideoHeight,
  categoryPills,
}) {
  const cap = normalizeFeedCaption(caption)
  const out = attachCategoryPills(
    {
      caption: cap,
      game_title: '',
      game_slug: null,
      repost_of_comment_id: originalCommentId,
      is_plain_repost: false,
    },
    categoryPills,
  )
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
  }
  const gu = gifUrl != null ? String(gifUrl).trim() : ''
  if (gu) out.gif_url = gu
  return out
}

const LOUNGE_FEED_MEDIA_BUCKET = 'lounge-feed'

/** Collect hosted image URLs on a feed post or comment row (for delete). */
export function collectLoungeFeedStoredMediaUrls(row) {
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  const add = (u) => {
    const s = String(u || '').trim()
    if (!s || !isLoungeHostedFeedMediaUrl(s) || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  for (const u of feedPostImageUrls(row)) add(u)
  add(feedPostStreamPosterUrl(row))
  const mu = String(row?.media_url ?? '').trim()
  if (mu && isLoungeHostedFeedMediaUrl(mu)) add(mu)
  return out
}

async function deleteLoungeFeedSupabaseObjectFromPublicUrl(supabaseClient, publicUrl) {
  const u = String(publicUrl || '').trim()
  if (!u || !supabaseClient || !isLoungeSupabaseFeedMediaUrl(u)) return
  const lower = u.toLowerCase()
  let path = ''
  const m = u.match(/\/object\/public\/lounge-feed\/(.+)$/i)
  if (m?.[1]) {
    path = decodeURIComponent(String(m[1]).split('?')[0])
  } else {
    const idx = lower.indexOf('/lounge-feed/')
    if (idx < 0) return
    path = decodeURIComponent(u.slice(idx + '/lounge-feed/'.length).split('?')[0])
  }
  path = path.replace(/^\/+/, '')
  if (!path) return
  try {
    await supabaseClient.storage.from(LOUNGE_FEED_MEDIA_BUCKET).remove([path])
  } catch {
    // ignore
  }
}

/**
 * Best-effort remove of a hosted Lounge image (R2 or legacy `lounge-feed`) by public URL.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} publicUrl
 */
export async function deleteLoungeFeedMediaFromPublicUrl(supabaseClient, publicUrl) {
  const u = String(publicUrl || '').trim()
  if (!u || !supabaseClient) return
  if (isLoungeCfR2MediaUrl(u)) {
    try {
      await deleteCfR2ObjectByPublicUrl(supabaseClient, u)
    } catch {
      // ignore - row delete should still proceed
    }
    return
  }
  await deleteLoungeFeedSupabaseObjectFromPublicUrl(supabaseClient, u)
}

/** @deprecated Use {@link deleteLoungeFeedMediaFromPublicUrl} */
export async function deleteLoungeFeedStreamPosterFromPublicUrl(supabaseClient, publicUrl) {
  return deleteLoungeFeedMediaFromPublicUrl(supabaseClient, publicUrl)
}

async function uploadLoungeFeedPostImageToSupabase({ supabaseClient, user, file }) {
  const mime = String(file?.type || '').toLowerCase()
  if (!mime.startsWith('image/')) {
    return { data: null, error: new Error('Please choose an image file.') }
  }

  let ext = (file.name?.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || ''
  if (!ext || ext === 'jpeg') {
    if (mime.includes('webp')) ext = 'webp'
    else if (mime.includes('png')) ext = 'png'
    else if (mime.includes('gif')) ext = 'gif'
    else ext = 'jpg'
  }
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabaseClient.storage.from(LOUNGE_FEED_MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
  })
  if (uploadError) {
    const raw = String(uploadError.message || uploadError.error || uploadError.statusCode || uploadError || '').trim()
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return {
        data: null,
        error: new Error('Could not upload your image. Check your connection and try again.'),
      }
    }
    return {
      data: null,
      error: uploadError instanceof Error ? uploadError : new Error(raw || 'Could not upload image.'),
    }
  }

  const { data } = supabaseClient.storage.from(LOUNGE_FEED_MEDIA_BUCKET).getPublicUrl(path)
  return { data: data?.publicUrl || null, error: null }
}

/** Upload a single image - Cloudflare R2 when configured, else legacy Supabase `lounge-feed`. */
export async function uploadLoungeFeedPostImage({ supabaseClient, user, file, signal }) {
  const r2 = await uploadLoungeFeedPostImageToCfR2(supabaseClient, user, file, { signal })
  if (r2.error) return { data: null, error: r2.error }
  if (r2.data) return { data: r2.data, error: null }
  return uploadLoungeFeedPostImageToSupabase({ supabaseClient, user, file })
}
