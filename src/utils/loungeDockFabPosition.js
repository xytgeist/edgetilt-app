/** @typedef {{ xPct: number, yPct: number, locked: boolean }} LoungeDockFabPrefs */

export const LOUNGE_DOCK_FAB_STORAGE_KEY = 'loungeDockFab:v1'
export const LOUNGE_DOCK_FAB_SIZE_PX = 50
const EDGE_PAD_PX = 20
const FAB_INSET_RIGHT_PX = 14
const FAB_INSET_BOTTOM_PX = 20

export const LOUNGE_DOCK_FAN_RADIUS_PX = 108
export const LOUNGE_DOCK_FAN_SWEEP_RAD = (132 * Math.PI) / 180
/** Ring carousel: distance from FAB center to each item. */
export const LOUNGE_DOCK_CAROUSEL_RADIUS_PX = 72
/** Horizontal gap from FAB center to pinned home icon center. */
export const LOUNGE_DOCK_HOME_FROM_FAB_CENTER_PX =
  LOUNGE_DOCK_CAROUSEL_RADIUS_PX + LOUNGE_DOCK_FAB_SIZE_PX / 2 + 20
/** Fixed angle between adjacent items (wide spacing; ring may extend off-screen). */
export const LOUNGE_DOCK_CAROUSEL_ITEM_STEP_RAD = (52 * Math.PI) / 180
/** Lounge list scroll padding so content clears FAB + wheel item at the anchor side. */
export const LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX = 40
export function loungeDockFabScrollBottomInsetPx() {
  return (
    LOUNGE_DOCK_FAB_SIZE_PX +
    LOUNGE_DOCK_CAROUSEL_RADIUS_PX +
    LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX +
    20
  )
}
const FAN_SWEEP_FILL = 0.9
const TAU = Math.PI * 2

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

/** Movable FAB bounds inside the viewport (safe-area friendly minimum padding). */
export function loungeDockFabMoveBounds(viewportW, viewportH, fabSize = LOUNGE_DOCK_FAB_SIZE_PX) {
  const minLeft = EDGE_PAD_PX
  const minTop = EDGE_PAD_PX
  const maxLeft = Math.max(minLeft, viewportW - fabSize - EDGE_PAD_PX)
  const maxTop = Math.max(minTop, viewportH - fabSize - EDGE_PAD_PX)
  return { minLeft, minTop, maxLeft, maxTop }
}

export function loungeDockFabDefaultPosition(viewportW, viewportH, fabSize = LOUNGE_DOCK_FAB_SIZE_PX) {
  const { maxLeft, maxTop } = loungeDockFabMoveBounds(viewportW, viewportH, fabSize)
  return {
    left: maxLeft - FAB_INSET_RIGHT_PX,
    top: maxTop - FAB_INSET_BOTTOM_PX,
  }
}

export function loungeDockFabPctFromPosition(left, top, bounds) {
  const spanX = bounds.maxLeft - bounds.minLeft || 1
  const spanY = bounds.maxTop - bounds.minTop || 1
  return {
    xPct: clamp((left - bounds.minLeft) / spanX, 0, 1),
    yPct: clamp((top - bounds.minTop) / spanY, 0, 1),
  }
}

export function loungeDockFabPositionFromPct(xPct, yPct, bounds) {
  return {
    left: bounds.minLeft + clamp(xPct, 0, 1) * (bounds.maxLeft - bounds.minLeft),
    top: bounds.minTop + clamp(yPct, 0, 1) * (bounds.maxTop - bounds.minTop),
  }
}

export function readLoungeDockFabPrefs() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOUNGE_DOCK_FAB_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (typeof o?.xPct !== 'number' || typeof o?.yPct !== 'number') return null
    return {
      xPct: clamp(o.xPct, 0, 1),
      yPct: clamp(o.yPct, 0, 1),
      locked: Boolean(o.locked),
    }
  } catch {
    return null
  }
}

/** @param {LoungeDockFabPrefs} prefs */
export function writeLoungeDockFabPrefs(prefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LOUNGE_DOCK_FAB_STORAGE_KEY,
      JSON.stringify({
        xPct: clamp(prefs.xPct, 0, 1),
        yPct: clamp(prefs.yPct, 0, 1),
        locked: Boolean(prefs.locked),
      }),
    )
  } catch {
    /* quota / private mode */
  }
}

export function loungeDockViewportSize() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  }
}

function fanBounds(viewport, itemRadius) {
  return {
    minX: EDGE_PAD_PX + itemRadius,
    maxX: viewport.width - EDGE_PAD_PX - itemRadius,
    minY: EDGE_PAD_PX + itemRadius,
    maxY: viewport.height - EDGE_PAD_PX - itemRadius,
  }
}

