/**
 * Count-based video-call tile plan.
 * Keep in sync with `layoutVideoViews` in `ios/EdgeTilt/EdgeLiveKitCallManager.swift`.
 *
 * 1: You fill the stage
 * 2: featured full-bleed + other as inset (tap inset to swap). You can be featured.
 * 3–7: featured full-bleed + 3-wide 3:4 inset chips (You rightmost / bottom-right).
 *      3–4 = one row. 5–7 = two rows, extras on the bottom (5 = 2+2, 6 = 2+3, 7 = 3+3).
 * 8–9: same cinema, 4-wide chips. Fill bottom row first (8 = 3+4, 9 = 4+4).
 * Tap an inset to feature that person. You can be featured. Chrome hide moves
 * chips down without shrinking. Speaking ring on insets only.
 *
 * Hard cap: 9 live cameras. Extra people stay on the call as audio-only and
 * do not get a tile until a camera turns off or that person leaves.
 */

/** Duo pip gap above the pill. Native `layoutDuo` uses the same point value. */
export const DUO_PIP_CHROME_BOTTOM_PX = 184
export const DUO_PIP_RIGHT_PX = 16
/** Screen Flip when You is featured: under the header Add-people chip (`right-4` + `h-11`). */
export const SCREEN_FLIP_CLASS =
  'top-[calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px))+0.75rem+2.75rem+0.5rem)] right-4'

/** Inset bank. 3–7 use 3 slots; 8+ use 4. */
export const ROW_PIP_GAP_PX = 8
export const ROW_PIP_SIDE_PX = 16
export const ROW_PIP_SLOTS = 3
export const ROW_PIP_SLOTS_WIDE = 4
export const ROW_PIP_CHROME_BOTTOM_PX = DUO_PIP_CHROME_BOTTOM_PX
export const ROW_PIP_WIDE_AT = 8

/** Live cameras on the call. Extra joiners stay audio-only until a slot opens. */
export const MAX_CALL_VIDEO_STREAMS = 9

export function canEnableCallCamera({ localCamOn = false, liveCameraCount = 0 } = {}) {
  return Boolean(localCamOn) || liveCameraCount < MAX_CALL_VIDEO_STREAMS
}

/**
 * Who appears on the video stage (max 9). Prefer live cameras. You stay on
 * stage unless 9 other cameras are already up and yours is off.
 * @param {{
 *   localId?: string | null,
 *   remoteIds?: string[],
 *   cameraIds?: string[],
 *   limit?: number,
 * }} args
 */
export function pickCallVideoStageIds({
  localId = null,
  remoteIds = [],
  cameraIds = [],
  limit = MAX_CALL_VIDEO_STREAMS,
} = {}) {
  const you = String(localId || '').trim()
  const remotes = remoteIds.map((id) => String(id || '').trim()).filter((id) => id && id !== you)
  const cams = new Set(cameraIds.map((id) => String(id || '').trim()).filter(Boolean))
  const youHasCam = Boolean(you && cams.has(you))
  const remoteCams = remotes.filter((id) => cams.has(id))
  const remoteAvatars = remotes.filter((id) => !cams.has(id))
  const cameraCount = (youHasCam ? 1 : 0) + remoteCams.length
  if (cameraCount >= limit) {
    const ids = youHasCam ? [you, ...remoteCams] : [...remoteCams]
    return ids.slice(0, limit)
  }
  const ids = []
  if (you) ids.push(you)
  for (const id of remoteCams) {
    if (ids.length >= limit) break
    if (!ids.includes(id)) ids.push(id)
  }
  for (const id of remoteAvatars) {
    if (ids.length >= limit) break
    ids.push(id)
  }
  return ids
}

export function rowPipSlots(count) {
  return count >= ROW_PIP_WIDE_AT ? ROW_PIP_SLOTS_WIDE : ROW_PIP_SLOTS
}

/** Tap-to-feature You on any cinema layout (2+). */
export function canFeatureLocal(count) {
  return count >= 2
}

/**
 * Pack inset ids into rows (top → bottom). You should already be last in `insetIds`.
 * Balanced (5–7): extras go to the bottom row so 4 chips become 2+2, not 1+3.
 * Fill-bottom (8+): complete `slots`-wide rows from the bottom up.
 * @param {string[]} insetIds
 * @param {number} slots
 * @param {{ fillBottom?: boolean }} [opts]
 */
export function packInsetRows(insetIds = [], slots = ROW_PIP_SLOTS, { fillBottom = false } = {}) {
  const ids = insetIds.map((id) => String(id || '').trim()).filter(Boolean)
  const n = ids.length
  const cap = Math.max(1, slots)
  if (n === 0) return []
  const rowCount = Math.ceil(n / cap)
  /** @type {number[]} */
  const counts = []
  if (fillBottom) {
    let left = n
    for (let i = 0; i < rowCount; i += 1) {
      const take = Math.min(cap, left)
      counts.unshift(take)
      left -= take
    }
  } else {
    const base = Math.floor(n / rowCount)
    const extra = n % rowCount
    for (let i = 0; i < rowCount; i += 1) {
      const fromBottom = rowCount - 1 - i
      counts.push(base + (fromBottom < extra ? 1 : 0))
    }
  }
  let offset = 0
  return counts.map((c) => {
    const row = ids.slice(offset, offset + c)
    offset += c
    return row
  })
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

  const localIsFeatured = Boolean(you && want === you)
  const nextFeatured = localIsFeatured ? you : featuredRemote
  const insetIds = remotes.filter((id) => id !== nextFeatured)
  if (you && nextFeatured !== you) insetIds.push(you)
  const slots = rowPipSlots(count)
  const fillBottom = count >= ROW_PIP_WIDE_AT
  return {
    mode: 'row',
    count,
    featuredId: nextFeatured,
    insetIds,
    insetRows: packInsetRows(insetIds, slots, { fillBottom }),
    slots,
    youId: you,
    localIsFeatured,
  }
}

/**
 * Inset chip size. Always 3:4. Does not change when chrome hides.
 * Keep in sync with `rowPipSize` in `EdgeLiveKitCallManager.swift`.
 * @param {{ viewportWidth?: number, slots?: number }} args
 */
export function rowPipSize({ viewportWidth = 390, slots = ROW_PIP_SLOTS } = {}) {
  const cap = Math.max(1, slots)
  const width = (viewportWidth - ROW_PIP_SIDE_PX * 2 - ROW_PIP_GAP_PX * (cap - 1)) / cap
  return { width, height: (width * 4) / 3 }
}

/**
 * Duo inset size. Camera-off is a square. Chrome-up widens to 3:4. Chrome-hidden is 9:16.
 * Keep in sync with `duoPipFrame` in `EdgeLiveKitCallManager.swift`.
 * @param {{ hasCamera?: boolean, controlsHidden?: boolean, viewportWidth?: number }} args
 */
export function duoPipSize({ hasCamera = true, controlsHidden = false, viewportWidth = 390 } = {}) {
  const baseW = Math.min(120, Math.max(88, viewportWidth * 0.26))
  const hiddenH = (baseW * 16) / 9
  if (!hasCamera) return { width: baseW, height: baseW }
  if (controlsHidden) return { width: baseW, height: hiddenH }
  return { width: (hiddenH * 3) / 4, height: hiddenH }
}

export const CALL_STREAM_DOUBLE_TAP_MS = 320
