const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Parse a Lounge post id from a raw UUID or share URL (`?post=`). */
export function parsePostIdFromPortalInput(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  if (UUID_RE.test(s)) return s.toLowerCase()

  try {
    const url = new URL(s.includes('://') ? s : `https://edgetilt.com/${s.replace(/^\//, '')}`)
    for (const key of ['post', 'postId']) {
      const q = url.searchParams.get(key)
      if (q && UUID_RE.test(q)) return q.toLowerCase()
    }
    const pathMatch = url.pathname.match(UUID_RE)
    if (pathMatch?.[0]) return pathMatch[0].toLowerCase()
  } catch {
    /* not a URL */
  }

  const embedded = s.match(UUID_RE)
  return embedded?.[0]?.toLowerCase() ?? null
}
