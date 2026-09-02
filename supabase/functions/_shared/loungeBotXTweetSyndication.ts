/** Compute public syndication token required by cdn.syndication.twimg.com tweet-result. */
export function syndicationTokenForTweetId(tweetId: string): string {
  const id = String(tweetId || '').trim()
  if (!id) return ''
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

export function syndicationTweetResultUrl(tweetId: string): string {
  const id = String(tweetId || '').trim()
  const token = syndicationTokenForTweetId(id)
  const params = new URLSearchParams({ id, lang: 'en' })
  if (token) params.set('token', token)
  return `https://cdn.syndication.twimg.com/tweet-result?${params}`
}
