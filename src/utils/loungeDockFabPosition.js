/** @typedef {{ xPct: number, yPct: number, locked: boolean }} LoungeDockFabPrefs */

/** `'wheel'` = ring carousel (O); `'cornerL'` = bottom-corner L / Г. */
export const LOUNGE_DOCK_MENU_LAYOUT_KEY = 'loungeDockMenuLayout:v1'

/** One-time first menu open - user picked Wheel or Edge in the intro overlay. */
export const LOUNGE_DOCK_MENU_LAYOUT_INTRO_KEY = 'loungeDockMenuLayoutIntro:v1'

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
/** Wheel / compact home chip - same diameter as the FAB menu button. */
export const LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX = LOUNGE_DOCK_FAB_SIZE_PX
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
export function loungeDockFabMoveBounds(
  viewportW,
  viewportH,
  fabSize = LOUNGE_DOCK_FAB_SIZE_PX,
  bottomObstaclePx = 0,
) {
  const obstacle = Math.max(0, Number(bottomObstaclePx) || 0)
  const minLeft = EDGE_PAD_PX
  const minTop = EDGE_PAD_PX
  const maxLeft = Math.max(minLeft, viewportW - fabSize - EDGE_PAD_PX)
  const maxTop = Math.max(minTop, viewportH - fabSize - EDGE_PAD_PX - obstacle)
  return { minLeft, minTop, maxLeft, maxTop }
}

export function loungeDockFabClampToBounds(left, top, bounds) {
  return {
    left: clamp(left, bounds.minLeft, bounds.maxLeft),
    top: clamp(top, bounds.minTop, bounds.maxTop),
  }
}

export function loungeDockFabDefaultPosition(
  viewportW,
  viewportH,
  fabSize = LOUNGE_DOCK_FAB_SIZE_PX,
  bottomObstaclePx = 0,
) {
  const { maxLeft, maxTop } = loungeDockFabMoveBounds(viewportW, viewportH, fabSize, bottomObstaclePx)
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

/** Gap between L-mode chip centers (matches visual spacing of wheel items). */
const LOUNGE_DOCK_L_GAP_PX = 8

export function loungeDockLShapeStepPx() {
  return LOUNGE_DOCK_FAB_SIZE_PX + LOUNGE_DOCK_L_GAP_PX
}

/**
 * Snap FAB to bottom-left or bottom-right corner (vertex of the L).
 * @param {boolean} alignLeft - `true` → bottom-left, `false` → bottom-right
 * @param {{ raised?: boolean }} [options] - `raised: true` moves FAB up one L step (avoids iOS edge long-press).
 */
export function loungeDockFabCornerPosition(
  viewportW,
  viewportH,
  fabSize,
  alignLeft,
  bottomObstaclePx = 0,
  options = {},
) {
  const b = loungeDockFabMoveBounds(viewportW, viewportH, fabSize, bottomObstaclePx)
  const raised = Boolean(options?.raised)
  const stepUp = raised ? loungeDockLShapeStepPx() : 0
  return {
    left: alignLeft ? b.minLeft : b.maxLeft,
    top: b.maxTop - stepUp,
  }
}

/** First N dock items in Edge (L) order sit on the vertical leg (up from FAB). */
export const LOUNGE_DOCK_L_VERTICAL_ITEM_COUNT = 3

/**
 * Horizontal offset for home beside the FAB (one L step) - Wheel (O) panel chrome when menu is collapsed.
 */
export function loungeDockWheelCompactHomeOffset(fabCenterX, viewportW) {
  const alignLeft = fabCenterX < viewportW / 2
  const step = loungeDockLShapeStepPx()
  return { x: alignLeft ? step : -step, y: 0, onScreen: true }
}

/** Edge (L) panel chrome: home one step above the FAB (first vertical slot). */
export function loungeDockCornerLCompactHomeOffset() {
  const step = loungeDockLShapeStepPx()
  return { x: 0, y: -step, onScreen: true }
}

/** Compact idle pip diameter (matches `LoungeDockArcCarouselPrototype` FAB shrink). */
export const LOUNGE_DOCK_FAB_COMPACT_VISUAL_PX = 30

/**
 * Visual center of the scaled FAB pip (host uses bottom-left / bottom-right transform origin).
 * @param {{ left: number, top: number }} renderPos
 * @param {boolean} alignLeft
 */
export function loungeDockCompactPipFabVisualCenter(
  renderPos,
  alignLeft,
  fabSize = LOUNGE_DOCK_FAB_SIZE_PX,
  visualPx = LOUNGE_DOCK_FAB_COMPACT_VISUAL_PX,
) {
  const halfScaled = visualPx / 2
  if (alignLeft) {
    return {
      x: renderPos.left + halfScaled,
      y: renderPos.top + fabSize - halfScaled,
    }
  }
  return {
    x: renderPos.left + fabSize - halfScaled,
    y: renderPos.top + fabSize - halfScaled,
  }
}

/** Home chip beside compact pip - horizontal, same gap as full-size wheel compact. */
export function loungeDockCompactPipHomeOffset(
  alignLeft,
  visualPx = LOUNGE_DOCK_FAB_COMPACT_VISUAL_PX,
) {
  const centerDist = visualPx + LOUNGE_DOCK_L_GAP_PX
  return { x: alignLeft ? centerDist : -centerDist, y: 0, onScreen: true }
}

/**
 * L-shaped offsets from FAB center. Item order must be:
 * vertical leg (up): home → compose → following;
 * bottom leg (down one step, then along the edge): search under the FAB, then notifications → chat → settings.
 * Right corner: bottom leg runs −x; left corner: bottom leg runs +x.
 * @returns {{ x: number, y: number, onScreen: boolean }[]}
 */
export function loungeDockLShapeOffsets(itemCount, alignLeft) {
  if (itemCount <= 0) return []
  const step = loungeDockLShapeStepPx()
  const nVertical = Math.min(LOUNGE_DOCK_L_VERTICAL_ITEM_COUNT, itemCount)
  const bottomY = step
  const out = []
  for (let i = 0; i < itemCount; i += 1) {
    if (i < nVertical) {
      const k = i + 1
      out.push({ x: 0, y: -k * step, onScreen: true })
    } else {
      const k = i - nVertical + 1
      const x = k === 1 ? 0 : alignLeft ? (k - 1) * step : -(k - 1) * step
      out.push({ x, y: bottomY, onScreen: true })
    }
  }
  return out
}

/** @returns {'wheel' | 'cornerL'} */
export function readLoungeDockMenuLayout() {
  if (typeof window === 'undefined') return 'wheel'
  try {
    const v = window.localStorage.getItem(LOUNGE_DOCK_MENU_LAYOUT_KEY)
    /** First visit: persist Wheel (O) so new users match the default layout. */
    if (v == null) {
      writeLoungeDockMenuLayout('wheel')
      return 'wheel'
    }
    return v === 'cornerL' ? 'cornerL' : 'wheel'
  } catch {
    return 'wheel'
  }
}

/** @param {'wheel' | 'cornerL'} mode */
export function writeLoungeDockMenuLayout(mode) {
  if (typeof window === 'undefined') return
  try {
    const v = mode === 'cornerL' ? 'cornerL' : 'wheel'
    window.localStorage.setItem(LOUNGE_DOCK_MENU_LAYOUT_KEY, v)
    window.dispatchEvent(new Event('loungeDockMenuLayoutChange'))
  } catch {
    /* quota / private mode */
  }
}

export function readLoungeDockMenuLayoutIntroCompleted() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(LOUNGE_DOCK_MENU_LAYOUT_INTRO_KEY) === '1'
  } catch {
    return true
  }
}

