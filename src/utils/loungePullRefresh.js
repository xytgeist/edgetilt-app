/** Pull-to-refresh tuning shared by Lounge feed + notifications panel. */

export const LOUNGE_PULL_REFRESH_THRESHOLD_PX = 88
export const LOUNGE_PULL_MAX_VISUAL_PX = 300
export const LOUNGE_PULL_FINGER_GAIN = 1
export const LOUNGE_PULL_INDICATOR_BASE_PX = 36
export const LOUNGE_PULL_INDICATOR_MAX_PX = LOUNGE_PULL_INDICATOR_BASE_PX * 3
export const LOUNGE_PULL_SNAP_MS = '220ms cubic-bezier(0.33, 1, 0.68, 1)'

/** Sublinear pull curve - approaches cap smoothly (avoids linear layout jumps). */
export function loungePullVisualOffsetPx(rawDy, cap = LOUNGE_PULL_INDICATOR_MAX_PX) {
  if (rawDy <= 0) return 0
  return Math.min(cap, cap * (1 - Math.exp(-rawDy / 72)))
}
