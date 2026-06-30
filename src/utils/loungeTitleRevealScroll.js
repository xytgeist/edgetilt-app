/**
 * Scroll-linked title bar reveal for Lounge feed / full-screen dock panels.
 * Keep constants in sync wherever this helper is used (feed scroll, dock panel scroll).
 */

export const LOUNGE_TITLE_REVEAL_PER_SCROLL_PX = 220
export const LOUNGE_TITLE_HIDE_PER_SCROLL_PX = 190
export const LOUNGE_TITLE_SCROLL_MAX_ABS_STEP_PX = 180
export const LOUNGE_TITLE_SCROLL_MIN_STEP_PX = 0.35

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
