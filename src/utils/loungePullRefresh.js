/** Pull-to-refresh tuning shared by Lounge feed + notifications panel. */

export const LOUNGE_PULL_REFRESH_THRESHOLD_PX = 88
export const LOUNGE_PULL_MAX_VISUAL_PX = 300
export const LOUNGE_PULL_FINGER_GAIN = 1
export const LOUNGE_PULL_INDICATOR_BASE_PX = 36
export const LOUNGE_PULL_INDICATOR_MAX_PX = LOUNGE_PULL_INDICATOR_BASE_PX * 3
export const LOUNGE_PULL_SNAP_MS = '220ms cubic-bezier(0.33, 1, 0.68, 1)'

/** Dead zone before PTR axis lock decides (px). */
export const LOUNGE_PULL_AXIS_LOCK_PX = 12
/** Min downward travel before locking to vertical pull (px). */
export const LOUNGE_PULL_VERTICAL_MIN_PX = 14
/** Abort PTR when |dx| >= |dy| * this (favors horizontal carousels slightly). */
export const LOUNGE_PULL_HORIZONTAL_VS_VERTICAL = 0.9
/** Engage PTR when |dy| >= |dx| * this (clear vertical intent). */
export const LOUNGE_PULL_VERTICAL_VS_HORIZONTAL = 1.35
/** Stricter vertical ratio when the gesture starts on a horizontal strip. */
export const LOUNGE_PULL_HORIZONTAL_SURFACE_VERTICAL_RATIO = 1.65

const LOUNGE_PULL_HORIZONTAL_SURFACE_SELECTOR = [
  '[data-lounge-feed-horizontal-scroll]',
  '[data-lounge-market-chart-strip]',
  '[data-lounge-market-chart-compare]',
  '[data-lounge-composer-market-chart-strip]',
  '[data-lounge-carousel-dragging]',
].join(', ')

/** True when touch started on image/GIF carousel or mini chart strip. */
export function loungePullIsHorizontalGestureSurface(target) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(LOUNGE_PULL_HORIZONTAL_SURFACE_SELECTOR))
}

/** Sublinear pull curve - approaches cap smoothly (avoids linear layout jumps). */
export function loungePullVisualOffsetPx(rawDy, cap = LOUNGE_PULL_INDICATOR_MAX_PX) {
  if (rawDy <= 0) return 0
  return Math.min(cap, cap * (1 - Math.exp(-rawDy / 72)))
}
