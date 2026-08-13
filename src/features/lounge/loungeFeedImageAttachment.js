/**
 * Feed post still/GIF/Stream attachment layout.
 * Single media hugs its fitted size inside caption width × max-h (landscape fills width;
 * portrait shrinks when height binds). Multi-image carousels keep a shared row height.
 */

/** Height / width above this → tall attachment (narrow frame, not full post width). */
export const LOUNGE_FEED_ATTACHMENT_TALL_HW_RATIO = 1.35

/** Shared row height for multi-image feed carousels (width follows aspect ratio). */
export const LOUNGE_FEED_CAROUSEL_ROW_HEIGHT_CLASS = 'h-[min(55vh,420px)]'

/**
 * First N Lounge feed rows may eager-decode slide 0 (LCP). Every other row stays
 * `loading="lazy"` … Chrome Android otherwise starts full-res R2 originals for the
 * whole first page (28 rows) and older phones hitch on scroll/tap before any lightbox.
 */
export const LOUNGE_FEED_PRIORITY_IMAGE_ROWS = 2

/** Hard cap for carousel row height — keep in sync with `min(55vh, 420px)`. */
export const LOUNGE_FEED_CAROUSEL_MAX_ROW_HEIGHT_PX = 420

/**
 * Max row height from viewport (pairs with {@link LOUNGE_FEED_CAROUSEL_MAX_ROW_HEIGHT_PX}).
 * @param {number} [viewportHeightPx]
 */
export function loungeFeedCarouselMaxRowHeightPx(viewportHeightPx = typeof window !== 'undefined' ? window.innerHeight : 800) {
  const vh = Number(viewportHeightPx)
  if (!Number.isFinite(vh) || vh <= 0) return LOUNGE_FEED_CAROUSEL_MAX_ROW_HEIGHT_PX
  return Math.min(LOUNGE_FEED_CAROUSEL_MAX_ROW_HEIGHT_PX, vh * 0.55)
}

/**
 * Height for one slide when fit inside the feed carousel max box (preserve aspect, no upscaling).
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {number} maxHeightPx
 * @param {number} maxWidthPx
 */
export function loungeFeedCarouselFittedHeight(naturalWidth, naturalHeight, maxHeightPx, maxWidthPx) {
  const w = Number(naturalWidth)
  const h = Number(naturalHeight)
  const maxH = Number(maxHeightPx)
  const maxW = Number(maxWidthPx)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0
  if (!Number.isFinite(maxH) || !Number.isFinite(maxW) || maxH <= 0 || maxW <= 0) return 0
  const scale = Math.min(1, maxH / h, maxW / w)
  return h * scale
}

/**
 * Row height for every carousel slide: fit to the **first** slide's fitted height.
 * Later slides scale to this height (taller ones shrink; landscape ones won't balloon wide).
 * @param {{ w: number, h: number } | undefined} firstSlide
 */
export function loungeFeedCarouselRowHeightFromFirstSlide(firstSlide, maxHeightPx, maxWidthPx) {
  if (!firstSlide) return 0
  return loungeFeedCarouselFittedHeight(firstSlide.w, firstSlide.h, maxHeightPx, maxWidthPx)
}

/**
 * Parse a `:root` CSS length variable (`px` or `rem`).
 * @param {string} varName
 * @param {number} fallbackPx
 */
export function loungeFeedReadCssLengthPx(varName, fallbackPx = 0) {
  if (typeof document === 'undefined') return fallbackPx
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return fallbackPx
  if (raw.endsWith('px')) {
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallbackPx
  }
  if (raw.endsWith('rem')) {
    const n = parseFloat(raw)
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    return Number.isFinite(n) ? n * rootPx : fallbackPx
  }
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallbackPx
}

/**
 * Feed carousel layout numbers from the live horizontal scroller (padding + peek).
 * @param {HTMLElement | null | undefined} scroller
 * @param {boolean} fullBleed
 */
