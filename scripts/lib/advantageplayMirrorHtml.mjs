/**
 * Extract WordPress slot guide HTML from advantageplay.club.
 * Must be self-contained — Playwright page.evaluate() only serializes this function body.
 */
export function extractAdvantagePlayMirrorHtml() {
  function bestImgSrc(img) {
    for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
      const v = img.getAttribute(attr)
      if (v && !v.startsWith('data:')) return v
    }
    const srcset = img.getAttribute('srcset')
    if (srcset) {
      const first = srcset.split(',')[0].trim().split(/\s+/)[0]
      if (first && !first.startsWith('data:')) return first
    }
    return ''
  }

  const titleEl =
    document.querySelector('h1.entry-title') ||
    document.querySelector('article h1') ||
    document.querySelector('.entry-title') ||
    document.querySelector('h1')
  const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || document.title

  const article = document.querySelector('article') || document.querySelector('.entry-content')
  if (!article) {
    return { title, html: '', imageUrls: [], textLen: 0, premiumGated: false }
  }

  const root = article.cloneNode(true)

  root.querySelectorAll('script, textarea, template, noscript, iframe').forEach((el) => el.remove())
  root.querySelectorAll('form, #respond, .comment-respond').forEach((el) => el.remove())
  root
    .querySelectorAll(
      '.sharedaddy, .jp-relatedposts, .post-navigation, .nav-links, [class*="breadcrumb"], .rank-math-breadcrumb',
    )
    .forEach((el) => el.remove())

  root.querySelectorAll('img').forEach((img) => {
    const raw = bestImgSrc(img)
    if (!raw || /logo2\.webp|\/logo/i.test(raw)) {
      img.remove()
      return
    }
    if (/impactradius|7eer\.net|doubleclick|affiliate|pixel\.wp/i.test(raw)) {
      img.remove()
      return
    }
    try {
      const abs = new URL(raw, document.baseURI).href
      img.setAttribute('src', abs)
      img.removeAttribute('data-src')
      img.removeAttribute('data-lazy-src')
      img.removeAttribute('srcset')
    } catch {
      img.remove()
    }
  })

  const premiumGated = !!root.querySelector('.pmpro_content_message, .pmpro')

  const imageUrls = [...root.querySelectorAll('img')]
    .map((img) => img.getAttribute('src'))
    .filter((src) => src && !src.startsWith('data:'))

  const textLen = root.innerText.replace(/\s+/g, ' ').trim().length
  return {
    title,
    html: root.innerHTML,
    imageUrls: [...new Set(imageUrls)],
    textLen,
    premiumGated,
  }
}

export function advantagePlayMirrorCss() {
  return `
    article img, .entry-content img {
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
    .pmpro_card, .pmpro_content_message {
      margin: 2rem 0;
      padding: 1.25rem;
      border: 2px dashed #c9a227;
      border-radius: 8px;
      background: #fffbea;
      font-family: system-ui, sans-serif;
    }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
  `.trim()
}
