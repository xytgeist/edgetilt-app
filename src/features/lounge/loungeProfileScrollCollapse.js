/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Callers apply transforms/opacity/filter; use solid overlay fallback when
 *   `backdrop-filter` is weak (some Android WebViews).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * `AGENT_RULE_PROFILE_SCROLL_COLLAPSE` — searchability token.
 */

/** Scroll distance (px) over which the banner pins + blurs and the avatar tucks. */
export const PROFILE_COLLAPSE_RANGE_PX = 112

/** Extra scroll after collapse before the compact name is fully opaque. */
export const PROFILE_COMPACT_NAME_FADE_PX = 36

/** Collapsed chrome row under the status bar (back / name / ⋯). */
export const PROFILE_COLLAPSED_CHROME_ROW_PX = 48

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

/**
 * @param {number} progress 0..1
 * @param {{ reduceMotion?: boolean }} [opts]
 */
export function profileCollapseVisuals(progress, opts = {}) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0))
  const reduce = Boolean(opts.reduceMotion)
  const ease = reduce ? (p >= 0.5 ? 1 : p * 2) : p * p * (3 - 2 * p) // smoothstep

  return {
    /** Banner parallax while collapsing (negative = up). */
    bannerTranslateY: reduce ? 0 : -ease * 18,
    /** Blur on the pinned/in-flow banner image. */
    bannerBlurPx: reduce ? (ease > 0.2 ? 12 : 0) : ease * 22,
    /** Dim scrim over banner for status-bar + frost readability. */
    bannerScrim: 0.12 + ease * 0.42,
    /** Fixed collapsed bar backdrop opacity (blurred crop). */
    collapsedBarOpacity: ease,
    /** Large avatar scale (1 → ~0.42). */
    avatarScale: 1 - ease * 0.58,
    /** Lift avatar toward the banner so it tucks under. */
    avatarTranslateY: -ease * 56,
    avatarOpacity: 1 - Math.max(0, (ease - 0.72) / 0.28),
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
 * Sticky `top` for the tab strip = safe area + collapsed chrome row.
 * @param {number} safeTopPx
 */
export function profileTabsStickyTopPx(safeTopPx) {
  return Math.max(0, Math.round(Number(safeTopPx) || 0)) + PROFILE_COLLAPSED_CHROME_ROW_PX
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
