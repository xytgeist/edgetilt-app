/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Callers apply transforms/opacity/filter; use solid overlay fallback when
 *   `backdrop-filter` is weak (some Android WebViews).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 *
 * Motion notes (from X reference recording):
 * - Avatar starts ON TOP of the banner with ~1/4 overlap.
 * - Shrink uses top-anchored scale so the avatar crown stays put, then a late
 *   tuck slides it under the pinned banner.
 * - Collapsed blur/scrim only appears once the banner has settled (not mid-scroll).
 *
 * `AGENT_RULE_PROFILE_SCROLL_COLLAPSE` — searchability token.
 */

/** Scroll distance (px) over which the banner pins and the avatar shrinks/tucks. */
export const PROFILE_COLLAPSE_RANGE_PX = 112

/** Extra scroll after collapse before the compact name is fully opaque. */
export const PROFILE_COMPACT_NAME_FADE_PX = 36

/** Collapsed chrome row under the status bar (back / name / ⋯). */
export const PROFILE_COLLAPSED_CHROME_ROW_PX = 48

/**
 * Progress fraction where shrink finishes and tuck-under begins.
 * First phase = scale with top locked; second = slide under banner.
 */
export const PROFILE_AVATAR_TUCK_START = 0.72

/**
 * Progress fraction where the pinned blur/scrim may begin fading in.
 * Before this, banner stays sharp (blur mid-parallax looks wrong).
 */
export const PROFILE_PIN_SCRIM_START = 0.9

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

  const tuckStart = PROFILE_AVATAR_TUCK_START
  const shrinkPhase = Math.min(1, ease / tuckStart)
  const tuckPhase = Math.max(0, (ease - tuckStart) / (1 - tuckStart))

  // Scrim/blur only after the banner has effectively pinned.
  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (ease - pinStart) / (1 - pinStart)))

  return {
    /** Banner parallax while collapsing (negative = up). No mid-scroll blur. */
    bannerTranslateY: reduce ? 0 : -ease * 14,
    /** Keep banner image sharp until pinned … blur lives on the collapsed chrome. */
    bannerBlurPx: 0,
    /** Light rest dim only; do not ramp a visible overlay during parallax. */
    bannerScrim: 0.08,
    /** Fixed collapsed bar backdrop … appears only at pin. */
    collapsedBarOpacity: pinReveal,
    /** Large avatar scale (1 → ~0.45) with top edge anchored by transform-origin. */
    avatarScale: 1 - shrinkPhase * 0.55,
    /**
     * Late tuck under the banner (after shrink). Keep near-zero during shrink so
     * the crown stays visually planted.
     */
    avatarTranslateY: -tuckPhase * 40,
    avatarOpacity: 1 - Math.max(0, (tuckPhase - 0.35) / 0.65),
    /** When true, paint avatar under the banner so the tuck reads correctly. */
    avatarUnderBanner: tuckPhase > 0.08,
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
