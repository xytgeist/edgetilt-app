/**
 * Google Analytics 4 (gtag) for EdgeTilt production.
 * Loads only when `VITE_GA_MEASUREMENT_ID` is set (Vercel Production).
 * Sends an initial page_view, then SPA navigations via history patches.
 *
 * Important: the gtag stub must use `arguments` (not rest+array push).
 * Rest-args stubs load gtag.js but never emit collect hits.
 */

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()

function pagePath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function sendPageView() {
  if (!MEASUREMENT_ID || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: pagePath(),
  })
}

function patchHistoryForSpaPageViews() {
  const wrap = (method) => {
    const original = window.history[method]
    if (typeof original !== 'function') return
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args)
      queueMicrotask(sendPageView)
      return result
    }
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', sendPageView)
}

/**
 * Install gtag + GA4 config. No-op when Measurement ID env is missing.
 */
export function initGoogleAnalytics() {
  if (!MEASUREMENT_ID || typeof document === 'undefined') return
  if (window.__edgeGaInitialized) return
  window.__edgeGaInitialized = true

  window.dataLayer = window.dataLayer || []
  // Must match Google's snippet: push `arguments`, not a rest-array.
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }

  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
  script.onload = () => {
    sendPageView()
    patchHistoryForSpaPageViews()
  }
  document.head.appendChild(script)
}
