/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Banner pins via `position: sticky` (not scroll-away + fake translate).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * Motion:
 * - Banner rises until its bottom sits ~5px below the back/⋯ buttons, then sticks.
 * - Avatar rises slower than the page (partial counter-scroll lag) while shrinking.
 * - Shrink is ease-in over the full pin distance so it feels slower early on.
 * - After pin, lag offset freezes so the avatar then scrolls 1:1 under the banner.
 *
 * `AGENT_RULE_PROFILE_SCROLL_COLLAPSE` — searchability token.
 */

/** Extra scroll after collapse before the compact name is fully opaque. */
export const PROFILE_COMPACT_NAME_FADE_PX = 36

/** Collapsed chrome row under the status bar (back / name / ⋯). */
export const PROFILE_COLLAPSED_CHROME_ROW_PX = 48

/**
 * Extra px below the chrome button bottoms where the pinned banner bottom rests.
 */
export const PROFILE_PINNED_BANNER_BELOW_CHROME_PX = 5

/** Fallback scroll range when banner geometry is not measured yet. */
export const PROFILE_COLLAPSE_RANGE_PX = 112

/**
 * Progress fraction (within the pin range) where the pinned blur/scrim may begin.
 * Before this, banner stays sharp.
 */
export const PROFILE_PIN_SCRIM_START = 0.9

/** Final avatar scale once shrink completes (banner finished pinning). */
export const PROFILE_AVATAR_MIN_SCALE = 0.78

/** Matches `ring-4` on the profile avatar … outer edge of the border around the face. */
export const PROFILE_AVATAR_RING_PX = 4

/**
 * Fraction of scroll that is counteracted on the avatar during the pin/shrink window.
 * 0 = full-speed with the page; 1 = screen-pinned.
 * Net upward speed ≈ (1 - lag) × scroll speed (~55% at 0.45).
 * Keep this well below ~0.85 on long chrome pin ranges or the avatar reads as stuck.
 */
export const PROFILE_AVATAR_SCROLL_LAG = 0.45

/**
 * Ease-in power for avatar scale over the pin window.
 * Higher = shrink stays near 1 longer, then catches up near the end.
 */
export const PROFILE_AVATAR_SHRINK_EASE_POWER = 1.85

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
 * Pinned banner visible height so that, with avatar scroll lag, the banner bottom
 * meets the avatar ring top at the same scrollTop the sticky pin finishes.
 * (Unused for the chrome+10 pin target; kept for clear-line experiments.)
 *
 * @param {number} bannerHeightPx
 * @param {number} avatarRingTopPx ring top from scrollport top at scrollTop 0 (no transform)
 * @param {number} [scrollLag]
 */
export function profileBannerPinnedVisibleForLagClear(
  bannerHeightPx,
  avatarRingTopPx,
  scrollLag = PROFILE_AVATAR_SCROLL_LAG,
) {
  const h = Math.max(0, Number(bannerHeightPx) || 0)
  const R0 = Math.max(0, Number(avatarRingTopPx) || 0)
  const lag = Math.max(0.01, Math.min(1, Number(scrollLag) || PROFILE_AVATAR_SCROLL_LAG))
  if (h <= 0) return Math.round(R0)
  const p = (R0 - h * (1 - lag)) / lag
  return Math.max(0, Math.min(Math.round(h), Math.round(p)))
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
 *   (also the shrink window … pin rest ≈ chrome button bottoms + 10px)
 * @param {{ reduceMotion?: boolean, scrollLag?: number, shrinkEasePower?: number }} [opts]
 */
export function profileCollapseVisuals(scrollTop, pinRangePx = PROFILE_COLLAPSE_RANGE_PX, opts = {}) {
  const y = Math.max(0, Number(scrollTop) || 0)
  const pinRange = Math.max(24, Number(pinRangePx) || PROFILE_COLLAPSE_RANGE_PX)
  const reduce = Boolean(opts.reduceMotion)
  const lag = Math.max(
    0,
    Math.min(1, Number(opts.scrollLag) || PROFILE_AVATAR_SCROLL_LAG),
  )
  const shrinkPower = Math.max(
    1,
    Number(opts.shrinkEasePower) || PROFILE_AVATAR_SHRINK_EASE_POWER,
  )

  const pinRaw = profileCollapseProgress(y, pinRange)
  const pinEase = reduce ? (pinRaw >= 0.5 ? 1 : pinRaw * 2) : smoothstep01(pinRaw)

  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (pinEase - pinStart) / (1 - pinStart)))

  const minScale = PROFILE_AVATAR_MIN_SCALE
  // Ease-in shrink over the full (now longer) chrome pin window … stays larger longer.
  const shrinkT = reduce ? pinRaw : Math.pow(pinRaw, shrinkPower)
  const avatarScale = 1 - shrinkT * (1 - minScale)

  /**
   * Partial counter-scroll during pin: avatar rises slower than the page.
   * After pin: freeze the lag offset so further scroll is 1:1 under the banner.
   */
  let avatarTranslateY = 0
  if (!reduce && lag > 0) {
    avatarTranslateY = (y <= pinRange ? y : pinRange) * lag
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
