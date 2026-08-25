/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Banner pins via `position: sticky` (not scroll-away + fake translate).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * Motion phases:
 * 1. Banner slides to pin … avatar shrinks in place with its TOP EDGE screen-pinned
 *    (counter-scroll + scale, transform-origin top). No tuck yet.
 * 2. After banner rests … scale freezes; counter-scroll releases so the avatar
 *    slides up under the pinned banner.
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

/** Final avatar scale once the banner has pinned (shrink completes at pin). */
export const PROFILE_AVATAR_MIN_SCALE = 0.45

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
 * @param {{ reduceMotion?: boolean, tuckRangePx?: number }} [opts]
 */
export function profileCollapseVisuals(scrollTop, pinRangePx = PROFILE_COLLAPSE_RANGE_PX, opts = {}) {
  const y = Math.max(0, Number(scrollTop) || 0)
  const pinRange = Math.max(24, Number(pinRangePx) || PROFILE_COLLAPSE_RANGE_PX)
  const tuckRange = Math.max(24, Number(opts.tuckRangePx) || PROFILE_AVATAR_TUCK_RANGE_PX)
  const reduce = Boolean(opts.reduceMotion)

  const pinRaw = profileCollapseProgress(y, pinRange)
  const pinEase = reduce ? (pinRaw >= 0.5 ? 1 : pinRaw * 2) : smoothstep01(pinRaw)

  // Tuck only after the banner has fully pinned … never during the pin slide.
  const tuckRaw =
    y <= pinRange ? 0 : Math.min(1, (y - pinRange) / tuckRange)
  const tuckEase = reduce ? (tuckRaw >= 0.5 ? 1 : tuckRaw * 2) : smoothstep01(tuckRaw)

  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (pinEase - pinStart) / (1 - pinStart)))

  const minScale = PROFILE_AVATAR_MIN_SCALE
  // Shrink only while the banner is still moving to its rest; freeze after pin.
  const avatarScale = 1 - pinEase * (1 - minScale)

  /**
   * Phase 1 (y ≤ pinRange): counter-scroll by +y so the avatar TOP stays planted
   * on screen while scale shrinks downward (transform-origin: top).
   * Phase 2 (after pin): release that counter-scroll so it rises under the banner.
   */
  let avatarTranslateY = 0
  if (!reduce) {
    if (y <= pinRange) {
      avatarTranslateY = y
    } else {
      // Release from +pinRange → 0, plus a little extra tuck under the sticky strip.
      avatarTranslateY = pinRange * (1 - tuckEase) - tuckEase * 28
    }
  } else if (y > pinRange) {
    avatarTranslateY = -tuckEase * 48
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
    avatarOpacity: 1 - Math.max(0, (tuckEase - 0.45) / 0.55),
    avatarUnderBanner: tuckEase > 0.06,
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
