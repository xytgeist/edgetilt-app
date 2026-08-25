/**
 * X-style profile header collapse math.
 *
 * Cross-platform (IPA WKWebView, iOS/Android PWA, Android Chrome, desktop):
 * - Progress is pure scrollTop math (no shell-only APIs).
 * - Banner pins via `position: sticky` (not scroll-away + fake translate).
 * - Prefer `position: sticky` for tabs inside the profile scroll root.
 * - IPA keeps the tuned chrome-mid + lag/shrink preset; PWA/Android/web use a
 *   higher chrome seat + faster shrink so the banner can clear the avatar ring.
 * - Collapsed look (hybrid C): live `filter: blur` on banner media + thin frost
 *   under chrome/name, gated on avatar tuck → display-name entry (not pin settle).
 *   Android uses an earlier tuck fraction than Apple.
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

/** Final avatar scale once shrink completes (IPA preset). */
export const PROFILE_AVATAR_MIN_SCALE = 0.78

/** Matches `ring-4` on the profile avatar … outer edge of the border around the face. */
export const PROFILE_AVATAR_RING_PX = 4

/** IPA: fraction of scroll counteracted on the avatar during pin/shrink. */
export const PROFILE_AVATAR_SCROLL_LAG = 0.45

/** IPA: ease-in power for avatar scale over the pin window. */
export const PROFILE_AVATAR_SHRINK_EASE_POWER = 1.85

/** Max `filter: blur()` on the banner media when frost completes. */
export const PROFILE_BANNER_MEDIA_BLUR_MAX_PX = 22

/**
 * Default tuck fraction before blur may begin (Apple / desktop).
 * Android uses a lower fraction via `profileBannerBlurTuckFrac()`.
 */
export const PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC = 0.9

/** Android: avatar clears the pinned strip later in scroll … start blur sooner. */
export const PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC_ANDROID = 0.58

/**
 * Platform tuck fraction for banner media blur.
 * Positive Android UA check only (`AGENT_RULE_POSITIVE_PLATFORM_GUARDS`).
 * @param {string} [ua]
 */
export function profileBannerBlurTuckFrac(ua) {
  const agent =
    ua
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (/Android/i.test(String(agent || ''))) return PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC_ANDROID
  return PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC
}

/**
 * Live blur progress: 0 until avatar tuckFrac is under the banner, then ramps until
 * the display name reaches the banner bottom. Self-calibrates the ramp via name gap.
 *
 * @param {{
 *   underFrac: number,
 *   nameGapPx: number,
 *   tuckFrac?: number,
 *   nameGapAtTuckRef?: { current: number | null },
 *   reduceMotion?: boolean,
 * }} args
 * @returns {number} 0..1
 */
export function profileLiveBannerBlurProgress({
  underFrac,
  nameGapPx,
  tuckFrac = PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC,
  nameGapAtTuckRef = null,
  reduceMotion = false,
}) {
  const tuck = Math.max(0.05, Math.min(0.95, Number(tuckFrac) || PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC))
  const under = Math.max(0, Math.min(1, Number(underFrac) || 0))
  const gap = Number(nameGapPx)
  if (under < tuck) {
    if (nameGapAtTuckRef) nameGapAtTuckRef.current = null
    return 0
  }
  if (!(gap > 0)) return 1
  let denom = nameGapAtTuckRef ? nameGapAtTuckRef.current : null
  if (denom == null || denom < 8) {
    denom = Math.max(28, gap)
    if (nameGapAtTuckRef) nameGapAtTuckRef.current = denom
  }
  let t = 1 - gap / denom
  t = Math.max(0, Math.min(1, t))
  if (reduceMotion) return t >= 0.5 ? 1 : 0
  return t
}

/**
 * Motion + chrome presets.
 * IPA: Ryan-signed mid-banner chrome + lag/shrink.
 * Web (PWA / Android / desktop): raise chrome in the photo band; shrink faster /
 * farther and lag less so the pinned banner bottom can clear the avatar ring top.
 *
 * @param {boolean} isIpaShell `isEdgeiOSShell()` … positive IPA check only
 */
export function profileCollapseShellPreset(isIpaShell) {
  if (isIpaShell) {
    return {
      /** Extra px below banner midpoint for chrome vertical center. */
      chromeCenterExtraPx: 10,
      /** 0..1 fraction of *content* band for non-IPA target (unused on IPA). */
      chromeContentCenterFrac: 0.5,
      scrollLag: PROFILE_AVATAR_SCROLL_LAG,
      shrinkEasePower: PROFILE_AVATAR_SHRINK_EASE_POWER,
      minScale: PROFILE_AVATAR_MIN_SCALE,
    }
  }
  return {
    chromeCenterExtraPx: 0,
    /** Sit in the upper part of the photo band (status-restricted / no IPA bleed). */
    chromeContentCenterFrac: 0.34,
    scrollLag: 0.55,
    shrinkEasePower: 1.75,
    minScale: 0.8,
  }
}

