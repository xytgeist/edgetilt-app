/**
 * Shared tile ↔ fullscreen FLIP geometry for Stream hero + image lightbox.
 */
import { isLoungeCfR2MediaUrl, isLoungeSupabaseFeedMediaUrl } from '../../utils/loungeCfImageMedia.js'

export const HERO_EXPAND_MS = 500
export const HERO_SHRINK_MS = 500
/** GPU transform FLIP - gentler start than width/top tweens on mobile. */
export const HERO_MOTION_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const HERO_MOTION_TRANSITION = `${HERO_EXPAND_MS}ms ${HERO_MOTION_CURVE}`
export const HERO_SHRINK_TRANSITION = `${HERO_SHRINK_MS}ms ${HERO_MOTION_CURVE}`
/** Chrome tap-toggle / post-land fade. Open fly-in uses HERO_EXPAND_MS so controls are present before land. */
export const HERO_CHROME_FADE_MS = 220
/** Default hero stack when no parent `lightboxPortalClass` is passed. */
export const HERO_STACK_BASE_Z_INDEX = 102
/**
 * Comment/quote media lightbox stacked on the X-style overlay comments sheet
 * (sheet is `z-[109]`, nested peek sheet `z-[118]`). Nested layers portal into
 * `[data-lounge-overlay-nest-root]` (115 while peeked, 119 while full-screen)
 * so every extra media→comments hop can sit above the current sheet. App
 * modals stay at `z-[120]`.
 */
export const LOUNGE_OVERLAY_NESTED_LIGHTBOX_PORTAL_CLASS = 'z-[115]'

/** DOM attrs for a comment-media lightbox stacked over the overlay sheet. */
export function loungeNestedLightboxDomProps(nested, depth = 1) {
  if (!nested) return {}
  return {
    'data-lounge-nested-lightbox': '',
    'data-lounge-nested-depth': String(Math.max(1, Number(depth) || 1)),
  }
}

/**
 * Hero stack must sit above the parent shell (`lightboxPortalClass`, e.g. post detail z-[98]/z-[102]).
 * @returns {{ scrim: number, flyout: number, overlay: number }}
 */
export function resolveLoungeHeroStackZIndexes(lightboxPortalClass) {
  const m = String(lightboxPortalClass || '').match(/z-\[(\d+)\]/)
  const portalZ = m ? Number(m[1]) : 0
  const stackTop =
    Number.isFinite(portalZ) && portalZ > 0
      ? Math.max(portalZ, HERO_STACK_BASE_Z_INDEX)
      : HERO_STACK_BASE_Z_INDEX
  return {
    scrim: stackTop - 1,
    flyout: stackTop,
    overlay: stackTop + 1,
  }
}

