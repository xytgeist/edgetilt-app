/** Fullscreen landscape shell for Advanced market chart (CSS rotate on portrait). */

/** @returns {boolean} */
export function isMarketChartPortraitViewport() {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

/**
 * Size/position the advanced chart shell — on portrait phones, rotate to landscape layout.
 * @param {boolean} [portrait]
 */
export function marketChartAdvancedFullscreenShellStyle(portrait = isMarketChartPortraitViewport()) {
  if (!portrait) {
    return {
      width: '100%',
      height: '100%',
    }
  }
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100dvh',
    height: '100dvw',
    maxWidth: '100dvh',
    maxHeight: '100dvw',
    transform: 'translate(-50%, -50%) rotate(90deg) translateZ(0)',
  }
}

/**
 * Counter-rotate the plot block on portrait so the LWC canvas is not CSS-transformed (stays sharp).
 * Parent shell uses {@link marketChartAdvancedFullscreenShellStyle} rotate(90deg).
 */
export function marketChartAdvancedPlotWrapStyle(portrait = isMarketChartPortraitViewport()) {
  if (!portrait) {
    return {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
    }
  }
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100%',
    height: '100%',
    transform: 'translate(-50%, -50%) rotate(-90deg) translateZ(0)',
    transformOrigin: 'center center',
    display: 'flex',
    flexDirection: 'column',
  }
}

/** Best-effort OS landscape lock (no-op where unsupported, e.g. iOS Safari). */
export async function lockMarketChartLandscapeOrientation() {
  try {
    await screen.orientation?.lock?.('landscape')
  } catch {
    /* CSS rotation fallback */
  }
}

export function unlockMarketChartLandscapeOrientation() {
  try {
    screen.orientation?.unlock?.()
  } catch {
    /* ignore */
  }
}
