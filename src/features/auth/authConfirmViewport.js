/**
 * Gmail / iOS in-app browsers report a taller layout viewport than the
 * visible visualViewport. `min-h-dvh` then centers the confirm card too high
 * and leaves a black bar in the dead zone. Pin to the visible box.
 */

function visibleViewportBox() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  const height = Math.round(vv?.height || window.innerHeight || 0)
  const width = Math.round(vv?.width || window.innerWidth || 0)
  const top = Math.round(vv?.offsetTop || 0)
  const left = Math.round(vv?.offsetLeft || 0)
  return { height, width, top, left }
}

/**
 * @param {{ shellSelector?: string }} [opts]
 */
export function lockAuthConfirmViewport(opts = {}) {
  if (typeof document === 'undefined') return
  const { height, width, top, left } = visibleViewportBox()
  if (height < 80) return
  const html = document.documentElement
  html.style.setProperty('--auth-confirm-vh', `${height}px`)
  html.style.setProperty('--auth-confirm-vw', `${width}px`)
  html.style.setProperty('--auth-confirm-top', `${top}px`)
  html.style.setProperty('--auth-confirm-left', `${left}px`)
  const px = `${height}px`
  html.style.height = px
  html.style.maxHeight = px
  html.style.overflow = 'hidden'
  if (document.body) {
    document.body.style.height = px
    document.body.style.maxHeight = px
    document.body.style.overflow = 'hidden'
    document.body.style.margin = '0'
  }
  const root = document.getElementById('root')
  if (root) {
    root.style.height = px
    root.style.maxHeight = px
    root.style.minHeight = '0'
    root.style.overflow = 'hidden'
  }
  const selector = opts.shellSelector || '[data-auth-confirm-shell]'
  for (const el of document.querySelectorAll(selector)) {
    el.style.height = px
    el.style.maxHeight = px
    el.style.width = `${width}px`
    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }
}

/**
 * @param {{ shellSelector?: string }} [opts]
 */
export function unlockAuthConfirmViewport(opts = {}) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.style.removeProperty('--auth-confirm-vh')
  html.style.removeProperty('--auth-confirm-vw')
  html.style.removeProperty('--auth-confirm-top')
  html.style.removeProperty('--auth-confirm-left')
  html.style.height = ''
  html.style.maxHeight = ''
  html.style.overflow = ''
  if (document.body) {
    document.body.style.height = ''
    document.body.style.maxHeight = ''
    document.body.style.overflow = ''
    document.body.style.margin = ''
  }
  const root = document.getElementById('root')
  if (root) {
    root.style.height = ''
    root.style.maxHeight = ''
    root.style.minHeight = ''
    root.style.overflow = ''
  }
  const selector = opts.shellSelector || '[data-auth-confirm-shell]'
  for (const el of document.querySelectorAll(selector)) {
    el.style.height = ''
    el.style.maxHeight = ''
    el.style.width = ''
    el.style.top = ''
    el.style.left = ''
  }
}