function offsetsInBounds(fabCenterX, fabCenterY, offsets, bounds) {
  return offsets.every((o) => {
    const cx = fabCenterX + o.x
    const cy = fabCenterY + o.y
    return cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY
  })
}

/**
 * angleFromUp: offset = (-sin(a), -cos(a)). 0 = up, + = clockwise toward left.
 */
function angleFromFab(fabX, fabY, pointX, pointY) {
  return Math.atan2(-(pointX - fabX), -(pointY - fabY))
}

/**
 * Fan wedge from closest horizontal + closest vertical screen edges (not screen center).
 * Opens into the interior quadrant opposite those edges.
 */
function fanSectorFromClosestEdges(fabCenterX, fabCenterY, bounds) {
  const distLeft = fabCenterX - bounds.minX
  const distRight = bounds.maxX - fabCenterX
  const distTop = fabCenterY - bounds.minY
  const distBottom = bounds.maxY - fabCenterY

  const nearRight = distRight <= distLeft
  const nearBottom = distBottom <= distTop

  /** Far corner from the anchor edges (where the fan should open). */
  const cornerX = nearRight ? bounds.minX : bounds.maxX
  const cornerY = nearBottom ? bounds.minY : bounds.maxY

  /** Rays along the two interior edges of the anchor corner. */
  const alongHorizontal = angleFromFab(fabCenterX, fabCenterY, cornerX, fabCenterY)
  const alongVertical = angleFromFab(fabCenterX, fabCenterY, fabCenterX, cornerY)
  const towardCorner = angleFromFab(fabCenterX, fabCenterY, cornerX, cornerY)

  let lo = Math.min(alongHorizontal, alongVertical)
  let hi = Math.max(alongHorizontal, alongVertical)

  /** If the corner lies outside [lo, hi], the wedge wraps through ±π — use the arc that contains it. */
  if (towardCorner < lo || towardCorner > hi) {
    const altLo = lo
    const altHi = hi + 2 * Math.PI
    const altCorner = towardCorner < lo ? towardCorner + 2 * Math.PI : towardCorner
    if (altCorner >= altLo && altCorner <= altHi) {
      lo = altLo
      hi = altHi
    } else {
      lo = lo - 2 * Math.PI
    }
  }

  const availableSweep = Math.max(0.45, hi - lo)
  const sweep = Math.min(LOUNGE_DOCK_FAN_SWEEP_RAD, availableSweep * FAN_SWEEP_FILL)
  const centerAngle = (lo + hi) / 2

  /** Room on the interior side of each anchor edge (not the cramped edge). */
  const interiorDistX = nearRight ? distLeft : distRight
  const interiorDistY = nearBottom ? distTop : distBottom

  const maxRadius = Math.min(interiorDistX, interiorDistY, LOUNGE_DOCK_FAN_RADIUS_PX)

  return {
    centerAngle,
    sweep,
    maxRadius,
    nearRight,
    nearBottom,
    distLeft,
    distRight,
    distTop,
    distBottom,
  }
}

/** Minimum ring radius so item circles do not overlap along the arc. */
function minFanRadiusForSpacing(itemCount, sweep, itemDiameter) {
  if (itemCount <= 1) return 0
  const step = sweep / (itemCount - 1)
  const halfStep = step / 2
  if (halfStep < 0.04) return LOUNGE_DOCK_FAN_RADIUS_PX
  return (itemDiameter * 1.15) / (2 * Math.sin(halfStep))
}

function buildOffsetsAtRadius(fabCenterX, fabCenterY, itemCount, centerAngle, sweep, radius) {
  const half = sweep / 2
  const offsets = []
  for (let i = 0; i < itemCount; i += 1) {
    const t = itemCount === 1 ? 0.5 : i / (itemCount - 1)
    const angle = centerAngle - half + t * sweep
    offsets.push({
      x: -Math.sin(angle) * radius,
      y: -Math.cos(angle) * radius,
    })
  }
  return offsets
}

/**
 * Fan item offsets from FAB center using closest side + closest top/bottom edges.
 * @param {number} fabCenterX
 * @param {number} fabCenterY
 * @param {number} itemCount
 * @param {{ width: number, height: number }} viewport
 * @param {number} itemRadius — half of menu bubble diameter (px)
 */
