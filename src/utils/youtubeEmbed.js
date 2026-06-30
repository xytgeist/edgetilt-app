/** @typedef {{ url?: string, youtube_video_id?: string | null, embed_kind?: string | null }} YouTubePreviewLike */

const YT_ID_RE = /^[\w-]{11}$/

/**
 * @param {string} url
 * @returns {string | null}
 */
export function parseYouTubeVideoId(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]?.split('?')[0]
      return id && YT_ID_RE.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const fromWatch = u.searchParams.get('v')
      if (fromWatch && YT_ID_RE.test(fromWatch)) return fromWatch
      for (const re of [/^\/shorts\/([\w-]{11})/, /^\/embed\/([\w-]{11})/, /^\/live\/([\w-]{11})/, /^\/v\/([\w-]{11})/]) {
        const m = u.pathname.match(re)
        if (m?.[1] && YT_ID_RE.test(m[1])) return m[1]
      }
    }
  } catch {
    /* */
  }
  return null
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isYouTubeUrl(url) {
  return Boolean(parseYouTubeVideoId(url))
}

/**
 * @param {YouTubePreviewLike | null | undefined} preview
 * @returns {string | null}
 */
export function resolveYouTubeVideoId(preview) {
  if (!preview) return null
  const fromField = String(preview.youtube_video_id || '').trim()
  if (fromField && YT_ID_RE.test(fromField)) return fromField
  if (preview.embed_kind === 'youtube' && fromField) return fromField
  return parseYouTubeVideoId(preview.url)
}

/**
 * @param {YouTubePreviewLike | null | undefined} preview
 * @returns {boolean}
 */
export function isYouTubeLinkPreview(preview) {
  if (!preview?.url) return false
  if (preview.embed_kind === 'youtube') return Boolean(resolveYouTubeVideoId(preview))
  return Boolean(parseYouTubeVideoId(preview.url))
}

/**
 * @param {string} videoId
 * @param {{ autoplay?: boolean }} [opts]
 * @returns {string}
 */
export function youtubeEmbedSrc(videoId, { autoplay = false } = {}) {
  const id = String(videoId || '').trim()
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`
}

/**
 * @param {string} videoId
 * @param {'hqdefault' | 'mqdefault' | 'maxresdefault'} [quality]
 * @returns {string}
 */
export function youtubeThumbnailUrl(videoId, quality = 'hqdefault') {
  return `https://i.ytimg.com/vi/${encodeURIComponent(String(videoId || '').trim())}/${quality}.jpg`
}

/** Chat inline YouTube card - do not shrink below this when a caption is short. */
export const CHAT_YOUTUBE_EMBED_MIN_WIDTH_PX = 280
export const CHAT_YOUTUBE_EMBED_MAX_WIDTH_PX = 320
export const CHAT_YOUTUBE_EMBED_WIDTH_CLASS = 'w-full min-w-[280px] max-w-[320px]'