export function loungeFeedCarouselMeasureLayout(scroller, fullBleed) {
  const maxRowPx = loungeFeedCarouselMaxRowHeightPx()
  const peekPx = loungeFeedReadCssLengthPx('--lounge-feed-carousel-peek', 48)
  const slideGapPx = loungeFeedReadCssLengthPx('--lounge-feed-carousel-slide-gap', 8)

  if (fullBleed && scroller) {
    const s = getComputedStyle(scroller)
    const padL = parseFloat(s.paddingLeft) || 0
    const padR = parseFloat(s.paddingRight) || 0
    const contentWidthPx = Math.max(96, scroller.clientWidth - padL - padR)
    const firstSlideMaxWidthPx = Math.max(96, contentWidthPx - peekPx - slideGapPx)
    return { maxRowPx, contentWidthPx, firstSlideMaxWidthPx }
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const contentWidthPx = Math.min(vw * 0.88, 320)
  const firstSlideMaxWidthPx = Math.max(96, contentWidthPx - peekPx - slideGapPx)
  return { maxRowPx, contentWidthPx, firstSlideMaxWidthPx }
}

/**
 * Cap slide width at row height (same aspect box as height).
 * @param {number | undefined} widthPx
 * @param {number | undefined} maxWidthPx
 */
export function loungeFeedCarouselCapSlideWidthPx(widthPx, maxWidthPx) {
  const width = Number(widthPx)
  const maxW = Number(maxWidthPx)
  if (!Number.isFinite(width) || width <= 0) return undefined
  if (!Number.isFinite(maxW) || maxW <= 0) return width
  return Math.min(width, maxW)
}

/**
 * Slide width when every image is scaled to the same row height.
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {number} rowHeightPx
 */
export function loungeFeedCarouselSlideWidthPx(naturalWidth, naturalHeight, rowHeightPx) {
  const w = Number(naturalWidth)
  const h = Number(naturalHeight)
  const rowH = Number(rowHeightPx)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0 || !Number.isFinite(rowH) || rowH <= 0) return undefined
  return (rowH / h) * w
}

/** @deprecated Prefer {@link loungeFeedCarouselMeasureLayout}. */
export function loungeFeedCarouselMaxSlideWidthPx(fullBleed, viewportWidthPx = typeof window !== 'undefined' ? window.innerWidth : 390) {
  void fullBleed
  void viewportWidthPx
  return loungeFeedCarouselMeasureLayout(null, false).firstSlideMaxWidthPx
}

/**
 * Hug media inside the caption column.
 * Landscape fills column width; portrait/tall shrinks when max-height binds (no pillarbox bars).
 */
export const LOUNGE_FEED_ATTACHMENT_COLUMN_SHELL_CLASS =
  'inline-flex w-auto max-w-full min-w-0 shrink-0 self-start'

/** Tall phone screenshot / portrait clip — same hug rules, capped below full column on wide viewports. */
export const LOUNGE_FEED_ATTACHMENT_TALL_SHELL_CLASS =
  'inline-flex w-auto max-w-[min(100%,20rem)] min-w-0 shrink-0 self-start'

/** Max rendered height for single column-fill feed stills and inline Stream tiles. */
export const LOUNGE_FEED_ATTACHMENT_COLUMN_MAX_H_CLASS = 'max-h-[min(55vh,420px)]'

/** @typedef {'column' | 'tall'} LoungeFeedAttachmentTier */

/** Variants that use feed-style carousel (peek, rubber-band, unified row height). */
export const LOUNGE_FEED_CAROUSEL_LAYOUT_VARIANTS = new Set(['feed', 'detail', 'commentInline'])

/**
 * @param {string} [variant]
 */
export function loungeFeedUsesCarouselLayout(variant) {
  return LOUNGE_FEED_CAROUSEL_LAYOUT_VARIANTS.has(String(variant || ''))
}

/**
 * Viewport full-bleed breakout (avatar-caption column rows only).
 * @param {string} [variant]
 * @param {{ captionColumn?: boolean }} [opts]
 */
