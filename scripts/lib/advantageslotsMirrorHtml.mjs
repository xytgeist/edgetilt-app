/**
 * Extract WordPress post HTML + comments from advantageslots.com.
 */
export function extractAdvantageSlotsMirrorHtml() {
  const titleEl =
    document.querySelector('h1.entry-title') ||
    document.querySelector('article h1') ||
    document.querySelector('.entry-title')
  const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || document.title

  const parts = []
  const article = document.querySelector('article')
  if (article) parts.push(article.cloneNode(true))

  const comments = document.querySelector('#comments, .comments-area')
  if (comments) parts.push(comments.cloneNode(true))

  if (!parts.length) {
    const entry = document.querySelector('.entry-content')
    if (entry) parts.push(entry.cloneNode(true))
  }

  const root = document.createElement('div')
  for (const part of parts) {
    root.appendChild(part)
  }

  root.querySelectorAll('script, textarea, template, noscript, iframe').forEach((el) => el.remove())
  root.querySelectorAll('form, #respond, .comment-respond').forEach((el) => el.remove())
  root
    .querySelectorAll('.sharedaddy, .jp-relatedposts, .post-navigation, .nav-links')
    .forEach((el) => el.remove())

  root.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src') || img.src || ''
    if (/impactradius|7eer\.net|doubleclick|affiliate|pixel\.wp/i.test(raw)) {
      img.remove()
      return
    }
    try {
      const abs = new URL(raw, document.baseURI).href
      img.setAttribute('src', abs)
    } catch {
      img.remove()
    }
  })

  const imageUrls = [...root.querySelectorAll('img')]
    .map((img) => img.getAttribute('src'))
    .filter((src) => src && !src.startsWith('data:'))

  const textLen = root.innerText.replace(/\s+/g, ' ').trim().length
  return { title, html: root.innerHTML, imageUrls: [...new Set(imageUrls)], textLen }
}

export function advantageSlotsMirrorCss() {
  return `
    article img, .entry-content img, .comments-area img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.25rem auto;
    }
    article h1, article h2, article h3, .entry-content h2, .entry-content h3 {
      font-family: system-ui, sans-serif;
      line-height: 1.3;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }
    article p, .entry-content p { margin: 0 0 1rem; }
    .comments-area, #comments {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 2px solid #ccc;
      font-family: system-ui, sans-serif;
    }
    .comment-list { list-style: none; padding: 0; }
    .comment { margin-bottom: 1.25rem; padding: 1rem; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; }
  `.trim()
}
