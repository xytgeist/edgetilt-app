/** Fullscreen landscape shell for Advanced market chart. */

/** @returns {boolean} */
export function isMarketChartPortraitViewport() {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

/** Fullscreen shell - always upright in viewport (no CSS rotate; keeps LWC canvas sharp). */
export function marketChartAdvancedFullscreenShellStyle() {
  return {
    width: '100%',
    height: '100%',
  }
}

/** Plot area fills the shell below header / ticker chips. */
export function marketChartAdvancedPlotWrapStyle() {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
  }
}

/**
 * Request landscape while the open-Advanced user gesture is still active.
 * Must be called synchronously from the Advanced button click - not from useEffect.
 * @param {HTMLElement | null | undefined} [hostEl] optional fullscreen root for requestFullscreen
 * @returns {Promise<boolean>} true when landscape lock likely succeeded
 */
export async function lockMarketChartLandscapeOrientation(hostEl) {
  try {
    const el = hostEl instanceof HTMLElement ? hostEl : null
    if (el?.requestFullscreen && document.fullscreenElement !== el) {
      await el.requestFullscreen()
    }
  } catch {
    /* Fullscreen optional - required on some Android builds before orientation.lock */
  }

  try {
    const orientation = screen.orientation
    if (typeof orientation?.lock === 'function') {
      await orientation.lock('landscape')
      return !isMarketChartPortraitViewport()
    }
  } catch {
    /* iOS Safari tab - lock unsupported; user rotates device manually */
  }

  return !isMarketChartPortraitViewport()
}

export function unlockMarketChartLandscapeOrientation() {
  try {
    screen.orientation?.unlock?.()
  } catch {
    /* ignore */
  }
  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen()
    }
  } catch {
    /* ignore */
  }
}
