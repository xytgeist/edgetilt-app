/**
 * Count-based video-call tile plan.
 * Keep in sync with `layoutVideoViews` in `ios/EdgeTilt/EdgeLiveKitCallManager.swift`.
 *
 * 1: You fill the stage
 * 2: featured full-bleed + other as inset (tap inset to swap). You can be featured.
 * 3–4: featured full-bleed + bottom inset row (You rightmost). Same chip size as if
 *      three insets fit. Tap an inset to feature that person. You can be featured.
 * 5+: featured top half, rest in 2 rows (floor/ceil) with You last on the bottom row
 */

/** Duo pip gap above the pill. Native `layoutDuo` uses the same point value. */
export const DUO_PIP_CHROME_BOTTOM_PX = 184
export const DUO_PIP_RIGHT_PX = 16
/** Screen Flip when You is featured: under the header Add-people chip (`right-4` + `h-11`). */
export const SCREEN_FLIP_CLASS =
  'top-[calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px))+0.75rem+2.75rem+0.5rem)] right-4'

/** 3–4 person inset row. Sized as three equal chips even when only two show. */
export const ROW_PIP_GAP_PX = 8
export const ROW_PIP_SIDE_PX = 16
export const ROW_PIP_SLOTS = 3
export const ROW_PIP_CHROME_BOTTOM_PX = DUO_PIP_CHROME_BOTTOM_PX

/** Tap-to-feature You is 2–4 people. 5+ stays featured-remote. */
export function canFeatureLocal(count) {
  return count >= 2 && count <= 4
}

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
    const localIsFeatured = Boolean(you && want === you)
    const featuredId = localIsFeatured ? you : featuredRemote
    const insetIds = remotes.filter((id) => id !== featuredId)
    if (you && featuredId !== you) insetIds.push(you)
    return {
      mode: 'row',
      count,
      featuredId,
      insetIds,
      youId: you,
      localIsFeatured,
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
/**
 * 3–4 inset chip size. Always 3:4. Does not change when chrome hides.
 * Keep in sync with `rowPipSize` in `EdgeLiveKitCallManager.swift`.
 * @param {{ viewportWidth?: number }} args
 */
export function rowPipSize({ viewportWidth = 390 } = {}) {
  const width =
    (viewportWidth - ROW_PIP_SIDE_PX * 2 - ROW_PIP_GAP_PX * (ROW_PIP_SLOTS - 1)) / ROW_PIP_SLOTS
  return { width, height: (width * 4) / 3 }
}

export function duoPipSize({ hasCamera = true, controlsHidden = false, viewportWidth = 390 } = {}) {
  const baseW = Math.min(120, Math.max(88, viewportWidth * 0.26))
  const hiddenH = (baseW * 16) / 9
  if (!hasCamera) return { width: baseW, height: baseW }
  if (controlsHidden) return { width: baseW, height: hiddenH }
  return { width: (hiddenH * 3) / 4, height: hiddenH }
}

export const CALL_STREAM_DOUBLE_TAP_MS = 320
