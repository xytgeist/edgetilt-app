/**
 * Server-rendered Terms / Privacy / Guidelines HTML.
 *
 * 10DLC / Telnyx crawlers fetch `https://edgetilt.com/privacy` and grep the HTTP body.
 * The Vite SPA shell does not include policy text, so `vercel.json` rewrites
 * `/privacy`, `/terms`, and `/guidelines` here. Copy comes from `legalDocuments.js`
 * (same source as the in-app `LegalDocumentScreen`).
 *
 * Local `vite` does not apply Vercel rewrites ... the SPA route still renders those pages.
 */

import { getLegalDocument } from '../src/features/legal/legalDocuments.js'

const SLUGS = new Set(['terms', 'privacy', 'guidelines'])

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function requestOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'edgetilt.com')
    .split(',')[0]
    .trim()
    .split(':')[0]
    .toLowerCase()
  const proto = String(req.headers['x-forwarded-proto'] || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase()
  const safeProto = proto === 'http' ? 'http' : 'https'
  const safeHost = host || 'edgetilt.com'
  return `${safeProto}://${safeHost}`
}

function slugFromRequest(req) {
  const q = String(req.query?.slug || '').toLowerCase().trim()
  if (SLUGS.has(q)) return q
  try {
    const url = new URL(String(req.url || ''), 'https://edgetilt.com')
    const fromQuery = url.searchParams.get('slug')
    if (fromQuery && SLUGS.has(fromQuery)) return fromQuery
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (path === '/privacy' || path.endsWith('/privacy')) return 'privacy'
    if (path === '/terms' || path.endsWith('/terms')) return 'terms'
    if (path === '/guidelines' || path.endsWith('/guidelines')) return 'guidelines'
  } catch {
    // ignore
  }
  return ''
}

function renderHtml(doc, canonical) {
  const sections = doc.sections
    .map((section) => {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''
      const paragraphs = (section.paragraphs || [])
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('\n')
      return `<section id="${escapeHtml(section.id)}">${heading}\n${paragraphs}</section>`
    })
    .join('\n')
  const intro = doc.intro ? `<p class="lead">${escapeHtml(doc.intro)}</p>` : ''
  const title = escapeHtml(doc.title)
  const effective = escapeHtml(doc.effectiveDate)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, follow" />
  <title>${title} · EdgeTilt</title>
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <style>
    :root {
      color-scheme: dark light;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      line-height: 1.65;
    }
    body {
      margin: 0;
      background: #09090b;
      color: #d4d4d8;
    }
    header {
      position: sticky;
      top: 0;
      border-bottom: 1px solid #27272a;
      background: rgba(9, 9, 11, 0.95);
      padding: 12px 16px;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 42rem;
      margin: 0 auto;
    }
    .back {
      color: #fb923c;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .titles { flex: 1; text-align: center; min-width: 0; }
    h1 { margin: 0; font-size: 1rem; color: #fafafa; }
    .effective { margin: 2px 0 0; font-size: 11px; color: #71717a; }
    main { max-width: 42rem; margin: 0 auto; padding: 24px 16px 48px; }
    .lead { font-size: 1rem; color: #e4e4e7; margin-bottom: 1.5rem; }
    h2 { font-size: 1.05rem; color: #fafafa; margin: 1.75rem 0 0.75rem; }
    p { margin: 0 0 0.85rem; }
    footer {
      max-width: 42rem;
      margin: 0 auto;
      padding: 0 16px 32px;
    }
    button {
      width: 100%;
      min-height: 44px;
      border: 0;
      border-radius: 12px;
      background: #ea580c;
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
    }
    @media (prefers-color-scheme: light) {
      body { background: #fafafa; color: #3f3f46; }
      header { background: rgba(250, 250, 250, 0.95); border-bottom-color: #e4e4e7; }
      h1, h2 { color: #18181b; }
      .lead { color: #27272a; }
      .effective { color: #71717a; }
      .back { color: #c2410c; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <a class="back" id="legal-back" href="/">← Back</a>
      <div class="titles">
        <h1>${title}</h1>
        <p class="effective">Effective ${effective}</p>
      </div>
      <span style="width:4.5rem" aria-hidden="true"></span>
    </div>
  </header>
  <main>
    ${intro}
    ${sections}
  </main>
  <footer>
    <button type="button" id="legal-done">Got it</button>
  </footer>
  <script>
    (function () {
      function goBack() {
        if (document.referrer) {
          try {
            var ref = new URL(document.referrer)
            if (ref.origin === location.origin) {
              history.back()
              return
            }
          } catch (e) {}
        }
        location.href = '/'
      }
      var back = document.getElementById('legal-back')
      var done = document.getElementById('legal-done')
      if (back) back.addEventListener('click', function (e) { e.preventDefault(); goBack() })
      if (done) done.addEventListener('click', goBack)
    })()
  </script>
</body>
</html>`
}

export default function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  const slug = slugFromRequest(req)
  const doc = slug ? getLegalDocument(slug) : null
  if (!doc) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
    return
  }

  const origin = requestOrigin(req)
  const canonical = `${origin}/${slug}`
  const html = renderHtml(doc, canonical)

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')
  res.setHeader('X-Robots-Tag', 'noindex, follow')
  if (method === 'HEAD') {
    res.end()
    return
  }
  res.end(html)
}
