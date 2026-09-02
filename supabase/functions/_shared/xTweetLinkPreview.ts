import { fetchTweetViaOembed } from './loungeBotXTweetFetch.ts'
import { parseXTweetUrl } from './loungeBotXTweetUrl.ts'
import type { LinkPreviewPayload } from './linkUnfurl.ts'

export type XTweetEmbedPreview = {
  id: string
  text: string
  author_handle: string | null
  author_name: string | null
  author_avatar_url: string | null
  created_at: string | null
  media_urls: string[]
}

function normalizeAvatarUrl(raw: string): string | null {
  const url = String(raw || '').trim()
  if (!url) return null
  return url.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.')
}

function mediaUrlsFromSyndication(json: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    const url = String(raw || '').trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }

  const photos = json.photos
  if (Array.isArray(photos)) {
    for (const photo of photos) {
      if (!photo || typeof photo !== 'object') continue
      push((photo as { url?: string }).url)
    }
  }

  const mediaDetails = json.mediaDetails
  if (Array.isArray(mediaDetails)) {
    for (const media of mediaDetails) {
      if (!media || typeof media !== 'object') continue
      push((media as { media_url_https?: string }).media_url_https)
    }
  }

  const entities = json.entities
  if (entities && typeof entities === 'object' && Array.isArray((entities as { media?: unknown[] }).media)) {
    for (const media of (entities as { media: { media_url_https?: string }[] }).media) {
      push(media?.media_url_https)
    }
  }

  return out.slice(0, 4)
}

async function fetchTweetEmbedViaSyndication(tweetId: string): Promise<XTweetEmbedPreview | null> {
  if (!tweetId) return null
  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en`,
    { headers: { 'User-Agent': 'EdgeTiltLinkPreview/1.0 (+https://edgetilt.com)' } },
  )
  if (!res.ok) return null

  const json = await res.json()
  const text = String(json?.text || '').trim()
  if (!text) return null

  const user = json?.user && typeof json.user === 'object' ? json.user as Record<string, unknown> : {}
  const authorHandle = String(user.screen_name || user.name || '').trim().toLowerCase()
  const authorName = String(user.name || '').trim() || null

  return {
    id: tweetId,
    text,
    author_handle: authorHandle || null,
    author_name: authorName,
    author_avatar_url: normalizeAvatarUrl(String(user.profile_image_url_https || user.profile_image_url || '')),
    created_at: typeof json?.created_at === 'string' ? json.created_at : null,
    media_urls: mediaUrlsFromSyndication(json as Record<string, unknown>),
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
    created_at: fromOembed.created_at || null,
    media_urls: [],
  }
}

export function buildXTweetLinkPreview(url: string, tweet: XTweetEmbedPreview): LinkPreviewPayload {
  const handle = tweet.author_handle ? `@${tweet.author_handle.replace(/^@/, '')}` : ''
  const title = tweet.author_name
    ? `${tweet.author_name} on X`
    : handle
      ? `${handle} on X`
      : 'Post on X'
  const imageUrl = tweet.media_urls[0] || tweet.author_avatar_url || null

  return {
    url,
    title,
    description: tweet.text.slice(0, 500) || null,
    image_url: imageUrl,
    favicon_url: 'https://abs.twimg.com/favicons/twitter.3.ico',
    site_name: 'X',
    layout: imageUrl ? 'rich' : 'compact',
    lounge_post_id: null,
    accent_color: '#000000',
    embed_kind: 'x_tweet',
    x_tweet: {
      id: tweet.id,
      text: tweet.text,
      author_handle: tweet.author_handle,
      author_name: tweet.author_name,
      author_avatar_url: tweet.author_avatar_url,
      created_at: tweet.created_at,
      media_urls: tweet.media_urls,
    },
  }
}
