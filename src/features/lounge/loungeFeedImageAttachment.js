/**
 * Feed post still/GIF attachment layout: full column vs tall narrow (phone screenshots).
 */

/** Height / width above this → tall attachment (narrow frame, not full post width). */
export const LOUNGE_FEED_ATTACHMENT_TALL_HW_RATIO = 1.35

/** Shared row height for multi-image feed carousels (width follows aspect ratio). */
export const LOUNGE_FEED_CAROUSEL_ROW_HEIGHT_CLASS = 'h-[min(55vh,420px)]'

/** @typedef {'column' | 'tall'} LoungeFeedAttachmentTier */

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
 * @param {{ singleInPost?: boolean, multiCarousel?: boolean, fullBleed?: boolean }} [opts]
 */
export function loungeFeedAttachmentSlideClassName(tier, opts = {}) {
  const { singleInPost = false, multiCarousel = false } = opts
  if (multiCarousel) {
    return `relative w-auto shrink-0 min-w-[3rem] ${LOUNGE_FEED_CAROUSEL_ROW_HEIGHT_CLASS}`
  }
  if (tier === 'tall') {
    return 'relative w-auto max-w-[min(72vw,20rem)] shrink-0 snap-start'
  }
  if (singleInPost) {
    return 'relative w-full min-w-0 max-w-full shrink-0 snap-start'
  }
  return 'relative w-full min-w-0 max-w-full shrink-0 snap-start'
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
    return `inline-flex h-full max-w-full items-center justify-center ${shell}`
  }
  return `block w-full max-w-full ${shell}`
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ multiCarousel?: boolean, fullBleed?: boolean }} [layout]
 */
export function loungeFeedAttachmentImgClassName(tier, layout = {}) {
  const { multiCarousel = false, fullBleed = false } = layout
  const fullBleedSlideMax =
    'max-w-[calc(100vw-var(--lounge-feed-carousel-inset-start)-var(--lounge-feed-carousel-peek))]'
  if (multiCarousel) {
    const widthCap = fullBleed
      ? fullBleedSlideMax
      : 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]'
    return `block h-full w-auto ${widthCap} object-contain`
  }
  if (tier === 'tall') {
    return 'block w-full h-auto max-w-full max-h-[min(55vh,420px)] object-contain'
  }
  // h/w <= 1.35: width-first at full column — no max-h that shrinks width inward.
  return 'block w-full h-auto max-w-full object-contain'
}

/** @param {LoungeFeedAttachmentTier} tier */
export function loungeFeedAttachmentTapTargetClassName(tier, opts = {}) {
  const { multiCarousel = false } = opts
  const tap =
    'cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50'
  if (multiCarousel) {
    return `block h-full w-auto ${tap}`
  }
  if (tier === 'tall') {
    return `block w-auto max-w-[min(72vw,20rem)] ${tap}`
  }
  return `block w-full max-w-full ${tap}`
}
