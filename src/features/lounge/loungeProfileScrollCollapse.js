/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Banner pins via `position: sticky` (not scroll-away + fake translate).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * Motion:
 * - Avatar scrolls up with the page while shrinking (no screen-pin / counter-scroll).
 * - Shrink runs for the banner pin distance and freezes when the banner rests.
 * - Banner resting bottom = avatar ring top at layout rest (the clear line).
 *
 * `AGENT_RULE_PROFILE_SCROLL_COLLAPSE` — searchability token.
 */

/** Extra scroll after collapse before the compact name is fully opaque. */
export const PROFILE_COMPACT_NAME_FADE_PX = 36

/** Collapsed chrome row under the status bar (back / name / ⋯). */
export const PROFILE_COLLAPSED_CHROME_ROW_PX = 48

/**
 * Extra px below a measured pin line (kept for tabs / chrome fallbacks).
 */
export const PROFILE_PINNED_BANNER_BELOW_CHROME_PX = 10

/** Fallback scroll range when banner geometry is not measured yet. */
export const PROFILE_COLLAPSE_RANGE_PX = 112

/**
 * Progress fraction (within the pin range) where the pinned blur/scrim may begin.
 * Before this, banner stays sharp.
 */
export const PROFILE_PIN_SCRIM_START = 0.9

/** Final avatar scale once the banner has rested on the avatar-ring clear line. */
export const PROFILE_AVATAR_MIN_SCALE = 0.78

/** Matches `ring-4` on the profile avatar … outer edge of the border around the face. */
export const PROFILE_AVATAR_RING_PX = 4

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
 *   (also the shrink window … pin rest = avatar-ring clear line)
 * @param {{ reduceMotion?: boolean }} [opts]
 */
export function profileCollapseVisuals(scrollTop, pinRangePx = PROFILE_COLLAPSE_RANGE_PX, opts = {}) {
  const y = Math.max(0, Number(scrollTop) || 0)
  const pinRange = Math.max(24, Number(pinRangePx) || PROFILE_COLLAPSE_RANGE_PX)
  const reduce = Boolean(opts.reduceMotion)

  const pinRaw = profileCollapseProgress(y, pinRange)
  const pinEase = reduce ? (pinRaw >= 0.5 ? 1 : pinRaw * 2) : smoothstep01(pinRaw)

  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (pinEase - pinStart) / (1 - pinStart)))

  const minScale = PROFILE_AVATAR_MIN_SCALE
  // Shrink while sliding up with the page; freeze when the banner rests on the clear line.
  const avatarScale = 1 - pinEase * (1 - minScale)

  return {
    /** 0..1 while the banner is sliding to its sticky rest. */
    pinProgress: pinRaw,
    bannerTranslateY: 0,
    bannerBlurPx: 0,
    bannerScrim: 0.08,
    collapsedBarOpacity: pinReveal,
    avatarScale,
    /** No counter-scroll … avatar rides the document while shrinking. */
    avatarTranslateY: 0,
    avatarOpacity: 1,
    /** Raise banner over avatar once the pin/clear line is reached. */
    avatarUnderBanner: y > pinRange + 2,
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