/** @returns {{ top: number, left: number, width: number, height: number }} */
export function readElementViewportRect(el) {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * Visible media bounds for hero FLIP - not the full poster shell when portrait letterboxes.
 * Prefer decoded in-flow poster pixels; else object-contain fit from stream display dims.
 */
export function readHeroMediaViewportRect(slot, flyout, wrap, displayW, displayH) {
  const shell = slot || flyout || wrap
  if (!shell) return { top: 0, left: 0, width: 0, height: 0 }

  const posterImg = slot?.querySelector('img')
  if (posterImg instanceof HTMLImageElement) {
    const ir = posterImg.getBoundingClientRect()
    if (ir.width >= 8 && ir.height >= 8) {
      return { top: ir.top, left: ir.left, width: ir.width, height: ir.height }
    }
  }

  const shellRect = readElementViewportRect(shell)
  const dw = Number(displayW)
  const dh = Number(displayH)
  if (Number.isFinite(dw) && Number.isFinite(dh) && dw >= 2 && dh >= 2) {
    const aspect = dw / dh
    let w = shellRect.width
    let h = w / aspect
    if (h > shellRect.height) {
      h = shellRect.height
      w = h * aspect
    }
    return {
      top: shellRect.top + (shellRect.height - h) / 2,
      left: shellRect.left + (shellRect.width - w) / 2,
      width: w,
      height: h,
    }
  }

  return shellRect
}

/**
 * Klipy / uploaded GIF (and Klipy animated webp). Stills on R2 stay false.
 * @param {string} [url]
 */
export function isLoungeLightboxGifUrl(url, knownGifUrl) {
  const raw = String(url || '').trim()
  if (!raw) return false
  const known = String(knownGifUrl || '').trim()
  if (known && sameLoungeMediaUrl(raw, known)) return true
  try {
    const parsed = new URL(raw)
    if (/\.gif$/i.test(parsed.pathname)) return true
    const host = parsed.hostname.toLowerCase()
    if (host.includes('klipy')) return true
  } catch {
    if (/\.gif(\?|#|$)/i.test(raw)) return true
  }
  // Klipy CDNs often have neither "klipy" nor .gif. Stills live on our R2.
  if (/^https?:\/\//i.test(raw) && !isLoungeCfR2MediaUrl(raw) && !isLoungeSupabaseFeedMediaUrl(raw)) {
    return true
  }
  return false
}

/** Compare stored vs slide URLs without query/hash noise. */
export function sameLoungeMediaUrl(a, b) {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left || !right) return false
  if (left === right) return true
  try {
    const ua = new URL(left)
    const ub = new URL(right)
    return ua.origin + ua.pathname === ub.origin + ub.pathname
  } catch {
    return false
  }
}

/**
 * Painted object-contain pixels inside an img box (carousel cell can be wider than the GIF).
 * @param {HTMLImageElement | null | undefined} img
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
export function readContainedImageViewportRect(img) {
  if (!(img instanceof HTMLImageElement)) return null
  const box = readElementViewportRect(img)
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!(box.width >= 8 && box.height >= 8)) {
    return heroRectUsableForShrinkBack(box) ? box : null
  }
  if (!(nw > 0 && nh > 0)) {
    return heroRectUsableForShrinkBack(box) ? box : null
  }
  const aspect = nw / nh
  let w = box.width
  let h = w / aspect
  if (h > box.height) {
    h = box.height
    w = h * aspect
  }
  const rect = {
    top: box.top + (box.height - h) / 2,
    left: box.left + (box.width - w) / 2,
    width: w,
    height: h,
  }
  return heroRectUsableForShrinkBack(rect) ? rect : heroRectUsableForShrinkBack(box) ? box : null
}

/** @returns {boolean} */
export function heroRectUsableForShrinkBack(rect) {
  if (!rect) return false
  if (rect.width < 32 || rect.height < 32) return false
  if (typeof window === 'undefined') return false
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height
  return bottom > 0 && rect.top < window.innerHeight
}

/**
 * True when full-viewport-width media still fits between chrome insets (short / landscape).
 * Tall media that would shrink with side gutters should go edge-to-edge instead.
 * @param {number} aspect width/height
 * @param {{ top?: number, bottom?: number } | null | undefined} pad
 * @param {number} [vw]
 * @param {number} [vh]
 */
export function mediaFitsChromeBand(aspect, pad, vw, vh) {
  if (!(Number.isFinite(aspect) && aspect > 0)) return false
  const top = Math.max(0, Number(pad?.top) || 0)
  const bottom = Math.max(0, Number(pad?.bottom) || 0)
  if (top <= 0 && bottom <= 0) return false
  const viewW =
    Number.isFinite(vw) && vw > 0
      ? vw
      : typeof window !== 'undefined'
        ? (window.visualViewport?.width ?? window.innerWidth)
        : 390
  const viewH =
    Number.isFinite(vh) && vh > 0
      ? vh
      : typeof window !== 'undefined'
        ? (window.visualViewport?.height ?? window.innerHeight)
        : 800
  const bandH = viewH - top - bottom
  if (!(bandH > 0)) return false
  return viewW / aspect <= bandH + 0.5
}

/**
 * Target hero frame: object-contain media centered in the viewport (or a chrome band).
 * @param {{ width: number, height: number }} fromRect
 * @param {{ displayW?: number, displayH?: number, aspect?: number, insetTop?: number, insetBottom?: number, forceBand?: boolean }} [opts]
 *   `insetTop` / `insetBottom` - chrome band only when full-width media still fits there;
 *   otherwise edge-to-edge in the full viewport (tall media may run under pills).
 *   `forceBand` - always park in the chrome band (GIFs). `aspect` wins over the tile box.
 *   `viewportW` / `viewportH` / `ignoreVisualViewport` - freeze the peek band while the
 *   overlay composer keyboard is up so media does not reflow with visualViewport.
 */
export function computeHeroTargetRect(fromRect, opts = {}) {
  const { displayW, displayH } = opts
  const insetTopReq = Math.max(0, Number(opts.insetTop) || 0)
  const insetBottomReq = Math.max(0, Number(opts.insetBottom) || 0)
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  const vwOpt = Number(opts.viewportW)
  const vhOpt = Number(opts.viewportH)
  const vw =
    Number.isFinite(vwOpt) && vwOpt > 0
      ? vwOpt
      : vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390)
  const vh =
    Number.isFinite(vhOpt) && vhOpt > 0
      ? vhOpt
      : vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 800)
  const offsetTop =
    opts.ignoreVisualViewport === true ? 0 : (vv?.offsetTop ?? 0)
  const offsetLeft =
    opts.ignoreVisualViewport === true ? 0 : (vv?.offsetLeft ?? 0)

  let aspect = fromRect.width / Math.max(fromRect.height, 1)
  const aspectOpt = Number(opts.aspect)
  const dw = Number(displayW)
  const dh = Number(displayH)
  if (Number.isFinite(aspectOpt) && aspectOpt > 0) {
    aspect = aspectOpt
  } else if (Number.isFinite(dw) && Number.isFinite(dh) && dw >= 2 && dh >= 2) {
    aspect = dw / dh
  }

  const useBand = opts.forceBand
    ? insetTopReq > 0 || insetBottomReq > 0
    : mediaFitsChromeBand(aspect, { top: insetTopReq, bottom: insetBottomReq }, vw, vh)
  const insetTop = useBand ? insetTopReq : 0
  const insetBottom = useBand ? insetBottomReq : 0

  const maxW = Math.max(120, vw)
  const maxH = Math.max(120, vh - insetTop - insetBottom)
  let w = maxW
  let h = w / aspect
  if (h > maxH) {
    h = maxH
    w = h * aspect
  }
  return {
    top: insetTop + (maxH - h) / 2 + offsetTop,
    left: (vw - w) / 2 + offsetLeft,
    width: w,
    height: h,
  }
}