export function loungeDockFanOffsets(fabCenterX, fabCenterY, itemCount, viewport, itemRadius) {
  if (itemCount <= 0) return []

  const bounds = fanBounds(viewport, itemRadius)
  const sector = fanSectorFromClosestEdges(fabCenterX, fabCenterY, bounds)

  let sweep = sector.sweep
  const centerAngle = sector.centerAngle
  const itemDiameter = itemRadius * 2
  const spacingRadius = minFanRadiusForSpacing(itemCount, sweep, itemDiameter)

  let radius = Math.max(
    spacingRadius,
    sector.maxRadius - itemRadius,
    itemRadius * 3,
  )
  radius = Math.min(radius, LOUNGE_DOCK_FAN_RADIUS_PX)

  let offsets = buildOffsetsAtRadius(fabCenterX, fabCenterY, itemCount, centerAngle, sweep, radius)

  for (let attempt = 0; attempt < 12 && !offsetsInBounds(fabCenterX, fabCenterY, offsets, bounds); attempt += 1) {
    radius *= 0.9
    if (attempt > 4) sweep *= 0.96
    offsets = buildOffsetsAtRadius(fabCenterX, fabCenterY, itemCount, centerAngle, sweep, radius)
  }

  return offsets
}

function normalizeAngleDelta(a) {
  let x = a % TAU
  if (x > Math.PI) x -= TAU
  if (x < -Math.PI) x += TAU
  return x
}

/** True when the FAB sits on the left half of the screen (home anchors to the right). */
export function loungeDockFabOnLeftHalf(fabCenterX, viewportW) {
  return fabCenterX < viewportW / 2
}

/** Wheel angle for item index 0 (home): right of FAB on left half, left of FAB on right half. */
export function loungeDockHomeAnchorAngle(fabCenterX, viewportW) {
  return loungeDockFabOnLeftHalf(fabCenterX, viewportW) ? -Math.PI / 2 : Math.PI / 2
}

/** Picker notch direction (interior of screen from FAB) — spin aligns nearest item here on release. */
export function loungeDockCarouselPickerAngle(fabCenterX, fabCenterY, bounds) {
  return fanSectorFromClosestEdges(fabCenterX, fabCenterY, bounds).centerAngle
}

export function loungeDockCarouselFocusedIndex(
  itemCount,
  rotationRad,
  step,
  pickerAngle,
  homeAnchorAngle,
) {
  if (itemCount <= 0) return 0
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < itemCount; i += 1) {
    const diff = Math.abs(
      normalizeAngleDelta(homeAnchorAngle + rotationRad + i * step - pickerAngle),
    )
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

/** Snap rotation so `focusedIndex` sits at the picker angle (home is index 0 at `homeAnchorAngle` when rotation is 0). */
export function loungeDockCarouselSnapRotation(focusedIndex, step, pickerAngle, homeAnchorAngle) {
  return pickerAngle - homeAnchorAngle - focusedIndex * step
}

function offsetOnScreen(fabCenterX, fabCenterY, offset, bounds) {
  const cx = fabCenterX + offset.x
  const cy = fabCenterY + offset.y
  return cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY
}

/**
 * Full ring: item 0 (home) starts at `loungeDockHomeAnchorAngle`, siblings follow clockwise.
 * Pass items with home first. `rotationRad` spins the whole wheel.
 */
export function loungeDockWheelLayout(
  fabCenterX,
  fabCenterY,
  itemCount,
  rotationRad,
  viewport,
  itemRadius,
) {
  if (itemCount <= 0) {
    return {
      offsets: [],
      radius: 0,
      pickerAngle: 0,
      focusedIndex: 0,
      step: 0,
      homeAnchorAngle: 0,
      spinEnabled: false,
    }
  }

  const bounds = fanBounds(viewport, itemRadius)
  const pickerAngle = loungeDockCarouselPickerAngle(fabCenterX, fabCenterY, bounds)
  const homeAnchorAngle = loungeDockHomeAnchorAngle(fabCenterX, viewport.width)
  const step = LOUNGE_DOCK_CAROUSEL_ITEM_STEP_RAD
  const radius = LOUNGE_DOCK_CAROUSEL_RADIUS_PX
  const offsets = []

  for (let i = 0; i < itemCount; i += 1) {
    const angle = homeAnchorAngle + rotationRad + i * step
    const o = { x: -Math.sin(angle) * radius, y: -Math.cos(angle) * radius, angle }
    offsets.push({ ...o, onScreen: offsetOnScreen(fabCenterX, fabCenterY, o, bounds) })
  }

  const focusedIndex = loungeDockCarouselFocusedIndex(
    itemCount,
    rotationRad,
    step,
    pickerAngle,
    homeAnchorAngle,
  )

  const spinEnabled = offsets.some((o) => !o.onScreen)

  return { offsets, radius, pickerAngle, focusedIndex, step, homeAnchorAngle, spinEnabled }
}

/** @deprecated Use loungeDockWheelLayout */
export function loungeDockMenuLayout(...args) {
  return loungeDockWheelLayout(...args)
}

/** @deprecated Use loungeDockWheelLayout */
export function loungeDockCarouselLayout(...args) {
  return loungeDockWheelLayout(...args)
}
