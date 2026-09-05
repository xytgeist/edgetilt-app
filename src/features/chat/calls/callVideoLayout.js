/**
 * Count-based video-call tile plan.
 * Keep in sync with `layoutVideoViews` in `ios/EdgeTilt/EdgeLiveKitCallManager.swift`.
 *
 * 1: You fill the stage
 * 2: featured full-bleed + other as inset (tap inset to swap). You can be featured.
 * 3–4: featured remote full-bleed, others + You stacked on the right (You bottom)
 * 5+: featured top half, rest in 2 rows (floor/ceil) with You last on the bottom row
 */

/** Duo pip gap above the pill. Native `layoutDuo` uses the same point value. */
export const DUO_PIP_CHROME_BOTTOM_PX = 184
export const DUO_PIP_RIGHT_PX = 16

/**
 * @param {{
 *   remoteIds?: string[],
 *   localId?: string | null,
 *   featuredId?: string | null,
 * }} args
 */
export function planCallVideoLayout({
  remoteIds = [],
  localId = null,
  featuredId = null,
} = {}) {
  const remotes = remoteIds.map((id) => String(id || '').trim()).filter(Boolean)
  const you = String(localId || '').trim() || null
  const count = remotes.length + (you ? 1 : 0)
  const want = String(featuredId || '').trim()
  const featuredRemote = remotes.includes(want) ? want : remotes[0] || null
  const otherRemotes = remotes.filter((id) => id !== featuredRemote)
  const restWithYou = you ? [...otherRemotes, you] : otherRemotes

  if (count <= 1) {
    return { mode: 'solo', count, featuredId: you, pipId: null, youId: you, localIsFeatured: true }
  }
  if (count === 2) {
    const remote = remotes[0] || null
    const localIsFeatured = Boolean(you && want === you)
    return {
      mode: 'duo',
      count,
      featuredId: localIsFeatured ? you : remote,
      pipId: localIsFeatured ? remote : you,
      youId: you,
      localIsFeatured,
    }
  }
  if (count <= 4) {
    return {
      mode: 'stack',
      count,
      featuredId: featuredRemote,
      stackIds: restWithYou,
      youId: you,
      localIsFeatured: false,
    }
  }

  const row0n = Math.floor(restWithYou.length / 2)
  return {
    mode: 'grid',
    count,
    featuredId: featuredRemote,
    row0: restWithYou.slice(0, row0n),
    row1: restWithYou.slice(row0n),
    youId: you,
    localIsFeatured: false,
  }
}

/**
 * Duo inset size. Camera-off is a square. Chrome-up widens to 3:4. Chrome-hidden is 9:16.
 * Keep in sync with `duoPipFrame` in `EdgeLiveKitCallManager.swift`.
 * @param {{ hasCamera?: boolean, controlsHidden?: boolean, viewportWidth?: number }} args
 */
export function duoPipSize({ hasCamera = true, controlsHidden = false, viewportWidth = 390 } = {}) {
  const pipW = Math.min(120, Math.max(88, viewportWidth * 0.26))
  if (!hasCamera) return { width: pipW, height: pipW }
  if (controlsHidden) return { width: pipW, height: (pipW * 16) / 9 }
  return { width: pipW, height: (pipW * 4) / 3 }
}

export const CALL_STREAM_DOUBLE_TAP_MS = 320
