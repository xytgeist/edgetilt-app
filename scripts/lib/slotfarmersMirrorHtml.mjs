/**
 * Extract SlotFarmers.club guide HTML from main/article.
 * Must be self-contained for Playwright page.evaluate().
 */
export function extractSlotFarmersMirrorHtml() {
  function bestImgSrc(img) {
    for (const attr of ['data-src', 'data-lazy-src', 'src']) {
      const v = img.getAttribute(attr)
      if (v && !v.startsWith('data:')) return v
    }
    return ''
  }

  const titleEl = document.querySelector('h1') || document.querySelector('title')
  const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || document.title

  const rootEl = document.querySelector('main article') || document.querySelector('main') || document.querySelector('article')
  if (!rootEl) {
    return { title, html: '', imageUrls: [], textLen: 0, subscriberGated: false, pageError: false }
  }

  const root = rootEl.cloneNode(true)

  root.querySelectorAll('script, textarea, template, noscript, iframe, form, button').forEach((el) => el.remove())
  root.querySelectorAll('[class*="cookie"], .cky-notice, .cky-modal').forEach((el) => el.remove())

  root.querySelectorAll('img').forEach((img) => {
    const raw = bestImgSrc(img)
    if (!raw || /cookieyes|revisit\.svg|close\.svg|slotfarmers_icon/i.test(raw)) {
      img.remove()
      return
    }
    try {
      const abs = new URL(raw, document.baseURI).href
      img.setAttribute('src', abs)
      img.removeAttribute('data-src')
    } catch {
      img.remove()
    }
  })

  const innerText = root.innerText.replace(/\s+/g, ' ').trim()
  const subscriberGated = /subscribers only access|please log in or register/i.test(innerText)
  const pageError =
    /something went wrong on this page/i.test(innerText) ||
    /we've logged the error/i.test(innerText) ||
    /an unhandled error has occurred/i.test(document.body?.innerText || '')

  const imageUrls = [...root.querySelectorAll('img')]
    .map((img) => img.getAttribute('src'))
    .filter((src) => src && !src.startsWith('data:'))

  const textLen = innerText.length
  return {
    title,
    html: root.innerHTML,
    imageUrls: [...new Set(imageUrls)],
    textLen,
    subscriberGated,
    pageError,
  }
}

export function slotFarmersMirrorCss() {
  return `
    main img, article img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.25rem auto;
      border-radius: 6px;
    }
    main h1, main h2, main h3, article h2, article h3 {
      font-family: system-ui, sans-serif;
      line-height: 1.3;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }
    main p, article p { margin: 0 0 1rem; }
    [class*="subscriber"], [class*="gated"] {
      margin: 2rem 0;
      padding: 1.25rem;
      border: 2px dashed #c9a227;
      border-radius: 8px;
      background: #fffbea;
    }
  `.trim()
}