/** Opening FLIP: laid out at tile `fromRect`, transform grows toward hero `toRect`. */
export function computeHeroExpandTransform(fromRect, toRect) {
  const scaleX = toRect.width / fromRect.width
  const scaleY = toRect.height / fromRect.height
  const translateX = toRect.left - fromRect.left
  const translateY = toRect.top - fromRect.top
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
}

/** Closing FLIP invert: laid out at tile `toRect`, transform makes it match hero `fromRect`. */
export function computeHeroShrinkTransform(fromRect, toRect) {
  const scaleX = fromRect.width / toRect.width
  const scaleY = fromRect.height / toRect.height
  const translateX = fromRect.left - toRect.left
  const translateY = fromRect.top - toRect.top
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
}

export function clearFlyoutHeroInlineStyles(flyout) {
  if (!flyout) return
  flyout.style.position = ''
  flyout.style.top = ''
  flyout.style.left = ''
  flyout.style.width = ''
  flyout.style.height = ''
  flyout.style.zIndex = ''
  flyout.style.transition = ''
  flyout.style.borderRadius = ''
  flyout.style.transform = ''
  flyout.style.transformOrigin = ''
  flyout.style.willChange = ''
  flyout.style.opacity = ''
}

/** Drop imperative motion styles so DOM shrink owns transform during dismiss. */
export function clearFlyoutHeroMotionStyles(flyout) {
  if (!flyout) return
  flyout.style.transition = ''
  flyout.style.transform = ''
  flyout.style.transformOrigin = ''
  flyout.style.willChange = ''
  flyout.style.opacity = ''
}