/**
 * Vertical translate for the chrome row so back/⋯ sit on the tuned banner center.
 * @param {{ bannerHeightPx: number, chromePadTopPx: number, isIpaShell?: boolean }} args
 */
export function profileChromeCenterNudgePx({
  bannerHeightPx,
  chromePadTopPx,
  isIpaShell = false,
}) {
  const bannerH = Math.max(0, Number(bannerHeightPx) || 0)
  const pad = Math.max(0, Number(chromePadTopPx) || 0)
  const halfBtn = 20
  const preset = profileCollapseShellPreset(Boolean(isIpaShell))
  if (!bannerH) return 0

  if (isIpaShell) {
    return Math.max(
      0,
      Math.round(bannerH / 2 - pad - halfBtn + preset.chromeCenterExtraPx),
    )
  }

  const contentH = Math.max(0, bannerH - pad)
  const targetCenter = pad + Math.round(contentH * preset.chromeContentCenterFrac)
  return Math.max(0, Math.round(targetCenter - pad - halfBtn))
}

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
 * @param {{
 *   reduceMotion?: boolean,
 *   scrollLag?: number,
 *   shrinkEasePower?: number,
 *   minScale?: number,
 * }} [opts]
 */
export function profileCollapseVisuals(scrollTop, pinRangePx = PROFILE_COLLAPSE_RANGE_PX, opts = {}) {
  const y = Math.max(0, Number(scrollTop) || 0)
  const pinRange = Math.max(24, Number(pinRangePx) || PROFILE_COLLAPSE_RANGE_PX)
  const reduce = Boolean(opts.reduceMotion)
  const lag = Math.max(
    0,
    Math.min(1, opts.scrollLag != null ? Number(opts.scrollLag) : PROFILE_AVATAR_SCROLL_LAG),
  )
  const shrinkPower = Math.max(
    1,
    Number(opts.shrinkEasePower) || PROFILE_AVATAR_SHRINK_EASE_POWER,
  )
  const minScale = Math.max(
    0.35,
    Math.min(1, opts.minScale != null ? Number(opts.minScale) : PROFILE_AVATAR_MIN_SCALE),
  )

  const pinRaw = profileCollapseProgress(y, pinRange)
  const pinEase = reduce ? (pinRaw >= 0.5 ? 1 : pinRaw * 2) : smoothstep01(pinRaw)

  const pinStart = PROFILE_PIN_SCRIM_START
  const pinReveal = Math.max(0, Math.min(1, (pinEase - pinStart) / (1 - pinStart)))

  const shrinkT = reduce ? pinRaw : Math.pow(pinRaw, shrinkPower)
  const avatarScale = 1 - shrinkT * (1 - minScale)

  let avatarTranslateY = 0
  if (!reduce && lag > 0) {
    avatarTranslateY = (y <= pinRange ? y : pinRange) * lag
  }

  return {
    /** 0..1 while the banner is sliding to its sticky rest. */
    pinProgress: pinRaw,
    bannerTranslateY: 0,
    /** Media blur is applied live in the profile screen (tuck → name). */
    bannerBlurPx: 0,
    /** Resting live tint stays light … collapse frost tracks live blur progress. */
    bannerScrim: 0.06,
    collapsedBarOpacity: pinReveal,
    avatarScale,
    avatarTranslateY,
    avatarOpacity: 1,
    /** Raise banner over avatar once the pin/clear line is reached. */
    avatarUnderBanner: y > pinRange + 2,
  }
}

/**
 * ScrollTop when `tuckFrac` of the avatar height sits under the pinned banner bottom.
 * Uses post-pin lag freeze + layout height (not min-scale) so 90% tuck is not early.
 *
 * @param {{
 *   avatarTopPx: number,
 *   avatarHeightPx: number,
 *   pinnedVisiblePx: number,
 *   pinRangePx: number,
 *   scrollLag?: number,
 *   tuckFrac?: number,
 * }} args
 */
export function profileBannerBlurStartScrollPx({
  avatarTopPx,
  avatarHeightPx,
  pinnedVisiblePx,
  pinRangePx,
  scrollLag = PROFILE_AVATAR_SCROLL_LAG,
  tuckFrac = PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC,
}) {
  const A0 = Number(avatarTopPx) || 0
  const H = Math.max(1, Number(avatarHeightPx) || 1)
  const P = Math.max(0, Number(pinnedVisiblePx) || 0)
  const pinRange = Math.max(0, Number(pinRangePx) || 0)
  const lag = Math.max(0, Math.min(1, Number(scrollLag) || 0))
  const frac = Math.max(0.05, Math.min(1, Number(tuckFrac) || PROFILE_BANNER_BLUR_AVATAR_TUCK_FRAC))
  // After pin: screenTop = A0 - y + pinRange*lag. Want P - screenTop = frac*H.
  return Math.round(A0 - P + pinRange * lag + frac * H)
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
