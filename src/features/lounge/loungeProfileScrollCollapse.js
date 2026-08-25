/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Banner pins via `position: sticky` (not scroll-away + fake translate).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * Motion phases:
 * 1. Banner slides … avatar shrinks in place (top-tethered) only until the banner
 *    bottom rises above the avatar; then scale freezes.
 * 2. As soon as shrink ends, counter-scroll freezes so the avatar scrolls with
 *    the page and rides under the sticky banner.
 * 3. Collapsed blur/scrim only after the banner has settled.
 *
 * `AGENT_RULE_PROFILE_SCROLL_COLLAPSE` — searchability token.
 */

/** Extra scroll after collapse before the compact name is fully opaque. */
export const PROFILE_COMPACT_NAME_FADE_PX = 36

/** Collapsed chrome row under the status bar (back / name / ⋯). */
export const PROFILE_COLLAPSED_CHROME_ROW_PX = 48

/**
 * Pinned banner bottom sits this many px below the chrome button row bottom.
 * (X: thin banner strip under back / ⋯.)
 */
export const PROFILE_PINNED_BANNER_BELOW_CHROME_PX = 10

/** Fallback scroll range when banner geometry is not measured yet. */
export const PROFILE_COLLAPSE_RANGE_PX = 112

/** Scroll distance after the banner pins over which the avatar tucks under. */
export const PROFILE_AVATAR_TUCK_RANGE_PX = 56

/**
 * Progress fraction (within the pin range) where the pinned blur/scrim may begin.
 * Before this, banner stays sharp.
 */
export const PROFILE_PIN_SCRIM_START = 0.9

/** Final avatar scale once shrink completes (banner bottom cleared above avatar). */
export const PROFILE_AVATAR_MIN_SCALE = 0.78

/**
 * Sticky `top` so only `pinnedVisiblePx` of the banner remains in view.
 * @param {number} bannerHeightPx full in-flow banner height
 * @param {number} pinnedVisiblePx height that stays on screen when stuck
 */
export function profileBannerStickyTopPx(bannerHeightPx, pinnedVisiblePx) {
  const h = Math.max(0, Math.round(Number(bannerHeightPx) || 0))
  const visible = Math.max(0, Math.round(Number(pinnedVisiblePx) || 0))
  if (h <= 0) return 0
  return visible - h
}

/**
 * Scroll distance until the sticky banner finishes pinning.
 * @param {number} bannerHeightPx
 * @param {number} pinnedVisiblePx
 */
export function profileBannerPinScrollRangePx(bannerHeightPx, pinnedVisiblePx) {
  const h = Math.max(0, Math.round(Number(bannerHeightPx) || 0))
  const visible = Math.max(0, Math.round(Number(pinnedVisiblePx) || 0))
  return Math.max(24, h - visible)
}

/**
 * @param {number} scrollTop
 * @param {number} [rangePx]
 * @returns {number} 0..1
 */
export function profileCollapseProgress(scrollTop, rangePx = PROFILE_COLLAPSE_RANGE_PX) {
  const y = Number(scrollTop) || 0
  const range = Math.max(24, Number(rangePx) || PROFILE_COLLAPSE_RANGE_PX)
  if (y <= 0) return 0
  if (y >= range) return 1
  return y / range
}

function smoothstep01(t) {
  const p = Math.max(0, Math.min(1, Number(t) || 0))
  return p * p * (3 - 2 * p)
}

/**
 * @param {number} scrollTop
 * @param {number} pinRangePx scroll distance until the banner finishes pinning
 * @param {{ reduceMotion?: boolean, tuckRangePx?: number, shrinkRangePx?: number }} [opts]
 *   shrinkRangePx: scroll until banner bottom rises above the avatar top (shrink ends).
 */
export function profileCollapseVisuals(scrollTop, pinRangePx = PROFILE_COLLAPSE_RANGE_PX, opts = {}) {
  const y = Math.max(0, Number(scrollTop) || 0)
  const pinRange = Math.max(24, Number(pinRangePx) || PROFILE_COLLAPSE_RANGE_PX)
  const tuckRange = Math.max(24, Number(opts.tuckRangePx) || PROFILE_AVATAR_TUCK_RANGE_PX)
  // Shrink ends when the banner's lower edge has risen above the avatar … not at full pin.
  const shrinkRange = Math.max(
    16,
    Math.min(pinRange, Number(opts.shrinkRangePx) || Math.round(pinRange * 0.35)),
  )
  const reduce = Boolean(opts.reduceMotion)

  const pinRaw = profileCollapseProgress(y, pinRange)
  const pinEase = reduce ? (pinRaw >= 0.5 ? 1 : pinRaw * 2) : smoothstep01(pinRaw)

  const shrinkRaw = profileCollapseProgress(y, shrinkRange)
  const shrinkEase = reduce ? (shrinkRaw >= 0.5 ? 1 : shrinkRaw * 2) : smoothstep01(shrinkRaw)

  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (pinEase - pinStart) / (1 - pinStart)))

  const minScale = PROFILE_AVATAR_MIN_SCALE
  // Shrink only until banner bottom clears the avatar; then freeze.
  const avatarScale = 1 - shrinkEase * (1 - minScale)

  /**
   * During shrink: counter-scroll by +y so the TOP stays planted while scaling.
   * The moment shrink ends: freeze translate at +shrinkRange so further scroll
   * moves the avatar with the page (it rides under the sticky banner naturally).
   */
  let avatarTranslateY = 0
  if (!reduce) {
    avatarTranslateY = y <= shrinkRange ? y : shrinkRange
  }

  return {
    /** 0..1 while the banner is sliding to its sticky rest. */
    pinProgress: pinRaw,
    bannerTranslateY: 0,
    bannerBlurPx: 0,
    bannerScrim: 0.08,
    collapsedBarOpacity: pinReveal,
    avatarScale,
    avatarTranslateY,
    avatarOpacity: 1,
    /** Raise banner over avatar once shrink is done and content is scrolling under. */
    avatarUnderBanner: y > shrinkRange + 2,
  }
}

/**
 * Compact title opacity once the large display name has crossed under the collapsed bar.
 * @param {number} scrollTop
 * @param {number} nameRevealScrollTop scrollTop when name should start appearing
 */
export function profileCompactNameOpacity(scrollTop, nameRevealScrollTop) {
  const y = Number(scrollTop) || 0
  const start = Math.max(0, Number(nameRevealScrollTop) || 0)
  if (y <= start) return 0
  const t = (y - start) / PROFILE_COMPACT_NAME_FADE_PX
  return Math.max(0, Math.min(1, t))
}

/**
 * Sticky `top` for the tab strip = pinned banner bottom (chrome + below gap).
 * @param {number} safeTopPx
 */
export function profileTabsStickyTopPx(safeTopPx) {
  return (
    Math.max(0, Math.round(Number(safeTopPx) || 0))
    + PROFILE_COLLAPSED_CHROME_ROW_PX
    + PROFILE_PINNED_BANNER_BELOW_CHROME_PX
  )
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
