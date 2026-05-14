/**
 * Vercel Serverless: HTML + Open Graph / Twitter Card meta for Lounge post permalinks.
 * Shared URL path: `/lounge/p/:postId` (rewritten here from `vercel.json`).
 * Typical preview: `og:image` → `og:title` → domain. **Apple Messages often drops `og:description`**
 * on large-image cards, so **byline · caption · stats** are folded into **`og:title`** (`compoundOgTitle`).
 * `og:description` remains for Slack / Facebook / etc. **`/favicon.ico`** first for domain-row icons.
 *
 * Env (set on Vercel; same as the Vite client): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const POST_SELECT =
  'id,caption,user_id,like_count,comment_count,stream_poster_url,media_url,image_urls,gif_url'

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function oneLine(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickOgImage(post, origin) {
  for (const key of ['stream_poster_url', 'media_url', 'gif_url']) {
    const u = String(post[key] || '').trim()
    if (/^https?:\/\//i.test(u)) return u
  }
  let urls = post.image_urls
  if (typeof urls === 'string') {
    try {
      urls = JSON.parse(urls)
    } catch {
      urls = null
    }
  }
  if (Array.isArray(urls)) {
    for (const item of urls) {
      const u = String(item || '').trim()
      if (/^https?:\/\//i.test(u)) return u
    }
  }
  return `${origin}/apple-touch-icon.png`
}

function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${Math.round(n / 1000)}K`
}

function statsLine(post) {
  const likes = formatCount(Number(post.like_count))
  const comments = formatCount(Number(post.comment_count))
  return `${likes} likes · ${comments} comments`
}

/**
 * Attribution line, e.g. `Queen Edge (@selena) on Edge` (placed **before** caption in `compoundOgTitle`).
 * `is_og` appends a check mark (plain text; OS controls color — not Instagram’s red asset).
 */
function buildAuthorByline(displayName, handle, isOg) {
  const mark = isOg ? ' \u2714' : ''
  const core =
    handle && displayName !== handle ? `${displayName} (${handle}) on Edge` : `${displayName} on Edge`
  return `${core}${mark}`
}

/** iMessage large-image previews often hide `og:description` — one string: `byline · caption · stats`. */
const OG_TITLE_MAX = 380

function compoundOgTitle(captionSnippet, byline, stats) {
  const sep = ' · '
  if (!captionSnippet) {
    return `${byline}${sep}${stats}`
  }
  const full = `${byline}${sep}${captionSnippet}${sep}${stats}`
  if (full.length <= OG_TITLE_MAX) {
    return full
  }
  const prefix = `${byline}${sep}`
  const suffix = `${sep}${stats}`
  const midBudget = OG_TITLE_MAX - prefix.length - suffix.length - 1
  if (midBudget < 8) {
    return `${byline}${sep}${stats}`
  }
  const capTrunc =
    captionSnippet.length > midBudget - 1
      ? `${captionSnippet.slice(0, midBudget - 1)}\u2026`
      : captionSnippet
  return `${prefix}${capTrunc}${suffix}`
}

function jsonLdScript(obj) {
  const raw = JSON.stringify(obj)
  const safe = raw.replace(/</g, '\\u003c')
  return `  <script type="application/ld+json">${safe}</script>
`
}

/** Same icon hints as `index.html` — include `/favicon.ico` first (many crawlers only request that). */
function appBrandLinkTags(origin) {
  const o = escapeAttr(origin.replace(/\/$/, ''))
  return `  <link rel="shortcut icon" href="${o}/favicon.ico" />
  <link rel="icon" type="image/png" sizes="32x32" href="${o}/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="${o}/favicon-16x16.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="${o}/favicon-96x96.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="${o}/apple-touch-icon.png?v=7" />
  <meta name="apple-mobile-web-app-title" content="Edge" />
`
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers, redirect: 'follow' })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

function genericHtml(origin, canonicalPath, title, description) {
  const canonical = `${origin}${canonicalPath}`
  const ogImage = `${origin}/apple-touch-icon.png`
  const brand = appBrandLinkTags(origin)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${brand}
  <title>${escapeAttr(title)}</title>
  <link rel="canonical" href="${escapeAttr(canonical)}" />
  <meta property="og:site_name" content="Edge" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeAttr(title)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(canonical)}" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(title)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
  <meta http-equiv="refresh" content="0;url=${escapeAttr(`${origin}/?tab=home`)}">
