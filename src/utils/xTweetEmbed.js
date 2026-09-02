/** @typedef {{ id?: string, text?: string, author_handle?: string | null, author_name?: string | null, author_avatar_url?: string | null, created_at?: string | null, media_urls?: string[] | null }} XTweetEmbedPreview */

/** @typedef {{ url?: string, embed_kind?: string | null, x_tweet?: XTweetEmbedPreview | null }} XTweetPreviewLike */

/**
 * @param {XTweetPreviewLike | null | undefined} preview
 */
export function isXTweetLinkPreview(preview) {
  if (!preview || typeof preview !== 'object') return false
  if (preview.embed_kind === 'x_tweet') return Boolean(resolveXTweetEmbed(preview)?.text)
  return false
}

/**
 * @param {XTweetPreviewLike | null | undefined} preview
 * @returns {XTweetEmbedPreview | null}
 */
export function resolveXTweetEmbed(preview) {
  const embed = preview?.x_tweet
  if (!embed || typeof embed !== 'object') return null
  const text = String(embed.text || '').trim()
  if (!text) return null
  const media = Array.isArray(embed.media_urls)
    ? embed.media_urls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 4)
    : []
  return {
    id: String(embed.id || '').trim() || null,
    text,
    author_handle: String(embed.author_handle || '').trim().replace(/^@/, '').toLowerCase() || null,
    author_name: String(embed.author_name || '').trim() || null,
    author_avatar_url: String(embed.author_avatar_url || '').trim() || null,
    created_at: String(embed.created_at || '').trim() || null,
    media_urls: media,
  }
}

/**
 * @param {string | null | undefined} createdAt
 */
export function xTweetAgeLabel(createdAt) {
  const raw = String(createdAt || '').trim()
  if (!raw) return ''
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return ''
  const diffMs = Date.now() - ms
  if (diffMs < 0) return ''
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export const CHAT_X_TWEET_EMBED_WIDTH_CLASS = 'w-full max-w-[280px]'
