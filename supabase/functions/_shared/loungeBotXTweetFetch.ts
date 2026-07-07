import { readXApiError } from './loungeBotXApi.ts'
import { canonicalXTweetUrl, parseXTweetUrl } from './loungeBotXTweetUrl.ts'

const X_API = 'https://api.x.com/2'

export type ResolvedTweet = {
  id: string
  text: string
  created_at?: string
  authorHandle: string
  source: 'x_api' | 'oembed' | 'syndication' | 'manual'
  payload?: Record<string, unknown>
}

function decodeHtmlEntities(raw: string): string {
  return String(raw || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
}

function textFromOembedHtml(html: string): string {
  let text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  text = decodeHtmlEntities(text)
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  // Trim trailing attribution line from oEmbed blockquote.
  text = text.replace(/\n—\s+[^\n]+$/u, '').trim()
  return text
}

function handleFromAuthorUrl(authorUrl: string): string {
  const m = String(authorUrl || '').match(/(?:twitter\.com|x\.com)\/([^/?]+)/i)
  return m ? m[1].toLowerCase() : ''
}

/** Public oEmbed — no X API bearer required (public tweets only). */
export async function fetchTweetViaOembed(tweetUrl: string): Promise<ResolvedTweet | null> {
  const params = new URLSearchParams({
    url: tweetUrl,
    omit_script: '1',
    hide_thread: '1',
    hide_media: '0',
  })
  const res = await fetch(`https://publish.twitter.com/oembed?${params}`, {
    headers: { 'User-Agent': 'EdgeTiltBot/1.0 (+https://edgetilt.com)' },
  })
  if (!res.ok) return null

  const json = await res.json()
  const text = textFromOembedHtml(String(json?.html || ''))
  if (!text) return null

  const parsed = parseXTweetUrl(tweetUrl)
  const authorHandle = handleFromAuthorUrl(String(json?.author_url || '')) || parsed?.handle || ''

  return {
    id: parsed?.tweetId || '',
    text,
    authorHandle,
    source: 'oembed',
    payload: { oembed: { author_name: json?.author_name, provider: 'twitter_oembed' } },
  }
}

/** Twitter syndication JSON — no bearer; may break if X changes it. */
export async function fetchTweetViaSyndication(tweetId: string): Promise<ResolvedTweet | null> {
  if (!tweetId) return null
  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en`,
    { headers: { 'User-Agent': 'EdgeTiltBot/1.0 (+https://edgetilt.com)' } },
  )
  if (!res.ok) return null

  const json = await res.json()
  const text = String(json?.text || '').trim()
  if (!text) return null

  const authorHandle = String(json?.user?.screen_name || json?.user?.name || '').trim().toLowerCase()

  return {
    id: tweetId,
    text,
    created_at: typeof json?.created_at === 'string' ? json.created_at : undefined,
    authorHandle,
    source: 'syndication',
    payload: { syndication: true },
  }
}

async function fetchTweetViaXApi(tweetId: string, token: string): Promise<ResolvedTweet | null> {
  const params = new URLSearchParams({
    'tweet.fields': 'created_at,entities,referenced_tweets,author_id',
    expansions: 'author_id',
    'user.fields': 'username',
  })
  const res = await fetch(`${X_API}/tweets/${encodeURIComponent(tweetId)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await readXApiError(res))

  const json = await res.json()
  const tw = json?.data
  if (!tw?.id) return null

  const users = Array.isArray(json?.includes?.users) ? json.includes.users : []
  const authorId = String(tw.author_id || '')
  const author = users.find((u: { id?: string }) => String(u?.id || '') === authorId)
  const authorHandle = String(author?.username || '').trim().toLowerCase()

  return {
    id: String(tw.id),
    text: String(tw.text || '').trim(),
    created_at: tw.created_at,
    authorHandle,
    source: 'x_api',
    payload: tw,
  }
}

/**
 * Resolve tweet text for manual paste flow.
 * Bearer optional: manual text → X API (if token) → oEmbed → syndication.
 */
export async function resolveTweetForManualIngest(opts: {
  tweetUrl: string
  tweetId: string
  handleHint?: string
  sourceText?: string
  xBearerToken?: string
}): Promise<ResolvedTweet> {
  const manual = String(opts.sourceText || '').trim()
  if (manual) {
    return {
      id: opts.tweetId,
      text: manual,
      authorHandle: String(opts.handleHint || '').toLowerCase(),
      source: 'manual',
      payload: { manual: true },
    }
  }

  const token = String(opts.xBearerToken || '').trim()
  if (token) {
    try {
      const fromApi = await fetchTweetViaXApi(opts.tweetId, token)
      if (fromApi?.text) return fromApi
    } catch (err) {
      console.warn('lounge-x-ingest X API fetch failed, trying oEmbed', err)
    }
  }

  const fromOembed = await fetchTweetViaOembed(opts.tweetUrl)
  if (fromOembed?.text) {
    return { ...fromOembed, id: fromOembed.id || opts.tweetId }
  }

  const fromSyndication = await fetchTweetViaSyndication(opts.tweetId)
  if (fromSyndication?.text) return fromSyndication

  throw new Error(
    'Could not fetch tweet text automatically. Paste the tweet copy into the Tweet text field ' +
      '(X API not configured or post is not publicly embeddable).',
  )
}

export function tweetSourceUrl(
  handle: string,
  tweetId: string,
  fallbackUrl: string,
): string {
  return canonicalXTweetUrl(handle, tweetId, fallbackUrl)
}
