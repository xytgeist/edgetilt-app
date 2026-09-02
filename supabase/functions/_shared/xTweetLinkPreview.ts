import { fetchTweetViaOembed } from './loungeBotXTweetFetch.ts'
import { syndicationTweetResultUrl } from './loungeBotXTweetSyndication.ts'
import { parseXTweetUrl } from './loungeBotXTweetUrl.ts'
import type { LinkPreviewPayload } from './linkUnfurl.ts'

export type XTweetMediaItem = {
  type: 'photo' | 'video' | 'animated_gif'
  /** Image URL for photos; best MP4 URL for video/gif. */
  url: string
  poster_url?: string | null
}

export type XTweetEmbedPreview = {
  id: string
  text: string
  author_handle: string | null
  author_name: string | null
  author_avatar_url: string | null
  author_verified: boolean
  created_at: string | null
  view_count: number | null
  /** @deprecated Prefer `media`. Kept for older clients. */
  media_urls: string[]
  media: XTweetMediaItem[]
}

function normalizeAvatarUrl(raw: string): string | null {
  const url = String(raw || '').trim()
  if (!url) return null
  return url.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.')
}

function parseViewCount(json: Record<string, unknown>): number | null {
  const views = json.views
  if (views && typeof views === 'object') {
    const count = Number((views as { count?: unknown }).count)
    if (Number.isFinite(count) && count > 0) return Math.floor(count)
  }
  const direct = Number(json.view_count)
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct)
  return null
}

function bestMp4FromVariants(variants: unknown): string | null {
  if (!Array.isArray(variants)) return null
  let bestUrl: string | null = null
  let bestBitrate = -1
  for (const raw of variants) {
    if (!raw || typeof raw !== 'object') continue
    const v = raw as Record<string, unknown>
    const contentType = String(v.content_type || v.type || '').toLowerCase()
    if (!contentType.includes('video/mp4')) continue
    const url = String(v.url || v.src || '').trim()
    if (!url) continue
    const bitrate = Number(v.bitrate)
    const score = Number.isFinite(bitrate) ? bitrate : 0
    if (score >= bestBitrate) {
      bestBitrate = score
      bestUrl = url
    }
  }
  return bestUrl
}

function mediaFromSyndication(json: Record<string, unknown>): XTweetMediaItem[] {
  const out: XTweetMediaItem[] = []
  const seen = new Set<string>()
  const push = (item: XTweetMediaItem | null) => {
    if (!item?.url || seen.has(item.url)) return
    seen.add(item.url)
    out.push(item)
  }

  const mediaDetails = json.mediaDetails
  if (Array.isArray(mediaDetails)) {
    for (const raw of mediaDetails) {
      if (!raw || typeof raw !== 'object') continue
      const media = raw as Record<string, unknown>
      const typeRaw = String(media.type || '').toLowerCase()
      const poster = String(media.media_url_https || '').trim() || null
      if (typeRaw === 'video' || typeRaw === 'animated_gif') {
        const videoInfo = media.video_info && typeof media.video_info === 'object'
          ? media.video_info as Record<string, unknown>
          : null
        const mp4 = bestMp4FromVariants(videoInfo?.variants) ||
          bestMp4FromVariants((json.video as { variants?: unknown } | undefined)?.variants)
        if (mp4) {
          push({
            type: typeRaw === 'animated_gif' ? 'animated_gif' : 'video',
            url: mp4,
            poster_url: poster,
          })
          continue
        }
      }
      if (poster) push({ type: 'photo', url: poster, poster_url: null })
    }
  }

  const topVideo = json.video && typeof json.video === 'object'
    ? json.video as Record<string, unknown>
    : null
  if (topVideo && !out.some((m) => m.type === 'video' || m.type === 'animated_gif')) {
    const mp4 = bestMp4FromVariants(topVideo.variants)
    const poster = String(topVideo.poster || '').trim() || null
    if (mp4) {
      push({
        type: 'video',
        url: mp4,
        poster_url: poster,
      })
    }
  }

  const photos = json.photos
  if (Array.isArray(photos)) {
    for (const photo of photos) {
      if (!photo || typeof photo !== 'object') continue
      const url = String((photo as { url?: string }).url || '').trim()
      if (url) push({ type: 'photo', url, poster_url: null })
    }
  }

  return out.slice(0, 4)
}