/** Imperative hero shrink - avoids useLayoutEffect cleanup / React style races on iOS. */
export function runHeroShrinkAnimation(
  flyout,
  heroFrame,
  tileFrame,
  { animRef, finishTimerRef, onDone, onDebug, flyoutZIndex = HERO_STACK_BASE_Z_INDEX },
) {
  if (!flyout || !heroFrame || !tileFrame) {
    onDebug?.('shrink missing node or rect')
    onDone('missing')
    return
  }

  animRef.current?.cancel()
  if (finishTimerRef.current) {
    window.clearTimeout(finishTimerRef.current)
    finishTimerRef.current = 0
  }

  clearFlyoutHeroMotionStyles(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${tileFrame.top}px`
  flyout.style.left = `${tileFrame.left}px`
  flyout.style.width = `${tileFrame.width}px`
  flyout.style.height = `${tileFrame.height}px`
  flyout.style.zIndex = String(flyoutZIndex)
  flyout.style.transformOrigin = '0 0'
  flyout.style.transition = 'none'
  flyout.style.borderRadius = '12px'

  const fromTransform = computeHeroShrinkTransform(heroFrame, tileFrame)
  void flyout.offsetWidth

  if (typeof flyout.animate !== 'function') {
    onDebug?.('shrink no waapi')
    onDone('no-waapi')
    return
  }

  let finished = false
  const finish = (reason) => {
    if (finished) return
    finished = true
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = 0
    }
    onDebug?.(`shrink done ${reason}`)
    onDone(reason)
  }

  const anim = flyout.animate(
    [
      { transform: fromTransform, borderRadius: '12px' },
      { transform: 'none', borderRadius: '12px' },
    ],
    {
      duration: HERO_SHRINK_MS,
      easing: HERO_MOTION_CURVE,
      fill: 'forwards',
    },
  )
  animRef.current = anim
  onDebug?.(`shrink waapi play ${HERO_SHRINK_MS}ms`)

  anim.onfinish = () => finish('waapi')
  anim.oncancel = () => {
    if (!finished) onDebug?.('shrink waapi cancelled')
  }
  finishTimerRef.current = window.setTimeout(() => finish('timeout'), HERO_SHRINK_MS + 150)
}

/**
 * Imperative hero expand - WAAPI avoids iOS skipping CSS transform transitions on reparent.
 * @param {{ borderRadiusPx?: number }} [opts] Image lightbox passes `0` so corners square as soon as fly-in starts (avoids a full-size round→square pop).
 */
export function runHeroExpandAnimation(
  flyout,
  fromRect,
  toRect,
  {
    animRef,
    finishTimerRef,
    onDone,
    onDebug,
    flyoutZIndex = HERO_STACK_BASE_Z_INDEX,
    borderRadiusPx = 12,
  },
) {
  if (!flyout || !fromRect || !toRect) {
    onDebug?.('expand missing node or rect')
    onDone('missing')
    return
  }

  animRef.current?.cancel()
  if (finishTimerRef.current) {
    window.clearTimeout(finishTimerRef.current)
    finishTimerRef.current = 0
  }

  const radius = `${Math.max(0, Number(borderRadiusPx) || 0)}px`

  clearFlyoutHeroMotionStyles(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${fromRect.top}px`
  flyout.style.left = `${fromRect.left}px`
  flyout.style.width = `${fromRect.width}px`
  flyout.style.height = `${fromRect.height}px`
  flyout.style.zIndex = String(flyoutZIndex)
  flyout.style.transformOrigin = '0 0'
  flyout.style.transition = 'none'
  flyout.style.borderRadius = radius

  const toTransform = computeHeroExpandTransform(fromRect, toRect)
  void flyout.offsetWidth

  if (typeof flyout.animate !== 'function') {
    onDebug?.('expand no waapi')
    onDone('no-waapi')
    return
  }

  let finished = false
  const finish = (reason) => {
    if (finished) return
    finished = true
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = 0
    }
    onDebug?.(`expand done ${reason}`)
    onDone(reason)
  }

  const anim = flyout.animate(
    [
      { transform: 'none', borderRadius: radius },
      { transform: toTransform, borderRadius: radius },
    ],
    {
      duration: HERO_EXPAND_MS,
      easing: HERO_MOTION_CURVE,
      fill: 'forwards',
    },
  )
  animRef.current = anim
  onDebug?.(`expand waapi play ${HERO_EXPAND_MS}ms`)

  anim.onfinish = () => finish('waapi')
  anim.oncancel = () => {
    if (!finished) onDebug?.('expand waapi cancelled')
  }
  finishTimerRef.current = window.setTimeout(() => finish('timeout'), HERO_EXPAND_MS + 150)
}

