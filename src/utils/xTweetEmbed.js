/** @typedef {{ type?: 'photo' | 'video' | 'animated_gif', url?: string, poster_url?: string | null }} XTweetMediaItem */

/** @typedef {{ id?: string, text?: string, author_handle?: string | null, author_name?: string | null, author_avatar_url?: string | null, author_verified?: boolean, created_at?: string | null, view_count?: number | null, media_urls?: string[] | null, media?: XTweetMediaItem[] | null }} XTweetEmbedPreview */

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
 * @param {XTweetEmbedPreview | null | undefined} embed
 * @returns {XTweetMediaItem[]}
 */
function resolveMediaItems(embed) {
  if (Array.isArray(embed?.media) && embed.media.length) {
    return embed.media
      .map((item) => {
        const url = String(item?.url || '').trim()
        if (!url) return null
        const typeRaw = String(item?.type || 'photo').toLowerCase()
        const type = typeRaw === 'video' || typeRaw === 'animated_gif' ? typeRaw : 'photo'
        return {
          type,
          url,
          poster_url: String(item?.poster_url || '').trim() || null,
        }
      })
      .filter(Boolean)
      .slice(0, 4)
  }

  const urls = Array.isArray(embed?.media_urls)
    ? embed.media_urls.map((url) => String(url || '').trim()).filter(Boolean)
    : []
  return urls.slice(0, 4).map((url) => ({ type: 'photo', url, poster_url: null }))
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
  const media = resolveMediaItems(embed)
  const viewCount = Number(embed.view_count)
  return {
    id: String(embed.id || '').trim() || null,
    text,
    author_handle: String(embed.author_handle || '').trim().replace(/^@/, '').toLowerCase() || null,
    author_name: String(embed.author_name || '').trim() || null,
    author_avatar_url: String(embed.author_avatar_url || '').trim() || null,
    author_verified: embed.author_verified === true,
    created_at: String(embed.created_at || '').trim() || null,
    view_count: Number.isFinite(viewCount) && viewCount > 0 ? Math.floor(viewCount) : null,
    media_urls: media.map((m) => (m.type === 'photo' ? m.url : m.poster_url || m.url)).filter(Boolean),
    media,
  }
}

/**
 * X-style timestamp line: "3:25 AM · Sep 1, 2026"
 * @param {string | null | undefined} createdAt
 */
export function formatXTweetTimestamp(createdAt) {
  const raw = String(createdAt || '').trim()
  if (!raw) return ''
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return ''
  try {
    const d = new Date(ms)
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    const date = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return `${time} · ${date}`
  } catch {
    return ''
  }
}

/**
 * @param {number | null | undefined} count
 */
export function formatXTweetViewCount(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 1) return ''
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M Views`
  }
  if (n >= 1_000) {
    const v = n / 1_000
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}K Views`
  }
  return `${n} Views`
}

export const CHAT_X_TWEET_EMBED_WIDTH_CLASS = 'w-full max-w-[340px]'