/** Drop media shortlinks already represented as embed media (keep other outbound t.co links). */
function stripTrailingMediaUrls(text: string, json: Record<string, unknown>): string {
  let out = String(text || '').trim()
  const urls: string[] = []
  const mediaDetails = Array.isArray(json.mediaDetails) ? json.mediaDetails : []
  for (const raw of mediaDetails) {
    if (!raw || typeof raw !== 'object') continue
    const media = raw as { url?: string }
    const short = String(media.url || '').trim()
    if (short) urls.push(short)
  }
  for (const short of urls) {
    if (!out.includes(short)) continue
    out = out.split(short).join(' ')
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || String(text || '').trim()
}

async function fetchTweetEmbedViaSyndication(tweetId: string): Promise<XTweetEmbedPreview | null> {
  if (!tweetId) return null
  const res = await fetch(syndicationTweetResultUrl(tweetId), {
    headers: { 'User-Agent': 'EdgeTiltLinkPreview/1.0 (+https://edgetilt.com)' },
  })
  if (!res.ok) return null

  const json = await res.json()
  if (!json || typeof json !== 'object') return null
  const record = json as Record<string, unknown>
  const rawText = String(record.text || '').trim()
  if (!rawText) return null

  const user = record.user && typeof record.user === 'object' ? record.user as Record<string, unknown> : {}
  const authorHandle = String(user.screen_name || user.name || '').trim().toLowerCase()
  const authorName = String(user.name || '').trim() || null
  const authorVerified = user.is_blue_verified === true || user.verified === true
  const media = mediaFromSyndication(record)
  const text = media.length ? stripTrailingMediaUrls(rawText, record) : rawText

  return {
    id: tweetId,
    text,
    author_handle: authorHandle || null,
    author_name: authorName,
    author_avatar_url: normalizeAvatarUrl(String(user.profile_image_url_https || user.profile_image_url || '')),
    author_verified: authorVerified,
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    view_count: parseViewCount(record),
    media_urls: media.map((m) => (m.type === 'photo' ? m.url : (m.poster_url || m.url))).filter(Boolean),
    media,
  }
}

/** Resolve public tweet content for inline Lounge/chat embeds (no X API bearer required). */
export async function fetchXTweetEmbedData(tweetUrl: string): Promise<XTweetEmbedPreview | null> {
  const parsed = parseXTweetUrl(tweetUrl)
  if (!parsed?.tweetId) return null

  const fromSyndication = await fetchTweetEmbedViaSyndication(parsed.tweetId)
  if (fromSyndication) {
    return {
      ...fromSyndication,
      author_handle: fromSyndication.author_handle || parsed.handle || null,
    }
  }

  const fromOembed = await fetchTweetViaOembed(tweetUrl)
  if (!fromOembed?.text) return null

  const oembedMeta = fromOembed.payload?.oembed as { author_name?: string } | undefined
  const authorName = String(oembedMeta?.author_name || '').trim() || null

  return {
    id: parsed.tweetId,
    text: fromOembed.text,
    author_handle: fromOembed.authorHandle || parsed.handle || null,
    author_name: authorName,
    author_avatar_url: null,
    author_verified: false,
    created_at: fromOembed.created_at || null,
    view_count: null,
    media_urls: [],
    media: [],
  }
}

export function buildXTweetLinkPreview(url: string, tweet: XTweetEmbedPreview): LinkPreviewPayload {
  const handle = tweet.author_handle ? `@${tweet.author_handle.replace(/^@/, '')}` : ''
  const title = tweet.author_name
    ? `${tweet.author_name} on X`
    : handle
      ? `${handle} on X`
      : 'Post on X'
  const firstPoster = tweet.media.find((m) => m.poster_url)?.poster_url
    || tweet.media.find((m) => m.type === 'photo')?.url
    || null

  return {
    url,
    title,
    description: tweet.text.slice(0, 500) || null,
    image_url: firstPoster,
    favicon_url: 'https://abs.twimg.com/favicons/twitter.3.ico',
    site_name: 'X',
    layout: 'compact',
    lounge_post_id: null,
    accent_color: '#000000',
    embed_kind: 'x_tweet',
    x_tweet: {
      id: tweet.id,
      text: tweet.text,
      author_handle: tweet.author_handle,
      author_name: tweet.author_name,
      author_avatar_url: tweet.author_avatar_url,
      author_verified: tweet.author_verified,
      created_at: tweet.created_at,
      view_count: tweet.view_count,
      media_urls: tweet.media_urls,
      media: tweet.media,
    },
  }
}