</head>
<body>
  <p><a href="${escapeAttr(`${origin}/?tab=home`)}">Open Edge</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  let rawId = typeof req.query?.postId === 'string' ? req.query.postId : ''
  if (!rawId && typeof req.url === 'string') {
    try {
      const u = new URL(req.url, 'http://localhost')
      rawId = u.searchParams.get('postId') || ''
    } catch {
      rawId = ''
    }
  }
  const postId = decodeURIComponent(rawId).trim()

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const origin = host ? `${proto}://${host}` : ''

  const canonicalPath = postId && UUID_RE.test(postId) ? `/lounge/p/${postId}` : '/lounge/p'

  if (!UUID_RE.test(postId) || !origin) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.end(
      genericHtml(
        origin || 'https://example.invalid',
        '/lounge/p',
        'Edge Lounge',
        'Lounge posts on Edge.',
      ),
    )
    return
  }

  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (!supabaseUrl || !anonKey) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('OG route misconfigured: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
    return
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  }

  const postUrl = `${supabaseUrl}/rest/v1/community_feed_posts?id=eq.${postId}&hidden_at=is.null&select=${encodeURIComponent(POST_SELECT)}`
  const { ok, data: postRows } = await fetchJson(postUrl, headers)
  const post = ok && Array.isArray(postRows) && postRows[0] ? postRows[0] : null

  if (!post) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=120')
    res.end(
      genericHtml(
        origin,
        canonicalPath,
        'Edge Lounge',
        'This post is unavailable or may have been removed.',
      ),
    )
    return
  }

  const uid = String(post.user_id || '').trim()
  let displayName = 'Member'
  let handle = ''
  let isOg = false
  if (uid && UUID_RE.test(uid)) {
    const profileUrl = `${supabaseUrl}/rest/v1/profiles?user_id=eq.${uid}&select=display_name,handle,is_og`
    const { ok: pOk, data: profRows } = await fetchJson(profileUrl, headers)
    const pr = pOk && Array.isArray(profRows) && profRows[0] ? profRows[0] : null
    if (pr) {
      const dn = String(pr.display_name || '').trim()
      const h = String(pr.handle || '').trim()
      if (dn) displayName = dn
      if (h) {
        handle = `@${h}`
        if (!dn) displayName = `@${h}`
      }
      isOg = Boolean(pr.is_og)
    }
  }

  const captionRaw = oneLine(post.caption || '')
  const captionSnippet = captionRaw.length > 220 ? `${captionRaw.slice(0, 217)}\u2026` : captionRaw
  const byline = buildAuthorByline(displayName, handle, isOg)
  const stats = statsLine(post)
  const hasCaption = captionSnippet.length > 0

  /** iMessage often ignores `og:description` on large-image cards — pack into `og:title`. */
  const ogTitle = compoundOgTitle(hasCaption ? captionSnippet : '', byline, stats)
  const ogDescription = hasCaption ? `${byline} · ${captionSnippet} · ${stats}` : stats
  const docTitle =
    ogTitle.length > 72 ? `${ogTitle.slice(0, 69)}\u2026 · Edge` : `${ogTitle} · Edge`

  const ogImage = pickOgImage(post, origin)
  const canonical = `${origin}/lounge/p/${postId}`
  const appTarget = `${origin}/?tab=home&post=${encodeURIComponent(postId)}`
  const brand = appBrandLinkTags(origin)

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: captionSnippet || byline,
    alternativeHeadline: byline,
    ...(captionSnippet ? { articleBody: captionSnippet } : {}),
    author: {
      '@type': 'Person',
      name: displayName,
      ...(handle ? { alternateName: handle } : {}),
    },
    image: ogImage,
    url: canonical,
    description: ogDescription,
  }
  const ldHtml = jsonLdScript(ldJson)

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${brand}
  <title>${escapeAttr(docTitle)}</title>
  <link rel="canonical" href="${escapeAttr(canonical)}" />
  <meta property="og:site_name" content="Edge" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeAttr(ogTitle)}" />
  <meta property="og:description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:url" content="${escapeAttr(canonical)}" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
${ldHtml}
  <meta http-equiv="refresh" content="0;url=${escapeAttr(appTarget)}">
  <script>window.location.replace(${JSON.stringify(appTarget)})</script>
</head>
<body>
  <p><a href="${escapeAttr(appTarget)}">Open this post in Edge</a></p>
</body>
</html>`

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
  res.end(html)
}
