/**
 * Icon band height: `max(MIN, round(titleBar * ratio))` then multiplied by `HEIGHT_SCALE` (rounded).
 * Ratio keeps the row from reading taller than top chrome; scale bumps the whole dock chrome (e.g. +10%).
 */
export const LOUNGE_DOCK_CHROME_TITLE_RATIO = 2 / 3
export const LOUNGE_DOCK_CHROME_MIN_PX = 36
export const LOUNGE_DOCK_CHROME_HEIGHT_SCALE = 1.1

export function dockChromeHeightFromTitleBarPx(titleBarPx) {
  if (!(titleBarPx > 0)) return 0
  const base = Math.max(
    LOUNGE_DOCK_CHROME_MIN_PX,
    Math.round(titleBarPx * LOUNGE_DOCK_CHROME_TITLE_RATIO)
  )
  return Math.max(1, Math.round(base * LOUNGE_DOCK_CHROME_HEIGHT_SCALE))
}