export function loungeFeedCarouselFullBleed(variant, opts = {}) {
  const v = String(variant || '')
  const captionColumn = Boolean(opts.captionColumn)
  if (v === 'feed') return true
  if (v === 'commentInline') return captionColumn
  if (v === 'detail' && captionColumn) return true
  return false
}

/**
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @returns {LoungeFeedAttachmentTier}
 */
export function loungeFeedImageAttachmentTier(naturalWidth, naturalHeight) {
  const w = Number(naturalWidth)
  const h = Number(naturalHeight)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'column'
  return h / w > LOUNGE_FEED_ATTACHMENT_TALL_HW_RATIO ? 'tall' : 'column'
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ variant?: string }} [opts]
 */
export function loungeFeedAttachmentOuterShellClassName(tier, opts = {}) {
  const { variant = 'feed' } = opts
  if (variant === 'composer') {
    return 'inline-flex w-auto max-w-[min(78vw,18rem)] shrink-0 self-start'
  }
  if (variant === 'detail' || variant === 'commentInline') {
    return LOUNGE_FEED_ATTACHMENT_COLUMN_SHELL_CLASS
  }
  if (tier === 'tall') {
    return LOUNGE_FEED_ATTACHMENT_TALL_SHELL_CLASS
  }
  return LOUNGE_FEED_ATTACHMENT_COLUMN_SHELL_CLASS
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ variant?: string }} [opts]
 */
export function loungeFeedAttachmentTileWidthClassName(tier, opts = {}) {
  void tier
  const { variant = 'feed' } = opts
  if (variant === 'composer') {
    return 'relative block w-fit max-w-full'
  }
  // Frame hugs poster/video used size (max-w/max-h constrained); never stretch to column.
  return 'relative block w-fit max-w-full'
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ singleInPost?: boolean, multiCarousel?: boolean, fullBleed?: boolean }} [opts]
 */
export function loungeFeedAttachmentSlideClassName(tier, opts = {}) {
  const { singleInPost = false, multiCarousel = false } = opts
  if (multiCarousel) {
    return 'relative shrink-0 min-w-[3rem]'
  }
  if (tier === 'tall') {
    return 'relative w-auto max-w-[min(100%,20rem)] shrink-0 snap-start'
  }
  // Single still/video: hug used width so max-h cannot leave empty side bars.
  if (singleInPost) {
    return 'relative w-auto max-w-full min-w-0 shrink-0 snap-start'
  }
  return 'relative w-auto max-w-full min-w-0 shrink-0 snap-start'
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ rounding: string, border: string }} frame
 * @param {{ multiCarousel?: boolean, fullBleed?: boolean }} [layout]
 */
export function loungeFeedAttachmentFrameClassName(tier, { rounding, border }, layout = {}) {
  void tier
  const { multiCarousel = false } = layout
  const shell = `overflow-hidden ${rounding} border ${border} bg-zinc-950/40`
  if (multiCarousel) {
    return `block h-full w-full ${shell}`
  }
  return `block w-fit max-w-full ${shell}`
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ multiCarousel?: boolean, fullBleed?: boolean }} [layout]
 */
export function loungeFeedAttachmentImgClassName(tier, layout = {}) {
  const { multiCarousel = false } = layout
  if (multiCarousel) {
    return 'block h-full w-full object-contain'
  }
  void tier
  // Fit inside caption width × max-h; used size drives the frame (no w-full + object-contain pillarbox).
  return `block h-auto w-auto max-w-full ${LOUNGE_FEED_ATTACHMENT_COLUMN_MAX_H_CLASS} object-contain`
}

/** @param {LoungeFeedAttachmentTier} tier */
export function loungeFeedAttachmentTapTargetClassName(tier, opts = {}) {
  const { multiCarousel = false } = opts
  const tap =
    'cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50'
  if (multiCarousel) {
    return `block h-full w-full ${tap}`
  }
  if (tier === 'tall') {
    return `block w-auto max-w-[min(100%,20rem)] ${tap}`
  }
  return `block w-auto max-w-full ${tap}`
}
