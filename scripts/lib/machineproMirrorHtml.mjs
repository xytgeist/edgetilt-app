/**
 * Extract lesson HTML + comment thread from a Machine Pro (Teachable/Podia) page.
 * Keeps member comments; strips reply forms and scripts only.
 */
export function extractLessonMirrorHtml() {
  const titleEl =
    document.querySelector('#lesson-header .lesson__title') ||
    document.querySelector('h2.lesson__title')
  const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || document.title

  const parts = []
  const body = document.querySelector('#lesson-body')
  if (body) parts.push(body.cloneNode(true))

  const comments = document.querySelector('.comment-feed-wrapper')
  if (comments) parts.push(comments.cloneNode(true))

  if (!parts.length) {
    const fallback = document.querySelector('.sidebar-container-v2__main-content')
    if (!fallback) return { title, html: '', imageUrls: [], textLen: 0 }
    parts.push(fallback.cloneNode(true))
  }

  const root = document.createElement('div')
  for (const part of parts) {
    root.appendChild(part)
  }

  root.querySelectorAll('script, textarea, template, noscript').forEach((el) => el.remove())
  root.querySelectorAll('form').forEach((el) => {
    if (el.closest('.comment-feed-wrapper') || el.querySelector('textarea')) el.remove()
  })
  root.querySelectorAll('[data-behavior="popover-body"]').forEach((el) => el.remove())

  const imageUrls = [...root.querySelectorAll('img')]
    .map((img) => img.getAttribute('src') || img.src)
    .filter((src) => src && !src.startsWith('data:'))

  const textLen = root.innerText.replace(/\s+/g, ' ').trim().length
  return { title, html: root.innerHTML, imageUrls: [...new Set(imageUrls)], textLen }
}

export function mirrorPageCss() {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.65;
      color: #1a1a1a;
      background: #f7f6f3;
      margin: 0;
      padding: 0;
    }
    .mp-wrap { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    .mp-meta {
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #ddd;
    }
    .mp-meta a { color: #444; }
    .mp-title {
      font-family: system-ui, sans-serif;
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 1.5rem;
      line-height: 1.25;
    }
    #lesson-body img, .comment-feed-wrapper img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.25rem auto;
      border-radius: 4px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    #lesson-body h1, #lesson-body h2, #lesson-body h3 {
      font-family: system-ui, sans-serif;
      line-height: 1.3;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }
    #lesson-body h1 { font-size: 1.35rem; }
    #lesson-body p { margin: 0 0 1rem; }
    .comment-feed-wrapper {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 2px solid #ccc;
      font-family: system-ui, sans-serif;
    }
    .comment-feed-wrapper h2, .comment-feed-wrapper h3 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }
    .comment-wrapper, .comment-thread {
      margin-bottom: 1.25rem;
      padding: 1rem;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
    }
  `.trim()
}

/**
 * @param {string} title
 * @param {string} bodyHtml
 * @param {string} sourceUrl
 * @param {string} exportedAt
 * @param {string} [sourceName='Machine Pro']
 * @param {string} [extraCss='']
 */
export function buildMirrorDocument(title, bodyHtml, sourceUrl, exportedAt, sourceName = 'Machine Pro', extraCss = '') {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>${mirrorPageCss()}${extraCss ? `\n${extraCss}` : ''}</style>
</head>
<body>
  <div class="mp-wrap">
    <p class="mp-meta">Archived from <a href="${esc(sourceUrl)}">${esc(sourceName)}</a> · ${esc(exportedAt)}</p>
    <h1 class="mp-title">${esc(title)}</h1>
    ${bodyHtml}
  </div>
</body>
</html>
`
}

/**
 * @param {import('playwright').APIRequestContext} request
 * @param {string} url
 */
export async function guessImageExtension(request, url) {
  try {
    const res = await request.head(url, { timeout: 30_000 })
    const ct = res.headers()['content-type'] || ''
    if (ct.includes('png')) return '.png'
    if (ct.includes('webp')) return '.webp'
    if (ct.includes('gif')) return '.gif'
    if (ct.includes('svg')) return '.svg'
  } catch {
    /* fall through */
  }
  return '.jpg'
}

/**
 * @param {string} html
 * @param {Map<string, string>} urlToLocal — absolute url → relative path like images/01.jpg
 */
export function rewriteImageSources(html, urlToLocal) {
  let out = html
  for (const [remote, local] of urlToLocal) {
    out = out.split(remote).join(local)
  }
  return out
}
