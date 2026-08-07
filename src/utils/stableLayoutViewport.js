/**
 * Chrome/Windows (and some file-picker paths) can shrink `visualViewport` / `dvh`
 * while leaving `window.innerHeight` at the real layout viewport. Shells that use
 * `h-dvh` then render at ~half height until reload.
 *
 * Lock to layout viewport pixels (`innerHeight`) ... same idea as slot-guide form.
 */

function layoutViewportHeightPx() {
  if (typeof window === 'undefined') return 0
  return Math.max(
    Math.round(window.innerHeight || 0),
    Math.round(document.documentElement?.clientHeight || 0),
  )
}

/**
 * @param {{ shellSelector?: string }} [opts]
 */
export function lockStableLayoutViewportHeight(opts = {}) {
  if (typeof document === 'undefined') return
  const h = layoutViewportHeightPx()
  if (h < 100) return
  const px = `${h}px`
  const html = document.documentElement
  const body = document.body
  html.style.height = px
  html.style.maxHeight = px
  body.style.height = px
  body.style.maxHeight = px
  const root = document.getElementById('root')
  if (root) {
    root.style.height = px
    root.style.maxHeight = px
    root.style.minHeight = '0'
  }
  const selector = opts.shellSelector || '[data-stable-layout-viewport]'
  for (const el of document.querySelectorAll(selector)) {
    el.style.height = px
    el.style.maxHeight = px
  }
}

/**
 * @param {{ shellSelector?: string }} [opts]
 */
export function unlockStableLayoutViewportHeight(opts = {}) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  const body = document.body
  html.style.height = ''
  html.style.maxHeight = ''
  body.style.height = ''
  body.style.maxHeight = ''
  const root = document.getElementById('root')
  if (root) {
    root.style.height = ''
    root.style.maxHeight = ''
    root.style.minHeight = ''
  }
  const selector = opts.shellSelector || '[data-stable-layout-viewport]'
  for (const el of document.querySelectorAll(selector)) {
    el.style.height = ''
    el.style.maxHeight = ''
  }
}
