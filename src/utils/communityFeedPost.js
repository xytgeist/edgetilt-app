/**
 * Feed post helpers: `caption` is the main user-authored text on `community_feed_posts`.
 * Quote reposts set `repost_of_post_id` and a non-empty `caption`. Plain reposts use `is_plain_repost` and empty caption.
 */

/** Trimmed caption string (empty if missing). */
export function feedPostDisplayCaption(row) {
  const v = (row || {}).caption
  if (v != null && String(v).trim() !== '') return String(v)
  return ''
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

/** Normalized caption for insert/update (trim, max 280). */
export function normalizeFeedCaption(caption) {
  return String(caption ?? '')
    .trim()
    .slice(0, 280)
}

/**
 * Insert payload for `community_feed_posts` (caption + optional game context + optional `media_url`).
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
}) {
  const cap = normalizeFeedCaption(caption)
  const gt = String(gameTitle ?? '').trim()
  const out = {
    caption: cap,
    game_title: gt,
    game_slug: gameSlug || null,
  }
  if (pinned === true) out.pinned = true
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

/**
 * Insert payload for a quote repost: new visible row with caption + link to the original post.
 */
export function communityFeedQuoteRepostInsertPayload({ caption, originalPostId, mediaUrl, gifUrl, imageUrls }) {
  const cap = normalizeFeedCaption(caption)
  const out = {
    caption: cap,
    game_title: '',
    game_slug: null,
    repost_of_post_id: originalPostId,
    is_plain_repost: false,
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
export function communityFeedPlainRepostInsertPayload({ originalPostId }) {
  return {
    caption: '',
    game_title: '',
    game_slug: null,
    repost_of_post_id: originalPostId,
    is_plain_repost: true,
  }
}

const LOUNGE_FEED_MEDIA_BUCKET = 'lounge-feed'

/** Upload a single image for a feed post; path prefix must be `user.id/`. */
export async function uploadLoungeFeedPostImage({ supabaseClient, user, file }) {
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
