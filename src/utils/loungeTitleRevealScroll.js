/**
 * Scroll-linked title bar reveal for Lounge feed / full-screen dock panels.
 * Keep constants in sync wherever this helper is used (feed scroll, dock panel scroll).
 */

export const LOUNGE_TITLE_REVEAL_PER_SCROLL_PX = 220
export const LOUNGE_TITLE_HIDE_PER_SCROLL_PX = 190
export const LOUNGE_TITLE_SCROLL_MAX_ABS_STEP_PX = 180
export const LOUNGE_TITLE_SCROLL_MIN_STEP_PX = 0.35

/**
 * How far a fixed title bar must travel to clear the top of the screen when hidden.
 * Bars sit at `top: viewportTopPx` (below status bar / Island). Hiding by bar height alone
 * parks the chrome in the status bar … include viewportTopPx in the travel distance.
 *
 * @param {number} barHeightPx
 * @param {number} [viewportTopPx=0]
 * @returns {number}
 */
export function loungeTitleBarHideTravelPx(barHeightPx, viewportTopPx = 0) {
  const h = barHeightPx > 0 ? barHeightPx : 56
  const top = Math.max(0, Number(viewportTopPx) || 0)
  return h + top
}

/**
 * @param {number} reveal - 1 = fully shown, 0 = fully hidden
 * @param {number} barHeightPx
 * @param {number} [viewportTopPx=0]
 * @returns {number} translateY in px (negative = up)
 */
export function loungeTitleBarHideTranslateYPx(reveal, barHeightPx, viewportTopPx = 0) {
  const r = Math.min(1, Math.max(0, Number(reveal) || 0))
  return -(1 - r) * loungeTitleBarHideTravelPx(barHeightPx, viewportTopPx)
}

/**
 * @param {object} opts
 * @param {number} opts.scrollTop
 * @param {number} opts.effectiveDelta - clamped scroll delta (signed)
 * @param {import('react').MutableRefObject<number>} opts.revealRef - current reveal in [0,1]
 * @returns {{ reveal: number, changed: boolean }}
 */
export function loungeTitleRevealAfterScrollStep({ scrollTop, effectiveDelta, revealRef }) {
  const prevR = revealRef.current
  let r = prevR
  if (scrollTop <= 2) {
    r = 1
  } else if (effectiveDelta < -LOUNGE_TITLE_SCROLL_MIN_STEP_PX) {
    r = Math.min(1, r + (-effectiveDelta) / LOUNGE_TITLE_REVEAL_PER_SCROLL_PX)
  } else if (effectiveDelta > LOUNGE_TITLE_SCROLL_MIN_STEP_PX) {
    r = Math.max(0, r - effectiveDelta / LOUNGE_TITLE_HIDE_PER_SCROLL_PX)
  }
  const changed = r !== prevR
  revealRef.current = r
  return { reveal: r, changed }
}

/**
 * @param {number} rawScrollDelta
 * @returns {number}
 */
export function loungeTitleRevealClampScrollDelta(rawScrollDelta) {
  if (rawScrollDelta === 0) return 0
  return Math.sign(rawScrollDelta) * Math.min(Math.abs(rawScrollDelta), LOUNGE_TITLE_SCROLL_MAX_ABS_STEP_PX)
}