export function writeLoungeDockMenuLayoutIntroCompleted() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOUNGE_DOCK_MENU_LAYOUT_INTRO_KEY, '1')
  } catch {
    /* quota / private mode */
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

/** FAB position + clamp bounds: layout viewport height (keyboard opening must not yank the menu). */
export function loungeDockLayoutViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 }
  }
  const vv = window.visualViewport
  return {
    width: vv?.width ?? window.innerWidth,
    height: window.innerHeight,
  }
}

/**
 * Mark on-screen UI (fixed or in-scroll) that should push the draggable menu up when it overlaps
 * the FAB horizontally. Not used on post/comment detail - FAB stacks above the reply composer there.
 */
export const LOUNGE_FAB_OBSTACLE_SELECTOR = '[data-lounge-fab-obstacle]'

function loungeFabRectsOverlapHorizontally(a, b) {
  return a.left < b.right - 1 && a.right > b.left + 1
}

function loungeFabRectsOverlapVertically(a, b, gap = 0) {
  return a.top < b.bottom + gap && a.bottom > b.top - gap
}

/**
 * Bottom inset (px) so a FAB at `fabRect` clears an on-screen obstacle (fixed or in-scroll).
 * @param {{ left: number, top: number, right: number, bottom: number }} fabRect
 * @param {DOMRect} obstacleRect
 * @param {number} viewportH
 * @param {number} [gap]
 */
export function loungeDockFabBottomInsetForObstacleRect(fabRect, obstacleRect, viewportH, gap = 10) {
  if (!loungeFabRectsOverlapHorizontally(fabRect, obstacleRect)) return 0
  if (!loungeFabRectsOverlapVertically(fabRect, obstacleRect, gap)) return 0
  const targetMaxFabBottom = obstacleRect.top - gap
  if (fabRect.bottom <= targetMaxFabBottom) return 0
  return Math.max(0, viewportH - obstacleRect.top + gap - EDGE_PAD_PX)
}

/**
 * Max bottom inset needed to clear all `[data-lounge-fab-obstacle]` nodes overlapping the FAB horizontally.
 * @param {{ left: number, top: number, right: number, bottom: number }} fabRect
 * @param {number} [viewportH]
 * @param {number} [gap]
 */
export function loungeDockFabCollisionBottomInsetPx(fabRect, viewportH, gap = 10) {
  if (typeof document === 'undefined') return 0
  const vh = viewportH ?? window.innerHeight
  let inset = 0
  document.querySelectorAll(LOUNGE_FAB_OBSTACLE_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.height < 2 || r.width < 2) return
    inset = Math.max(inset, loungeDockFabBottomInsetForObstacleRect(fabRect, r, vh, gap))
  })
  return inset
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

  /** If the corner lies outside [lo, hi], the wedge wraps through ±π - use the arc that contains it. */
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
 * @param {number} itemRadius - half of menu bubble diameter (px)
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

/** Picker notch direction (interior of screen from FAB) - spin aligns nearest item here on release. */
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
 * Full ring: item 0 (home) starts at `loungeDockHomeAnchorAngle`, siblings follow by index with step `step`
 * (positive when FAB is on the left half, negative on the right half so compose→…→notifications reads the
 * same screen-relative direction as on the left - ring radius is constant).
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
  const step =
    LOUNGE_DOCK_CAROUSEL_ITEM_STEP_RAD * (loungeDockFabOnLeftHalf(fabCenterX, viewport.width) ? 1 : -1)
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

  /** Spin stays available even when every chip fits on-screen (rotation is optional, not gated). */
  const spinEnabled = itemCount > 0

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
