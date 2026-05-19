/**
 * Vercel Serverless: HTML + Open Graph / Twitter Card meta for Lounge profile permalinks.
 * Shared URL path: `/u/:handle` (rewritten here from `vercel.json`).
 * Humans are redirected to `/?tab=home&u=:handle`.
 *
 * Env (set on Vercel; same as the Vite client): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
 */

const HANDLE_RE = /^[a-z0-9_]{2,30}$/i

const PROFILE_SELECT = 'user_id,handle,display_name,avatar_url,bio,is_og'

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

function buildAuthorByline(displayName, handle, isOg) {
  const mark = isOg ? ' \u2714' : ''
  const h = handle ? `@${handle}` : ''
  const core =
    h && displayName !== h ? `${displayName} (${h}) on Edge` : `${displayName || h || 'Member'} on Edge`
  return `${core}${mark}`
}

function genericHtml(origin, title, description) {
  const canonical = `${origin}/u`
  const ogImage = `${origin}/apple-touch-icon.png`
  const brand = appBrandLinkTags(origin)
  const appTarget = `${origin}/?tab=home`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${brand}
  <title>${escapeAttr(title)}</title>
  <link rel="canonical" href="${escapeAttr(canonical)}" />
  <meta property="og:site_name" content="Edge" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${escapeAttr(title)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(canonical)}" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(title)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
  <meta http-equiv="refresh" content="0;url=${escapeAttr(appTarget)}">
</head>
<body>
  <p><a href="${escapeAttr(appTarget)}">Open Edge</a></p>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  let rawHandle = typeof req.query?.handle === 'string' ? req.query.handle : ''
  if (!rawHandle && typeof req.url === 'string') {
    try {
      const u = new URL(req.url, 'http://localhost')
      rawHandle = u.searchParams.get('handle') || ''
    } catch {
      rawHandle = ''
    }
  }
  const handle = decodeURIComponent(rawHandle).trim().replace(/^@/, '').toLowerCase()

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const origin = host ? `${proto}://${host}` : ''

  if (!HANDLE_RE.test(handle) || !origin) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.end(
      genericHtml(
        origin || 'https://example.invalid',
        'Edge Lounge profile',
        'Profiles on Edge Lounge.',
      ),
    )
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.end(genericHtml(origin, 'Edge Lounge profile', 'Open this profile in Edge.'))
    return
  }

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  }
  const profileUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=${encodeURIComponent(PROFILE_SELECT)}&handle=ilike.${encodeURIComponent(handle)}&limit=1`
  const { ok, data } = await fetchJson(profileUrl, headers)
  const profile = ok && Array.isArray(data) && data[0] ? data[0] : null

  if (!profile?.user_id) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.end(
      genericHtml(
        origin,
        'Profile not found · Edge',
        'This profile is unavailable on Edge Lounge.',
      ),
    )
    return
  }

  const storedHandle = String(profile.handle || handle).trim()
  const displayName = oneLine(profile.display_name || '') || (storedHandle ? `@${storedHandle}` : 'Member')
  const byline = buildAuthorByline(displayName, storedHandle, Boolean(profile.is_og))
  const bioRaw = oneLine(profile.bio || '')
  const bioSnippet = bioRaw.length > 160 ? `${bioRaw.slice(0, 157)}\u2026` : bioRaw
  const ogTitle = bioSnippet ? `${byline} · ${bioSnippet}` : byline
  const ogDescription = 'Open this profile in Edge.'
  const docTitle = ogTitle.length > 72 ? `${ogTitle.slice(0, 69)}\u2026 · Edge` : `${ogTitle} · Edge`

  let ogImage = `${origin}/apple-touch-icon.png`
  const avatar = String(profile.avatar_url || '').trim()
  if (/^https?:\/\//i.test(avatar)) ogImage = avatar

  const canonical = `${origin}/u/${encodeURIComponent(storedHandle)}`
  const appTarget = `${origin}/?tab=home&u=${encodeURIComponent(storedHandle)}`
  const brand = appBrandLinkTags(origin)

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${brand}
  <title>${escapeAttr(docTitle)}</title>
  <link rel="canonical" href="${escapeAttr(canonical)}" />
  <meta property="og:site_name" content="Edge" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${escapeAttr(ogTitle)}" />
  <meta property="og:description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:url" content="${escapeAttr(canonical)}" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
  <meta http-equiv="refresh" content="0;url=${escapeAttr(appTarget)}">
  <script>window.location.replace(${JSON.stringify(appTarget)})</script>
</head>
<body>
  <p><a href="${escapeAttr(appTarget)}">Open this profile in Edge</a></p>
</body>
</html>`

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
  res.end(html)
}
