/**
 * Feed post still/GIF attachment layout: full column vs tall (portrait screenshots).
 */

/** Height / width above this → tall attachment (width-first, taller max height). */
export const LOUNGE_FEED_ATTACHMENT_TALL_HW_RATIO = 1.35

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
 * @param {{ singleInPost?: boolean, multiCarousel?: boolean }} [opts]
 */
export function loungeFeedAttachmentSlideClassName(tier, opts = {}) {
  const { singleInPost = false, multiCarousel = false } = opts
  if (tier === 'tall' || singleInPost) {
    return 'relative w-full min-w-0 max-w-full shrink-0 snap-start'
  }
  if (multiCarousel) {
    return 'relative w-auto shrink-0 snap-start min-w-[3rem] max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]'
  }
  return 'relative w-auto shrink-0 snap-start min-w-[3rem] max-w-full'
}

/**
 * @param {LoungeFeedAttachmentTier} tier
 * @param {{ rounding: string, border: string }} frame
 */
export function loungeFeedAttachmentFrameClassName(tier, { rounding, border }) {
  const base = `block w-full max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`
  if (tier === 'tall') {
    return `${base} max-h-[min(85vh,960px)]`
  }
  return base
}

/** @param {LoungeFeedAttachmentTier} tier */
export function loungeFeedAttachmentImgClassName(tier) {
  if (tier === 'tall') {
    // Width always fills the column; frame max-height clips excess (lightbox for full image).
    return 'block w-full h-auto max-w-full object-contain object-top'
  }
  return 'block w-full max-h-[312px] h-auto max-w-full object-contain'
}

/** @param {LoungeFeedAttachmentTier} tier */
export function loungeFeedAttachmentTapTargetClassName(tier) {
  const tap =
    'cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50'
  void tier
  return `block w-full max-w-full ${tap}`
}
