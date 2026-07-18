/**
 * Parse x.com / twitter.com post URLs (or raw tweet id).
 */
export function parseXTweetUrl(raw: string): { tweetId: string; handle: string } | null {
  const s = String(raw || '').trim()
  if (!s) return null

  if (/^\d{10,25}$/.test(s)) {
    return { tweetId: s, handle: '' }
  }

  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) return null
    const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/i)
    if (!m?.[2]) return null
    return { tweetId: m[2], handle: String(m[1] || '').replace(/^@/, '').toLowerCase() }
  } catch {
    return null
  }
}

export function canonicalXTweetUrl(handle: string, tweetId: string, fallbackUrl?: string) {
  const h = String(handle || '').replace(/^@/, '').trim()
  const id = String(tweetId || '').trim()
  if (h && id) return `https://x.com/${h}/status/${id}`
  return String(fallbackUrl || '').trim() || (id ? `https://x.com/i/status/${id}` : '')
}

const X_TWITTER_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'mobile.twitter.com',
  't.co',
  'pic.twitter.com',
  'pbs.twimg.com',
])

/** True for X/Twitter short links and media hosts ... not generic outbound links in a tweet. */
export function isXTwitterHttpUrl(raw: string): boolean {
  const cleaned = String(raw || '').trim().replace(/[),.;!?]+$/g, '')
  if (!cleaned) return false
  try {
    const host = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '')
    return X_TWITTER_HOSTS.has(host)
  } catch {
    return false
  }
}

/** Remove X/Twitter URLs from caption text (preserve non-X links and line breaks). */
export function stripXTwitterUrlsFromText(text: string): string {
  const lines = String(text || '').split('\n').map((line) =>
    line
      .replace(/https?:\/\/[^\s<>"']+/g, (match) => {
        const cleaned = match.replace(/[),.;!?]+$/g, '')
        return isXTwitterHttpUrl(cleaned) ? '' : match
      })
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n').trim()
}