/** Imperative snap before React paint - flyout on body at feed tile size (transform identity). */
export function snapFlyoutToHeroTile(flyout, host, fromRect, flyoutZIndex = HERO_STACK_BASE_Z_INDEX) {
  if (!flyout || !host || !fromRect) return
  if (flyout.parentElement !== host) host.appendChild(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${fromRect.top}px`
  flyout.style.left = `${fromRect.left}px`
  flyout.style.width = `${fromRect.width}px`
  flyout.style.height = `${fromRect.height}px`
  flyout.style.zIndex = String(flyoutZIndex)
  flyout.style.transformOrigin = '0 0'
  flyout.style.transform = 'none'
  flyout.style.transition = 'none'
  flyout.style.borderRadius = '12px'
  flyout.style.willChange = 'transform'
}

/** Imperative snap at hero target - WAAPI expand leaves tile box + transform; React owns layout after land. */
export function snapFlyoutToHeroOpen(flyout, targetRect, flyoutZIndex = HERO_STACK_BASE_Z_INDEX) {
  if (!flyout || !targetRect) return
  clearFlyoutHeroInlineStyles(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${targetRect.top}px`
  flyout.style.left = `${targetRect.left}px`
  flyout.style.width = `${targetRect.width}px`
  flyout.style.height = `${targetRect.height}px`
  flyout.style.zIndex = String(flyoutZIndex)
  flyout.style.transform = 'none'
  flyout.style.borderRadius = '0'
}

/**
 * Viewport Y below sticky profile/detail/feed chrome for shrink-back clipping.
 * Portaled flyouts sit above sheet stacking contexts … clip the full-screen shell so the
 * tile appears to tuck under sticky tabs/title instead of painting over them.
 * @returns {number}
 */
export function readLightboxCloseChromeClipTopPx() {
  if (typeof document === 'undefined') return 0
  /** Only chrome stuck near the top of the viewport (not mid-scroll tab rows). */
  const nearTopMaxPx = 180
  let bottom = 0
  const consider = (el) => {
    if (!(el instanceof HTMLElement)) return
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) return
    if (r.top > nearTopMaxPx) return
    try {
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.display === 'none') return
      if (Number(st.opacity) === 0) return
    } catch {
      // ignore
    }
    bottom = Math.max(bottom, r.bottom)
  }

  document.querySelectorAll('[data-lounge-profile-tabs]').forEach(consider)
  document.querySelectorAll('[data-lounge-profile-top-chrome]').forEach(consider)
  consider(document.querySelector('[data-lounge-post-detail-title-bar]'))

  const profileSheetOpen = Boolean(document.querySelector('[data-lounge-profile-sheet]'))
  const detailOpen = Boolean(document.querySelector('[data-lounge-post-detail-title-bar]'))
  if (!profileSheetOpen && !detailOpen) {
    consider(document.querySelector('[data-lounge-title-bar]'))
  }

  return Math.max(0, Math.round(bottom))
}
